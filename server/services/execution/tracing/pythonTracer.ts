import { TRACE_LIMITS } from '../../../../src/execution/trace';

/**
 * The Python tracer: a program sent to the execution provider in place of the user's, which runs the user's program
 * (embedded base64) under sys.settrace and prints the trace (src/execution/trace.ts) between two markers carrying a
 * per-run nonce. It runs only on the execution provider (the provider's sandbox is the isolation boundary); this
 * server never executes it. It targets Python 3.8 (Judge0 CE) and later.
 *
 *  - Only frames of the user's program are traced (its own code object filename); library code is not.
 *  - Values are encoded, never serialized as runtime objects: user __repr__/__getattribute__ are never called.
 *  - Every limit of TRACE_LIMITS is enforced while tracing; on a step, time or size limit the trace recorded so far
 *    is printed and the process ends at once (os._exit), so a runaway program still yields its trace.
 *  - The user's stdout/stderr are captured (bounded) and stdin is counted as it is read.
 * Output written around sys.stdout (os.write to fd 1) is not captured; the server ignores everything outside the
 * markers, and the nonce means a program cannot predict them.
 */
export const PYTHON_TRACER = String.raw`
import base64, json, os, sys, time, types

NONCE = "__NONCE__"
LIMITS = json.loads(base64.b64decode("__LIMITS__").decode("utf-8"))
SOURCE = base64.b64decode("__SOURCE__").decode("utf-8")
USER_FILE = "<main.py>"
TIME_BUDGET = float(LIMITS["timeBudgetSec"])

_real_write = os.write
_perf = time.perf_counter
_started = _perf()


class _Capture(object):
    """sys.stdout / sys.stderr for the user's program: keeps up to maxOutputChars"""
    encoding = "utf-8"
    errors = "strict"

    def __init__(self, tag):
        self.parts = []
        self.size = 0
        self.cut = False
        self.tag = tag

    def write(self, s):
        if not issubclass(type(s), str):
            raise TypeError("write() argument must be str, not " + type(s).__name__)
        room = LIMITS["maxOutputChars"] - self.size
        if len(s) > room:
            s = s[:max(room, 0)]
            self.cut = True
        if s:
            self.parts.append(s)
            self.size += len(s)
        return len(s)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        pass

    def isatty(self):
        return False

    def text(self):
        return "".join(self.parts)


class _Input(object):
    """sys.stdin for the user's program: reads the real stdin and counts what was read"""

    def __init__(self, real):
        self.real = real
        self.used = 0

    def _count(self, s):
        self.used += len(s)
        return s

    def read(self, n=-1):
        return self._count(self.real.read(n))

    def readline(self, n=-1):
        return self._count(self.real.readline(n))

    def readlines(self, hint=-1):
        lines = self.real.readlines(hint)
        for line in lines:
            self._count(line)
        return lines

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def isatty(self):
        return False

    def fileno(self):
        return self.real.fileno()


OUT = _Capture("stdout")
ERR = _Capture("stderr")
IN = _Input(sys.stdin)
truncated = set()


def _clip(text, limit):
    if len(text) > limit:
        truncated.add("values")
        return text[:limit] + "…"
    return text


class _Encoder(object):
    """encodes values as the trace's TraceValue / HeapObject (by type, without calling user code)"""

    def __init__(self):
        self.ids = {}
        self.keep = []
        self.sent = {}

    def ref_id(self, obj):
        key = id(obj)
        hid = self.ids.get(key)
        if hid is None:
            if len(self.ids) >= LIMITS["maxHeapObjects"]:
                return None
            hid = "h%d" % (len(self.ids) + 1)
            self.ids[key] = hid
            self.keep.append(obj)
        return hid

    def value(self, v, pending):
        t = type(v)
        if v is None:
            return {"kind": "none", "repr": "None"}
        if t is bool:
            return {"kind": "bool", "repr": "True" if v else "False"}
        if issubclass(t, int) and t.__module__ == "builtins":
            if v.bit_length() > 190:
                truncated.add("values")
                return {"kind": "int", "repr": "<int of about %d digits>" % int(v.bit_length() * 0.30103 + 1)}
            return {"kind": "int", "repr": int.__repr__(v)}
        if t is float:
            return {"kind": "float", "repr": float.__repr__(v)}
        if t is str:
            out = {"kind": "str", "repr": _clip(str.__repr__(v), LIMITS["maxReprChars"])}
            if len(v) > LIMITS["maxReprChars"]:
                out["length"] = len(v)
            return out
        if issubclass(t, (list, tuple, set, frozenset, dict)) or self._instance(v, t):
            hid = self.ref_id(v)
            if hid is None:
                truncated.add("heap")
                return {"kind": "other", "type": _clip(t.__name__, LIMITS["maxTypeChars"]), "repr": "(not traced: too many objects)"}
            pending.append(v)
            return {"kind": "ref", "id": hid}
        return {"kind": "other", "type": _clip(t.__name__, LIMITS["maxTypeChars"]), "repr": self._short(v, t)}

    @staticmethod
    def _instance(v, t):
        # an object of a class the program defined: its fields are shown (functions, classes and modules are not).
        # Types are checked with type() and issubclass only: isinstance() reads obj.__class__, which would run a
        # user-defined __getattribute__.
        if issubclass(t, _NOT_DATA):
            return False
        return t.__module__ == "__main__"

    @staticmethod
    def _short(v, t):
        if t.__module__ == "builtins" and t.__name__ in ("range", "complex", "bytes", "bytearray", "slice"):
            try:
                return _clip(repr(v), LIMITS["maxReprChars"])
            except Exception:
                pass
        if issubclass(t, (types.FunctionType, types.BuiltinFunctionType)):
            return "<function %s>" % _clip(str(v.__name__), LIMITS["maxNameChars"])
        return "<%s>" % _clip(t.__name__, LIMITS["maxTypeChars"])

    def heap_object(self, v, pending):
        t = type(v)
        tname = _clip(t.__name__, LIMITS["maxTypeChars"])
        limit = LIMITS["maxItems"]
        if issubclass(t, dict):
            items = list(dict.items(v))
            if len(items) > limit:
                truncated.add("items")
            return {"kind": "dict", "type": tname, "length": len(items),
                    "entries": [[self.value(k, pending), self.value(x, pending)] for k, x in items[:limit]]}
        if issubclass(t, (list, tuple, set, frozenset)):
            # the base type's own iterator, never an overridden __iter__
            base = list if issubclass(t, list) else tuple if issubclass(t, tuple) else set if issubclass(t, set) else frozenset
            seq = list(base.__iter__(v))
            if len(seq) > limit:
                truncated.add("items")
            kind = "list" if issubclass(t, list) else "tuple" if issubclass(t, tuple) else "set"
            return {"kind": kind, "type": tname, "length": len(seq), "items": [self.value(x, pending) for x in seq[:limit]]}
        fields = {}
        try:
            attrs = object.__getattribute__(v, "__dict__")
        except Exception:
            attrs = {}
        names = [n for n in dict.keys(attrs) if type(n) is str and not n.startswith("__")] if type(attrs) is dict else []
        slots = []
        for klass in t.__mro__:
            declared = klass.__dict__.get("__slots__", ())
            if type(declared) is str:
                declared = (declared,)
            if type(declared) not in (list, tuple):
                continue
            for slot in declared:
                if type(slot) is str and slot not in names and slot not in slots and not slot.startswith("__"):
                    slots.append(slot)
        for n in names + slots:
            if len(fields) >= LIMITS["maxNames"]:
                truncated.add("names")
                break
            try:
                x = attrs[n] if n in attrs else object.__getattribute__(v, n)
            except Exception:
                continue
            fields[_clip(n, LIMITS["maxNameChars"])] = self.value(x, pending)
        return {"kind": "object", "type": tname, "fields": fields}

    def changes(self, roots):
        """the objects reachable from roots whose encoding changed since they were last sent"""
        pending = list(roots)
        seen = set()
        out = {}
        while pending:
            v = pending.pop()
            hid = self.ids.get(id(v))
            if hid is None or hid in seen:
                continue
            seen.add(hid)
            enc = self.heap_object(v, pending)
            text = json.dumps(enc, sort_keys=True)
            if self.sent.get(hid) != text:
                self.sent[hid] = text
                out[hid] = enc
        return out


ENC = _Encoder()
steps = []
trace_chars = [0]
frame_ids = {}
raised_in = set()
user_module = types.ModuleType("__main__")
user_module.__dict__["__builtins__"] = __builtins__


_NOT_DATA = (types.FunctionType, types.BuiltinFunctionType, types.MethodType, types.ModuleType, type)


def _visible(name, v):
    if type(name) is not str or name.startswith("__") or name.startswith("."):
        return False
    return not issubclass(type(v), _NOT_DATA)


def _line(f):
    n = f.f_lineno
    return n if isinstance(n, int) and n >= 1 else f.f_code.co_firstlineno


def _frames(frame):
    # every frame of the program on the stack (library frames between them, e.g. sorted() calling a key, are skipped)
    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == USER_FILE:
            chain.append(f)
        f = f.f_back
    chain.reverse()
    omitted = max(0, len(chain) - LIMITS["maxFrames"])
    if omitted:
        truncated.add("frames")
        chain = chain[omitted:]
    return chain, omitted


def _record(frame, event, arg):
    if len(steps) >= LIMITS["maxSteps"]:
        _finish("step_limit")
    if _perf() - _started > TIME_BUDGET:
        _finish("time_limit")
    chain, omitted = _frames(frame)
    pending = []
    frames = []
    for f in chain:
        fid = frame_ids.get(f)
        if fid is None:
            fid = "f%d" % (len(frame_ids) + 1)
            frame_ids[f] = fid
        local_vars = {}
        for n, v in list(f.f_locals.items()):
            if not _visible(n, v):
                continue
            if len(local_vars) >= LIMITS["maxNames"]:
                truncated.add("names")
                break
            local_vars[_clip(n, LIMITS["maxNameChars"])] = ENC.value(v, pending)
        name = f.f_code.co_name
        frames.append({"id": fid, "name": "<module>" if name == "<module>" else _clip(name, LIMITS["maxNameChars"]),
                       "line": _line(f), "locals": local_vars})
    step = {"index": len(steps), "line": _line(frame), "event": event, "frames": frames,
            "stdoutLength": OUT.size, "stdinConsumed": IN.used}
    if omitted:
        step["framesOmitted"] = omitted
    if event == "return" and frame not in raised_in:
        step["returnValue"] = ENC.value(arg, pending)
    if event == "exception":
        step["exception"] = {"type": _clip(arg[0].__name__, LIMITS["maxTypeChars"]), "message": _clip(_message(arg[1]), LIMITS["maxMessageChars"])}
    heap = ENC.changes(pending)
    if heap:
        step["heap"] = heap
    text = json.dumps(step, ensure_ascii=True, separators=(",", ":"))
    if trace_chars[0] + len(text) + 4096 > LIMITS["maxTraceChars"]:
        _finish("size_limit")
    trace_chars[0] += len(text) + 1
    steps.append(text)


def _message(exc):
    try:
        return BaseException.__str__(exc)
    except Exception:
        return ""


def _local(frame, event, arg):
    if event == "line":
        raised_in.discard(frame)
        _record(frame, "line", arg)
    elif event == "return":
        if frame.f_code.co_name != "<module>":
            _record(frame, "return", arg)
        raised_in.discard(frame)
        frame_ids.pop(frame, None)
    elif event == "exception":
        raised_in.add(frame)
        _record(frame, "exception", arg)
    return _local


def _global(frame, event, arg):
    if frame.f_code.co_filename != USER_FILE:
        return None
    if frame.f_code.co_name != "<module>":
        _record(frame, "call", arg)
    return _local


def _emit(payload):
    data = ("\nAFTRACE-%s-BEGIN\n%s\nAFTRACE-%s-END\n" % (NONCE, payload, NONCE)).encode("utf-8")
    while data:
        n = _real_write(1, data)
        data = data[n:]


def _finish(status, exit_code=None, error=None):
    sys.settrace(None)
    if OUT.cut:
        truncated.add("stdout")
    if ERR.cut:
        truncated.add("stderr")
    head = {"version": 1, "language": "python", "provenance": "runtime",
            "runtime": "Python %d.%d.%d" % sys.version_info[:3], "status": status, "exitCode": exit_code,
            "error": error, "stdout": OUT.text(), "stderr": ERR.text(), "truncated": sorted(truncated)}
    text = json.dumps(head, ensure_ascii=True, separators=(",", ":"))
    _emit(text[:-1] + ',"steps":[' + ",".join(steps) + "]}")
    os._exit(0)


def _traceback_text(tb, exc):
    lines = SOURCE.split("\n")
    out = ["Traceback (most recent call last):"]
    last = None
    while tb is not None:
        code = tb.tb_frame.f_code
        if code.co_filename == USER_FILE:
            n = tb.tb_lineno
            last = n
            out.append('  File "main.py", line %d, in %s' % (n, code.co_name))
            if 1 <= n <= len(lines) and lines[n - 1].strip():
                out.append("    " + lines[n - 1].strip())
        tb = tb.tb_next
    msg = _message(exc)
    out.append(type(exc).__name__ + (": " + msg if msg else ""))
    return "\n".join(out) + "\n", last


def _arm_timer():
    # a real-time timer ends long stretches that fire no trace events (e.g. a loop inside a library call) with the
    # trace so far; where setitimer does not exist (Windows), the per-step time check still applies
    try:
        import signal
        signal.signal(signal.SIGALRM, lambda *_: _finish("time_limit"))
        signal.setitimer(signal.ITIMER_REAL, TIME_BUDGET + 0.3)
    except Exception:
        pass


def _main():
    try:
        code = compile(SOURCE, USER_FILE, "exec")
    except SyntaxError as e:
        line = e.lineno if isinstance(e.lineno, int) and e.lineno >= 1 else None
        if line is not None and line > len(SOURCE.split("\n")):
            line = None
        ERR.write("SyntaxError: %s (line %s)\n" % (e.msg, line if line is not None else "?"))
        _finish("syntax_error", None, {"type": "SyntaxError", "message": _clip(str(e.msg), LIMITS["maxMessageChars"]), "line": line})
    _arm_timer()
    real_main = sys.modules.get("__main__")
    sys.modules["__main__"] = user_module
    sys.stdout, sys.stderr, sys.stdin = OUT, ERR, IN
    try:
        sys.settrace(_global)
        exec(code, user_module.__dict__)
        sys.settrace(None)
    except SystemExit as e:
        sys.settrace(None)
        c = e.code
        if c is None:
            status_code = 0
        elif type(c) is int:
            status_code = c
        else:
            ERR.write((c if type(c) is str else "<exit value of type %s>" % type(c).__name__) + "\n")
            status_code = 1
        _finish("completed", status_code)
    except BaseException as e:
        sys.settrace(None)
        text, line = _traceback_text(e.__traceback__, e)
        ERR.write(text)
        _finish("exception", 1, {"type": _clip(type(e).__name__, LIMITS["maxTypeChars"]),
                                 "message": _clip(_message(e), LIMITS["maxMessageChars"]), "line": line})
    finally:
        sys.modules["__main__"] = real_main
    _finish("completed", 0)


_main()
`;

/** tracer limits: the trace's own limits, plus the time budget (below the provider's 2 s CPU limit) */
export const TRACER_LIMITS = { ...TRACE_LIMITS, timeBudgetSec: 1.5 };

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** the program to run in place of the user's: the tracer with their source, the nonce and the limits filled in */
export function buildPythonTraceProgram(source: string, nonce: string): string {
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error('nonce must be 32 hex characters');
  return PYTHON_TRACER.replace('__NONCE__', nonce)
    .replace('__LIMITS__', b64(JSON.stringify(TRACER_LIMITS)))
    .replace('__SOURCE__', b64(source));
}

export type ExtractedTrace = { kind: 'found'; json: string } | { kind: 'missing' } | { kind: 'incomplete' };

/** the trace between this run's markers in the provider's stdout; anything else in stdout is ignored */
export function extractTrace(stdout: string, nonce: string): ExtractedTrace {
  const begin = `AFTRACE-${nonce}-BEGIN\n`;
  const end = `\nAFTRACE-${nonce}-END`;
  const start = stdout.indexOf(begin);
  if (start < 0) return { kind: 'missing' };
  const stop = stdout.indexOf(end, start + begin.length);
  if (stop < 0) return { kind: 'incomplete' };
  return { kind: 'found', json: stdout.slice(start + begin.length, stop) };
}
