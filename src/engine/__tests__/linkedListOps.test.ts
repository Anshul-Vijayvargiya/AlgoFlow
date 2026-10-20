import { describe, it, expect } from 'vitest';
import type { AlgorithmDefinition, ExecutionStep } from '../../types/algorithm';
import { resolveCodeRange, resolveCodeRef } from '../AlgorithmRegistry';
import { buildExecution } from '../buildExecution';
import { LANGUAGES, codeLines, def, listAlgorithms, makeRng } from './testUtils';
import { expectValidListTrace } from './linkedListInvariants';

const OPS = ['ll-traverse', 'll-search', 'll-insert-head', 'll-insert-tail', 'll-delete-head', 'll-delete-tail'] as const;
type Op = (typeof OPS)[number];
const run = (id: Op, input: number[], value?: number) => def(id).generateSteps([...input], value === undefined ? undefined : { value });

/** Lists with duplicates and negatives, 0..9 nodes (so every operation, including inserts, accepts them). */
function randomLists(count: number, seed: number): number[][] {
  const rnd = makeRng(seed);
  return Array.from({ length: count }, () => Array.from({ length: Math.floor(rnd() * 10) }, () => Math.floor(rnd() * 13) - 6));
}
const LISTS: number[][] = [[], [5], [5, 5], [1, 2], [3, 3, 1, 3], [-4, 0, -4], [4, 7, 9, 3, 8, 1, 2, 6, 0], ...randomLists(60, 404)];
const VALUES = [undefined, 0, -4, 3, 99];

/** "codeRef" or "codeRef:true/false" for every step: the exact execution order. */
const shape = (steps: ExecutionStep[]) => steps.map(s => (s.result ? `${s.codeRef}:${s.result}` : String(s.codeRef)));
const repeat = <T,>(n: number, items: T[]) => Array.from({ length: Math.max(0, n) }, () => items).flat();
/** "codeRef:kind" for every step that changed a link, HEAD or TAIL. */
const changes = (steps: ExecutionStep[]) => steps.filter(s => s.list?.changed).map(s => `${s.codeRef}:${s.list!.changed!.kind}`);
const final = (steps: ExecutionStep[]) => steps[steps.length - 1];

describe('linked-list operations — shared invariants on every trace', () => {
  it('exactly the ten linked-list operations are registered as linked lists (Detect Cycle and Merge are not)', () => {
    const PHASE_3 = ['ll-build', 'll-insert-at', 'll-delete-at', 'reverse-linked-list'];
    expect(listAlgorithms().map(d => d.id).sort()).toEqual([...OPS, ...PHASE_3].sort());
  });

  for (const id of OPS) {
    it(`${id}: every trace is valid (frozen snapshots, stable ends, state = list from HEAD, one exact change per step)`, () => {
      for (const input of LISTS) {
        for (const value of VALUES) {
          const steps = run(id, input, value);
          expectValidListTrace(steps, `${id} ${JSON.stringify(input)} value=${value}`);
          expect(steps[0].type).toBe('init');
          expect(final(steps).type).toBe('complete');
          expect(steps[0].list!.pointers).toEqual({});
          expect(final(steps).list!.pointers).toEqual({});
          for (const s of steps) {
            for (const i of s.indices ?? []) expect(i >= 0 && i < s.state.length, `${id} step ${s.id} index ${i}`).toBe(true);
            expect(`${s.message} ${s.explanation ?? ''}`).not.toMatch(/undefined|NaN/);
          }
        }
      }
    });

    it(`${id}: never mutates the caller's array and keeps node ids stable from the initial list`, () => {
      const input = [4, 7, 4];
      const steps = def(id).generateSteps(input, { value: 1 });
      expect(input).toEqual([4, 7, 4]);
      expect(steps[0].list!.nodes.map(n => n.id)).toEqual(['n1', 'n2', 'n3']);
    });
  }

  it('a null value is rejected by the operations that take one; buildExecution reports it safely', () => {
    for (const id of ['ll-search', 'll-insert-head', 'll-insert-tail'] as const) {
      expect(() => def(id).generateSteps([1, 2], { value: null })).toThrow(TypeError);
      const r = buildExecution(id, [1, 2], undefined, { value: null });
      expect(r.status).toBe('generator-error');
      expect(r.steps).toEqual([]);
    }
  });
});

describe('Traverse', () => {
  it('visits every node in order: one TRUE check, visit and advance per node, then the final FALSE', () => {
    for (const input of LISTS) {
      const steps = run('ll-traverse', input);
      expect(shape(steps)).toEqual(['fn-entry', 'set-curr', ...repeat(input.length, ['loop:true', 'visit', 'advance']), 'loop:false', 'fn-entry']);
      expect(steps.filter(s => s.codeRef === 'visit').map(s => s.variables!['curr.data'])).toEqual(input);
      expect(final(steps).state).toEqual(input);
      expect(changes(steps)).toEqual([]);
    }
  });

  it('curr walks the nodes in order and ends as NULL', () => {
    const steps = run('ll-traverse', [4, 7, 4]);
    const currs = steps.filter(s => s.codeRef === 'loop').map(s => s.list!.pointers.curr);
    expect(currs).toEqual(['n1', 'n2', 'n3', null]);
  });
});

describe('Search', () => {
  const expected = (input: number[], v: number) => {
    const k = input.indexOf(v);
    const misses = k >= 0 ? k : input.length;
    return [
      'fn-entry', 'set-curr', 'set-index',
      ...repeat(misses, ['loop:true', 'check-match:false', 'advance', 'inc-index']),
      ...(k >= 0 ? ['loop:true', 'check-match:true', 'return-index'] : ['loop:false', 'return-none']),
      'fn-entry',
    ];
  };

  it('returns the FIRST matching position (duplicates), or -1 after the final FALSE check', () => {
    for (const input of LISTS) {
      for (const v of [0, -4, 3, 5, 99]) {
        const steps = run('ll-search', input, v);
        expect(shape(steps), `${JSON.stringify(input)} search ${v}`).toEqual(expected(input, v));
        const k = input.indexOf(v);
        expect(steps[steps.length - 2].type).toBe(k >= 0 ? 'found' : 'not-found');
        expect(final(steps).variables!.result).toBe(k);
        if (k >= 0) expect(steps.find(s => s.type === 'found')!.indices).toEqual([k]);
        expect(final(steps).state).toEqual(input);
        expect(changes(steps)).toEqual([]);
      }
    }
  });

  it('compares the current node with the value (explicit TRUE/FALSE with comparedValues)', () => {
    const steps = run('ll-search', [3, 3, 1, 3], 1);
    expect(steps.filter(s => s.codeRef === 'check-match').map(s => [s.comparedValues, s.result])).toEqual([
      [{ val1: 3, val2: 1 }, 'false'],
      [{ val1: 3, val2: 1 }, 'false'],
      [{ val1: 1, val2: 1 }, 'true'],
    ]);
  });

  it('uses the default value 7 when none is passed', () => {
    expect(run('ll-search', [4, 7, 1, 7, 9])[0].variables!.value).toBe(7);
  });
});

describe('Insert at Head', () => {
  it('links the new node in front, moves HEAD, and sets TAIL only for an empty list', () => {
    for (const input of LISTS) {
      const steps = run('ll-insert-head', input, 8);
      const empty = input.length === 0;
      expect(shape(steps)).toEqual(['fn-entry', 'create-node', 'link-node', 'set-head', empty ? 'check-tail:true' : 'check-tail:false', ...(empty ? ['set-tail'] : []), 'fn-entry']);
      expect(final(steps).state).toEqual([8, ...input]);
      // node.next = head changes nothing on an empty list (NULL = NULL)
      expect(changes(steps)).toEqual(empty ? ['set-head:head', 'set-tail:tail'] : ['link-node:next', 'set-head:head']);
      const newId = `n${input.length + 1}`;
      expect(final(steps).list!.head).toBe(newId);
      expect(final(steps).list!.tail).toBe(empty ? newId : `n${input.length}`);
    }
  });

  it('the new node is outside the list until HEAD points to it', () => {
    const steps = run('ll-insert-head', [4, 7], 8);
    const at = (ref: string) => steps.find(s => s.codeRef === ref)!.list!;
    expect(at('create-node').detached).toEqual(['n3']);
    expect(at('create-node').nodes.find(n => n.id === 'n3')!.next).toBeNull();
    expect(at('link-node').detached).toEqual(['n3']);
    expect(at('link-node').head).toBe('n1');
    expect(at('set-head').detached).toEqual([]);
    expect(at('set-head').head).toBe('n3');
  });
});

describe('Insert at Tail', () => {
  it('appends through TAIL in O(1); an empty list gets the node as HEAD and TAIL', () => {
    for (const input of LISTS) {
      const steps = run('ll-insert-tail', input, 8);
      const empty = input.length === 0;
      expect(shape(steps)).toEqual(
        empty
          ? ['fn-entry', 'create-node', 'check-empty:true', 'set-head-empty', 'set-tail-empty', 'fn-entry']
          : ['fn-entry', 'create-node', 'check-empty:false', 'link-tail', 'set-tail', 'fn-entry']
      );
      expect(final(steps).state).toEqual([...input, 8]);
      expect(changes(steps)).toEqual(empty ? ['set-head-empty:head', 'set-tail-empty:tail'] : ['link-tail:next', 'set-tail:tail']);
      const newId = `n${input.length + 1}`;
      expect(final(steps).list!.tail).toBe(newId);
      expect(final(steps).list!.head).toBe(empty ? newId : 'n1');
      // no traversal: no step looks at more than the tail and the new node
      expect(steps.some(s => s.codeRef === 'loop')).toBe(false);
    }
  });

  it('HEAD is set before TAIL on an empty list (one statement each; they agree again at the end)', () => {
    const steps = run('ll-insert-tail', [], 8);
    const mid = steps.find(s => s.codeRef === 'set-head-empty')!.list!;
    expect([mid.head, mid.tail]).toEqual(['n1', null]);
    expect([final(steps).list!.head, final(steps).list!.tail]).toEqual(['n1', 'n1']);
  });
});

describe('Delete at Head', () => {
  it('moves HEAD forward, clears TAIL when the list empties, then releases the node; an empty list returns', () => {
    for (const input of LISTS) {
      const steps = run('ll-delete-head', input);
      const n = input.length;
      expect(shape(steps)).toEqual(
        n === 0
          ? ['fn-entry', 'check-empty:true', 'return-empty', 'fn-entry']
          : ['fn-entry', 'check-empty:false', 'set-temp', 'advance-head', ...(n === 1 ? ['check-last:true', 'clear-tail'] : ['check-last:false']), 'release', 'fn-entry']
      );
      expect(final(steps).state).toEqual(input.slice(1));
      expect(changes(steps)).toEqual(n === 0 ? [] : n === 1 ? ['advance-head:head', 'clear-tail:tail'] : ['advance-head:head']);
    }
  });

  it('memory: the old head is unlinked (detached), then released exactly at the release step; its id never returns', () => {
    const steps = run('ll-delete-head', [4, 7, 9]);
    const k = steps.findIndex(s => s.codeRef === 'release');
    const before = steps[k - 1].list!;
    expect(before.detached).toEqual(['n1']);
    expect(before.pointers.temp).toBe('n1');
    expect(before.nodes.map(n => n.id)).toContain('n1');
    for (const s of steps.slice(k)) {
      expect(s.list!.nodes.map(n => n.id)).not.toContain('n1');
      expect(Object.values(s.list!.pointers)).not.toContain('n1');
    }
    expect(steps[k].variables!.released).toBe(4);
  });
});

describe('Delete at Tail', () => {
  it('walks prev to the node before TAIL (final FALSE check), unlinks, moves TAIL back, then releases', () => {
    for (const input of LISTS) {
      const steps = run('ll-delete-tail', input);
      const n = input.length;
      const expected =
        n === 0
          ? ['fn-entry', 'check-empty:true', 'return-empty', 'fn-entry']
          : n === 1
            ? ['fn-entry', 'check-empty:false', 'check-single:true', 'single-temp', 'single-clear-head', 'single-clear-tail', 'single-release', 'single-return', 'fn-entry']
            : ['fn-entry', 'check-empty:false', 'check-single:false', 'set-prev', ...repeat(n - 2, ['loop:true', 'advance-prev']), 'loop:false', 'set-temp', 'unlink', 'set-tail', 'release', 'fn-entry'];
      expect(shape(steps), JSON.stringify(input)).toEqual(expected);
      expect(final(steps).state).toEqual(input.slice(0, -1));
      expect(changes(steps)).toEqual(n === 0 ? [] : n === 1 ? ['single-clear-head:head', 'single-clear-tail:tail'] : ['unlink:next', 'set-tail:tail']);
      if (n >= 2) expect(final(steps).list!.tail).toBe(`n${n - 1}`);
    }
  });

  it('memory: the old tail stays reachable through TAIL/temp until released, and is gone afterwards', () => {
    const steps = run('ll-delete-tail', [4, 7, 9]);
    const at = (ref: string) => steps.find(s => s.codeRef === ref)!.list!;
    expect(at('unlink').detached).toEqual(['n3']);
    expect(at('unlink').tail).toBe('n3'); // TAIL is updated by the next statement
    expect(at('set-tail').tail).toBe('n2');
    expect(at('release').nodes.map(n => n.id)).toEqual(['n1', 'n2']);
    expect(at('release').pointers).toEqual({ prev: 'n2' });
  });

  it('a single node: HEAD then TAIL are cleared, the node is released, and the function returns', () => {
    const steps = run('ll-delete-tail', [5]);
    const at = (ref: string) => steps.find(s => s.codeRef === ref)!.list!;
    expect([at('single-clear-head').head, at('single-clear-head').tail]).toEqual([null, 'n1']);
    expect([at('single-clear-tail').head, at('single-clear-tail').tail]).toEqual([null, null]);
    expect(at('single-release').nodes).toEqual([]);
    expect(steps.find(s => s.codeRef === 'single-return')!.type).toBe('return');
  });
});

// ─── Code lines ──────────────────────────────────────────────────────────────

type Lines = Record<string, [c: string, cpp: string, java: string, python: string]>;
const LINES: Record<Op, Lines> = {
  'll-traverse': {
    'fn-entry': ['void traverse(List* list) {', 'void traverse() {', 'void traverse() {', 'def traverse(self):'],
    'set-curr': ['Node* curr = list->head;', 'Node* curr = head;', 'Node curr = head;', 'curr = self.head'],
    loop: ['while (curr != NULL) {', 'while (curr != nullptr) {', 'while (curr != null) {', 'while curr is not None:'],
    visit: ['printf("%d ", curr->data);', 'cout << curr->data << " ";', 'System.out.print(curr.data + " ");', 'print(curr.data, end=" ")'],
    advance: ['curr = curr->next;', 'curr = curr->next;', 'curr = curr.next;', 'curr = curr.next'],
  },
  'll-search': {
    'fn-entry': ['int search(List* list, int value) {', 'int search(int value) {', 'int search(int value) {', 'def search(self, value):'],
    'set-curr': ['Node* curr = list->head;', 'Node* curr = head;', 'Node curr = head;', 'curr = self.head'],
    'set-index': ['int index = 0;', 'int index = 0;', 'int index = 0;', 'index = 0'],
    loop: ['while (curr != NULL) {', 'while (curr != nullptr) {', 'while (curr != null) {', 'while curr is not None:'],
    'check-match': ['if (curr->data == value) return index;', 'if (curr->data == value) return index;', 'if (curr.data == value) return index;', 'if curr.data == value:'],
    'return-index': ['if (curr->data == value) return index;', 'if (curr->data == value) return index;', 'if (curr.data == value) return index;', 'return index'],
    advance: ['curr = curr->next;', 'curr = curr->next;', 'curr = curr.next;', 'curr = curr.next'],
    'inc-index': ['index++;', 'index++;', 'index++;', 'index += 1'],
    'return-none': ['return -1;', 'return -1;', 'return -1;', 'return -1'],
  },
  'll-insert-head': {
    'fn-entry': ['void insertHead(List* list, int value) {', 'void insertHead(int value) {', 'void insertHead(int value) {', 'def insert_head(self, value):'],
    'create-node': ['Node* node = malloc(sizeof(Node));', 'Node* node = new Node(value);', 'Node node = new Node(value);', 'node = Node(value)'],
    'link-node': ['node->next = list->head;', 'node->next = head;', 'node.next = head;', 'node.next = self.head'],
    'set-head': ['list->head = node;', 'head = node;', 'head = node;', 'self.head = node'],
    'check-tail': ['if (list->tail == NULL) list->tail = node;', 'if (tail == nullptr) tail = node;', 'if (tail == null) tail = node;', 'if self.tail is None:'],
    'set-tail': ['if (list->tail == NULL) list->tail = node;', 'if (tail == nullptr) tail = node;', 'if (tail == null) tail = node;', 'self.tail = node'],
  },
  'll-insert-tail': {
    'fn-entry': ['void insertTail(List* list, int value) {', 'void insertTail(int value) {', 'void insertTail(int value) {', 'def insert_tail(self, value):'],
    'create-node': ['Node* node = malloc(sizeof(Node));', 'Node* node = new Node(value);', 'Node node = new Node(value);', 'node = Node(value)'],
    'check-empty': ['if (list->tail == NULL) {', 'if (tail == nullptr) {', 'if (tail == null) {', 'if self.tail is None:'],
    'set-head-empty': ['list->head = node;', 'head = node;', 'head = node;', 'self.head = node'],
    'set-tail-empty': ['list->tail = node;', 'tail = node;', 'tail = node;', 'self.tail = node'],
    'link-tail': ['list->tail->next = node;', 'tail->next = node;', 'tail.next = node;', 'self.tail.next = node'],
    'set-tail': ['list->tail = node;', 'tail = node;', 'tail = node;', 'self.tail = node'],
  },
  'll-delete-head': {
    'fn-entry': ['void deleteHead(List* list) {', 'void deleteHead() {', 'void deleteHead() {', 'def delete_head(self):'],
    'check-empty': ['if (list->head == NULL) return;', 'if (head == nullptr) return;', 'if (head == null) return;', 'if self.head is None:'],
    'return-empty': ['if (list->head == NULL) return;', 'if (head == nullptr) return;', 'if (head == null) return;', 'return'],
    'set-temp': ['Node* temp = list->head;', 'Node* temp = head;', 'Node temp = head;', 'temp = self.head'],
    'advance-head': ['list->head = list->head->next;', 'head = head->next;', 'head = head.next;', 'self.head = self.head.next'],
    'check-last': ['if (list->head == NULL) list->tail = NULL;', 'if (head == nullptr) tail = nullptr;', 'if (head == null) tail = null;', 'if self.head is None:'],
    'clear-tail': ['if (list->head == NULL) list->tail = NULL;', 'if (head == nullptr) tail = nullptr;', 'if (head == null) tail = null;', 'self.tail = None'],
    release: ['free(temp);', 'delete temp;', 'temp = null; // last reference dropped: the GC reclaims the node', 'del temp  # last reference dropped: the node is garbage'],
  },
  'll-delete-tail': {
    'fn-entry': ['void deleteTail(List* list) {', 'void deleteTail() {', 'void deleteTail() {', 'def delete_tail(self):'],
    'check-empty': ['if (list->head == NULL) return;', 'if (head == nullptr) return;', 'if (head == null) return;', 'if self.head is None:'],
    'return-empty': ['if (list->head == NULL) return;', 'if (head == nullptr) return;', 'if (head == null) return;', 'return'],
    'check-single': ['if (list->head == list->tail) {', 'if (head == tail) {', 'if (head == tail) {', 'if self.head is self.tail:'],
    'single-temp': ['Node* temp = list->head;', 'Node* temp = head;', 'Node temp = head;', 'temp = self.head'],
    'single-clear-head': ['list->head = NULL;', 'head = nullptr;', 'head = null;', 'self.head = None'],
    'single-clear-tail': ['list->tail = NULL;', 'tail = nullptr;', 'tail = null;', 'self.tail = None'],
    'single-release': ['free(temp);', 'delete temp;', 'temp = null; // last reference dropped: the GC reclaims the node', 'del temp  # last reference dropped: the node is garbage'],
    'single-return': ['return;', 'return;', 'return;', 'return'],
    'set-prev': ['Node* prev = list->head;', 'Node* prev = head;', 'Node prev = head;', 'prev = self.head'],
    loop: ['while (prev->next != list->tail) prev = prev->next;', 'while (prev->next != tail) prev = prev->next;', 'while (prev.next != tail) prev = prev.next;', 'while prev.next is not self.tail:'],
    'advance-prev': ['while (prev->next != list->tail) prev = prev->next;', 'while (prev->next != tail) prev = prev->next;', 'while (prev.next != tail) prev = prev.next;', 'prev = prev.next'],
    'set-temp': ['Node* temp = list->tail;', 'Node* temp = tail;', 'Node temp = tail;', 'temp = self.tail'],
    unlink: ['prev->next = NULL;', 'prev->next = nullptr;', 'prev.next = null;', 'prev.next = None'],
    'set-tail': ['list->tail = prev;', 'tail = prev;', 'tail = prev;', 'self.tail = prev'],
    release: ['free(temp);', 'delete temp;', 'temp = null; // last reference dropped: the GC reclaims the node', 'del temp  # last reference dropped: the node is garbage'],
  },
};

describe('linked-list code lines — exact statements in all four languages', () => {
  const lineText = (d: AlgorithmDefinition, lang: (typeof LANGUAGES)[number], ref: string) => codeLines(d, lang)[resolveCodeRef(d, lang, ref)! - 1].trim();

  for (const id of OPS) {
    it(`${id}: the table covers exactly the codeRefs the line map defines and the traces emit`, () => {
      const emitted = new Set<string>();
      for (const input of LISTS) for (const v of VALUES) for (const s of run(id, input, v)) if (s.codeRef) emitted.add(s.codeRef);
      expect([...emitted].sort()).toEqual(Object.keys(LINES[id]).sort());
      for (const lang of LANGUAGES) expect(Object.keys(def(id).lineMap[lang]).sort()).toEqual(Object.keys(LINES[id]).sort());
    });

    it(`${id}: every codeRef highlights its exact statement in C, C++, Java and Python`, () => {
      for (const [ref, texts] of Object.entries(LINES[id])) {
        for (const lang of LANGUAGES) expect(lineText(def(id), lang, ref), `${lang} ${ref}`).toBe(texts[['c', 'cpp', 'java', 'python'].indexOf(lang)]);
      }
    });

    it(`${id}: every statement of every listing is highlighted by some step`, () => {
      for (const lang of LANGUAGES) {
        const covered = new Set<number>();
        for (const input of LISTS) {
          for (const v of VALUES) {
            for (const s of run(id, input, v)) {
              const r = resolveCodeRange(def(id), lang, s.codeRef);
              if (r) for (let line = r.start; line <= r.end; line++) covered.add(line);
            }
          }
        }
        codeLines(def(id), lang).forEach((text, k) => {
          if (/^[\s{}]*$/.test(text) || /^\s*\}?\s*else\s*\{?\s*:?\s*$/.test(text)) return;
          expect(covered.has(k + 1), `${id} ${lang} line ${k + 1} "${text.trim()}"`).toBe(true);
        });
      }
    });
  }

  it('C allocation is explicit: malloc, the data assignment and next = NULL form one step (next is never uninitialised)', () => {
    const range = (id: Op) => {
      const r = resolveCodeRange(def(id), 'c', 'create-node')!;
      return codeLines(def(id), 'c').slice(r.start - 1, r.end).map(t => t.trim());
    };
    expect(range('ll-insert-head')).toEqual(['Node* node = malloc(sizeof(Node));', 'node->data = value;', 'node->next = NULL;']);
    expect(range('ll-insert-tail')).toEqual(['Node* node = malloc(sizeof(Node));', 'node->data = value;', 'node->next = NULL;']);
    for (const id of ['ll-insert-head', 'll-insert-tail'] as const) {
      for (const lang of ['cpp', 'java', 'python'] as const) {
        const r = resolveCodeRange(def(id), lang, 'create-node')!;
        expect(r.end - r.start, `${id} ${lang}`).toBe(0);
      }
    }
  });

  it('C memory is released with free(), C++ with delete, Java and Python by dropping the last reference', () => {
    for (const [id, ref] of [['ll-delete-head', 'release'], ['ll-delete-tail', 'release'], ['ll-delete-tail', 'single-release']] as const) {
      expect(lineText(def(id), 'c', ref)).toBe('free(temp);');
      expect(lineText(def(id), 'cpp', ref)).toBe('delete temp;');
      expect(lineText(def(id), 'java', ref)).toMatch(/^temp = null;/);
      expect(lineText(def(id), 'python', ref)).toMatch(/^del temp\b/);
    }
  });
});
