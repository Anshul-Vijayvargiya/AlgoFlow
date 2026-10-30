import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionProviderError, type ExecutionProvider, type ExecutionRequest, type ExecutionResult, type LanguageInfo } from './types';

/**
 * Local Python execution, for DEVELOPMENT only (EXECUTION_PROVIDER=local; refused in staging and production by
 * server/config/env.ts). Python only: C, C++ and Java are not offered.
 *
 * Every run is a separate `python -I -S -B` process — never the server process — started by RUNNER, which applies
 * limits before the program runs:
 *  - the OS: on Windows a job object (memory, CPU time, a single process: no child processes, no UI access, and
 *    everything is killed when the run ends); elsewhere setrlimit (address space, CPU, file size, core dumps);
 *  - Python: an audit hook (PEP 578) denying file writes, file reads outside the Python standard library, sockets,
 *    subprocesses, ctypes, the registry and similar.
 * The server adds a wall-clock limit (the process is killed), output caps, a fresh empty working directory (deleted
 * afterwards), an almost empty environment (no server secrets) and a cap on simultaneous runs.
 *
 * LIMITATION: Python's documentation says audit hooks are not a sandbox: a determined program can get around the
 * Python-level file and network blocking (the OS-level resource limits are what holds). That is acceptable for a
 * developer running their own code on their own machine, and is why this provider is refused in staging/production;
 * running untrusted users' code needs OS-level isolation (a container, nsjail, gVisor…) instead.
 */

export const LOCAL_PYTHON_LIMITS = {
  /** wall clock, enforced by the server (the run is killed and reported as a timeout) */
  wallTimeMs: 5_000,
  /** CPU seconds, enforced by the OS (all threads together); above the wall limit, so a busy loop is a timeout */
  cpuTimeSec: 10,
  /** memory, enforced by the OS */
  memoryBytes: 256 * 1024 * 1024,
  /** stdout kept; beyond it the run is killed (a trace is at most TRACE_LIMITS.maxTraceChars plus its markers) */
  stdoutMaxBytes: 2 * 1024 * 1024,
  stderrMaxBytes: 64 * 1024,
  /** runs at the same time, all users together; more are refused as busy (and not charged) */
  maxConcurrent: 2,
} as const;

export type LocalPythonLimits = { [K in keyof typeof LOCAL_PYTHON_LIMITS]: number };

/** printed by RUNNER (and only by it) when the limits could not be applied; the program is then not run */
export const SANDBOX_FAILED_MARKER = 'AFSANDBOX-SETUP-FAILED';
const SANDBOX_FAILED_EXIT = 70;

/**
 * The runner: `python -I -S -B -X utf8 runner.py program.py`. Applies the limits, reads the program, installs the
 * audit hook, then runs the program as __main__ with tracebacks naming main.py. Placeholders: __LIMITS__.
 */
export const RUNNER = String.raw`
import os, sys
_L = __LIMITS__
_RUNNER = os.path.abspath(__file__)
# LF line endings on every platform (Windows text mode would write CRLF), as on a Linux judge
sys.stdout.reconfigure(newline="\n")
sys.stderr.reconfigure(newline="\n")

def _fail(why):
    sys.stderr.write("${SANDBOX_FAILED_MARKER}: " + why + "\n")
    sys.stderr.flush()
    os._exit(${SANDBOX_FAILED_EXIT})

def _limit_windows():
    import ctypes
    from ctypes import wintypes
    class BASIC(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                    ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]
    class IO(ctypes.Structure):
        _fields_ = [(n, ctypes.c_ulonglong) for n in ("R", "W", "O", "RB", "WB", "OB")]
    class EXTENDED(ctypes.Structure):
        _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]
    class UI(ctypes.Structure):
        _fields_ = [("UIRestrictionsClass", wintypes.DWORD)]
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateJobObjectW.restype = wintypes.HANDLE
    k.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    k.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k.GetCurrentProcess.restype = wintypes.HANDLE
    k.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    job = k.CreateJobObjectW(None, None)
    if not job:
        _fail("CreateJobObject")
    info = EXTENDED()
    # PROCESS_TIME | ACTIVE_PROCESS | PROCESS_MEMORY | DIE_ON_UNHANDLED_EXCEPTION | KILL_ON_JOB_CLOSE
    info.Basic.LimitFlags = 0x2 | 0x8 | 0x100 | 0x400 | 0x2000
    info.Basic.PerProcessUserTimeLimit = _L["cpu"] * 10000000
    info.Basic.ActiveProcessLimit = 1
    info.ProcessMemoryLimit = _L["memory"]
    if not k.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
        _fail("SetInformationJobObject(limits)")
    ui = UI(0xFF)  # every UI restriction: desktop, display settings, exit Windows, global atoms, handles, clipboard
    if not k.SetInformationJobObject(job, 4, ctypes.byref(ui), ctypes.sizeof(ui)):
        _fail("SetInformationJobObject(ui)")
    if not k.AssignProcessToJobObject(job, k.GetCurrentProcess()):
        _fail("AssignProcessToJobObject")
    # the job handle stays open (never closed) until the process ends; then KILL_ON_JOB_CLOSE ends the job

def _limit_posix():
    import resource
    for res, value in ((resource.RLIMIT_AS, _L["memory"]), (resource.RLIMIT_CPU, _L["cpu"]),
                       (resource.RLIMIT_FSIZE, 0), (resource.RLIMIT_CORE, 0)):
        resource.setrlimit(res, (value, value))

try:
    _limit_windows() if os.name == "nt" else _limit_posix()
except Exception as e:
    _fail(type(e).__name__)

with open(sys.argv[1], encoding="utf-8") as f:
    _src = f.read()
_code = compile(_src, "main.py", "exec")
import builtins, linecache, traceback, types
linecache.cache["main.py"] = (len(_src), None, _src.splitlines(True), "main.py")

# ctypes was needed only for the job object: drop it so the program cannot reach it again (re-importing is denied)
for _m in [m for m in sys.modules if m == "ctypes" or m.startswith("ctypes.") or m == "_ctypes"]:
    del sys.modules[_m]

def _make_hook():
    # everything the hook uses is captured here, so a program changing module attributes cannot change it
    realpath, normcase, fspath, sep = os.path.realpath, os.path.normcase, os.fspath, os.sep
    roots = tuple(sorted({normcase(realpath(p)) for p in (sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix,
                                                         os.path.dirname(os.__file__))}))
    write = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC
    denied_events = frozenset(("os.system", "os.startfile", "os.kill", "os.killpg", "os.fork", "os.forkpty", "os.chdir",
        "os.putenv", "os.unsetenv", "os.remove", "os.rename", "os.rmdir", "os.mkdir", "os.chmod", "os.chown", "os.truncate",
        "os.symlink", "os.link", "os.utime", "os.posix_spawn", "subprocess.Popen", "mmap.__new__", "webbrowser.open",
        "resource.setrlimit", "resource.prlimit", "gc.get_objects", "gc.get_referrers", "gc.get_referents", "sys.setprofile",
        "urllib.Request", "ftplib.connect", "http.client.connect", "smtplib.connect", "imaplib.open", "poplib.connect",
        "telnetlib.Telnet.open", "sqlite3.connect", "shutil.copyfile", "shutil.copymode", "shutil.copystat",
        "shutil.copytree", "shutil.move", "shutil.rmtree", "shutil.make_archive", "shutil.unpack_archive"))
    denied_prefixes = ("os.exec", "os.spawn", "socket.", "ctypes.", "_winapi.", "winreg.", "msvcrt.", "_posixsubprocess.")
    # only the blocked modules this Python has: a missing one (e.g. _winapi on Linux) fails as usual with
    # ModuleNotFoundError, so the standard library's optional imports (try: import _winapi / except ImportError, as in
    # Python 3.14's pathlib) keep working. A program cannot add a module (it cannot write files), so nothing opens up.
    import importlib.util
    def installed(name):
        if name in sys.modules:
            return True
        try:
            return importlib.util.find_spec(name) is not None
        except Exception:
            return True  # unknown: keep it blocked
    denied_imports = frozenset(n for n in ("ctypes", "_ctypes", "_winapi", "winreg", "msvcrt", "_posixsubprocess", "_overlapped", "mmap")
                               if installed(n))
    deny = PermissionError

    def readable(path):
        p = normcase(realpath(fspath(path)))
        for r in roots:
            if p == r or p.startswith(r + sep):
                return True
        return False

    def hook(event, args):
        if event == "open":
            path, mode, flags = args
            if isinstance(path, int):
                return
            if (mode is not None and any(c in mode for c in "wax+")) or (flags or 0) & write:
                raise deny("Writing files is not allowed here.")
            if not readable(path):
                raise deny("Reading files outside the Python standard library is not allowed here.")
        elif event in ("os.listdir", "os.scandir"):
            if args and args[0] is not None and not readable(args[0]):
                raise deny("Listing folders is not allowed here.")
        elif event == "import":
            if args[0].split(".")[0] in denied_imports:
                raise deny("Importing " + args[0] + " is not allowed here.")
        elif event in denied_events or event.startswith(denied_prefixes):
            raise deny("Not allowed here: " + event)
    return hook

sys.addaudithook(_make_hook())
del _make_hook, _limit_windows, _limit_posix

_main = types.ModuleType("__main__")
_main.__builtins__ = builtins
sys.modules["__main__"] = _main
sys.argv = ["main.py"]
try:
    exec(_code, _main.__dict__)
except SystemExit:
    raise
except BaseException as e:
    sys.stdout.flush()
    # the program's frames only, not the runner's (its exec, or the audit hook that refused something)
    _te = traceback.TracebackException(type(e), e, e.__traceback__.tb_next)
    _te.stack = traceback.StackSummary.from_list([f for f in _te.stack if f.filename != _RUNNER])
    sys.stderr.write("".join(_te.format()))
    sys.stderr.flush()
    sys.exit(1)
`;

export function buildRunner(): string {
  const limits = JSON.stringify({ cpu: LOCAL_PYTHON_LIMITS.cpuTimeSec, memory: LOCAL_PYTHON_LIMITS.memoryBytes });
  return RUNNER.replace('__LIMITS__', limits);
}

interface Interpreter {
  executable: string;
  version: string;
}

/** finds the interpreter once: its absolute path (the run itself gets no PATH) and version; Python 3.8+ (audit hooks) */
export function findPython(command: string): Interpreter | { error: string } {
  const r = spawnSync(command, ['-I', '-c', 'import sys; print(sys.executable); print("%d.%d.%d" % sys.version_info[:3]); print(sys.version_info >= (3, 8))'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (r.error || r.status !== 0) return { error: `"${command}" could not be started` };
  const [executable, version, recent] = r.stdout.trim().split(/\r?\n/);
  if (recent !== 'True') return { error: `Python ${version} is too old (3.8 or later is needed)` };
  return { executable, version };
}

/** the environment of a run: only what the interpreter needs to start, nothing from the server's environment */
function runEnvironment(): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return { LANG: 'C.UTF-8' };
  const keep: NodeJS.ProcessEnv = {};
  for (const key of ['SYSTEMROOT', 'SystemRoot', 'WINDIR']) if (process.env[key]) keep[key] = process.env[key];
  return keep;
}

export class LocalPythonProvider implements ExecutionProvider {
  readonly name = 'local' as const;
  private readonly interpreter: Interpreter | { error: string };
  private running = 0;

  constructor(pythonCommand: string, private readonly limits: LocalPythonLimits = LOCAL_PYTHON_LIMITS) {
    this.interpreter = findPython(pythonCommand);
  }

  languages(): LanguageInfo[] {
    const version = 'version' in this.interpreter ? ` ${this.interpreter.version}` : '';
    return [{ id: 'python', label: `Python${version} (local)` }];
  }

  async execute({ language, source, stdin }: ExecutionRequest): Promise<ExecutionResult> {
    if (language !== 'python') throw new ExecutionProviderError('misconfigured', `The local provider runs Python only, not ${language}.`, false);
    if ('error' in this.interpreter) throw new ExecutionProviderError('misconfigured', `Local Python is not available: ${this.interpreter.error}. Set LOCAL_PYTHON_PATH.`, false);
    if (this.running >= this.limits.maxConcurrent) throw new ExecutionProviderError('busy', 'The local runner is busy.', false);
    this.running++;
    const dir = mkdtempSync(join(tmpdir(), 'algoflow-run-'));
    try {
      writeFileSync(join(dir, 'runner.py'), buildRunner());
      writeFileSync(join(dir, 'program.py'), source);
      return await this.run(this.interpreter.executable, dir, stdin);
    } finally {
      this.running--;
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  private run(executable: string, dir: string, stdin: string): Promise<ExecutionResult> {
    const { wallTimeMs, stdoutMaxBytes, stderrMaxBytes } = this.limits;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn(executable, ['-I', '-S', '-B', '-X', 'utf8', join(dir, 'runner.py'), join(dir, 'program.py')], {
        cwd: dir,
        env: runEnvironment(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let outBytes = 0;
      let errBytes = 0;
      let timedOut = false;
      let outputLimit = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, wallTimeMs);

      child.stdout.on('data', (chunk: Buffer) => {
        if (outBytes + chunk.length > stdoutMaxBytes) {
          out.push(chunk.subarray(0, stdoutMaxBytes - outBytes));
          outBytes = stdoutMaxBytes;
          outputLimit = true;
          child.kill('SIGKILL');
          return;
        }
        out.push(chunk);
        outBytes += chunk.length;
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (errBytes >= stderrMaxBytes) return;
        const part = chunk.subarray(0, stderrMaxBytes - errBytes);
        err.push(part);
        errBytes += part.length;
      });
      // the program may exit (or be killed) before reading its input
      child.stdin.on('error', () => {});
      child.stdin.end(stdin);

      child.on('error', e => {
        clearTimeout(timer);
        reject(new ExecutionProviderError('misconfigured', `Local Python could not be started (${e.message}).`, false));
      });
      child.on('close', code => {
        clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        let stderr = Buffer.concat(err).toString('utf8');
        const base = { stdout, compileOutput: '', exitCode: code, exitSignal: null, timeMs: Date.now() - started, memoryKb: null };
        if (code === SANDBOX_FAILED_EXIT && stderr.startsWith(SANDBOX_FAILED_MARKER)) {
          // the limits could not be applied, so the program was not run
          console.error(`[execution] local: ${stderr.trim()}`);
          return reject(new ExecutionProviderError('unavailable', 'The local runner could not apply its limits.', false));
        }
        if (timedOut) return resolve({ ...base, stderr, status: 'timeout', exitCode: null });
        if (outputLimit) stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}Stopped: the program's output passed the ${stdoutMaxBytes / 1024 / 1024} MB limit.\n`;
        resolve({ ...base, stderr, status: code === 0 && !outputLimit ? 'success' : 'runtime_error' });
      });
    });
  }
}
