import { describe, it, expect } from 'vitest';
import { highlightLines, type SyntaxToken, type TokenKind } from '../syntaxHighlight';
import { getAllAlgorithms } from '../../../engine/AlgorithmRegistry';

const LANGUAGES = ['cpp', 'c', 'java', 'python'] as const;

/** the tokens of one line as [kind, text] pairs, whitespace left out */
const kinds = (line: SyntaxToken[]) => line.filter(t => t.kind !== 'plain').map(t => [t.kind, t.text] as [TokenKind, string]);
const kindOf = (source: string, language: string, text: string) =>
  highlightLines(source, language).flat().find(t => t.text === text)?.kind;

describe('syntax highlighting never changes the code shown', () => {
  it('every algorithm, in every language: one token line per source line, joining back to exactly that line', () => {
    let checked = 0;
    for (const def of getAllAlgorithms()) {
      for (const lang of LANGUAGES) {
        const source = def.code[lang];
        if (!source) continue;
        const sourceLines = source.split('\n');
        const lines = highlightLines(source, lang);
        expect(lines.length, `${def.id} ${lang}`).toBe(sourceLines.length);
        lines.forEach((line, i) => expect(line.map(t => t.text).join(''), `${def.id} ${lang} line ${i + 1}`).toBe(sourceLines[i]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('keeps indentation, tabs, CRLF remnants and blank lines', () => {
    const source = '\tint x = 1;\r\n\n    return x;  ';
    expect(highlightLines(source, 'c').map(l => l.map(t => t.text).join(''))).toEqual(source.split('\n'));
  });
});

describe('function declarations and calls', () => {
  const sourceOf = (id: string, lang: (typeof LANGUAGES)[number]) => {
    const def = getAllAlgorithms().find(d => d.id === id)!;
    return def.code[lang]!;
  };

  it('Bubble Sort in C++: the declared name is a function, swap is a call', () => {
    const src = sourceOf('bubble-sort', 'cpp');
    const all = highlightLines(src, 'cpp').flat();
    const declared = all.filter(t => t.kind === 'function').map(t => t.text);
    const called = all.filter(t => t.kind === 'call').map(t => t.text);
    expect(declared.length).toBeGreaterThan(0);
    expect(called).toContain('swap');
    expect(declared).not.toContain('swap');
  });

  it('Heap Sort in C++: heapify is declared once and then called', () => {
    const all = highlightLines(sourceOf('heap-sort', 'cpp'), 'cpp').flat();
    const heapify = all.filter(t => t.text === 'heapify').map(t => t.kind);
    expect(heapify[0]).toBe('function');
    expect(heapify.slice(1).length).toBeGreaterThan(0);
    expect(new Set(heapify.slice(1))).toEqual(new Set(['call']));
  });

  it('declarations after types, pointers, arrays and templates; calls after return, new and operators', () => {
    expect(kindOf('int* build(int n);', 'cpp', 'build')).toBe('function');
    expect(kindOf('vector<int> merge(vector<int>& a);', 'cpp', 'merge')).toBe('function');
    expect(kindOf('static void heapify(int arr[], int n)', 'c', 'heapify')).toBe('function');
    expect(kindOf('public static int[] sortArr(int[] a)', 'java', 'sortArr')).toBe('function');
    expect(kindOf('TreeNode insert(TreeNode root, int v)', 'java', 'insert')).toBe('function');
    expect(kindOf('def merge_sort(arr):', 'python', 'merge_sort')).toBe('function');
    expect(kindOf('return search(arr, mid);', 'cpp', 'search')).toBe('call');
    expect(kindOf('if (a > max(b, c)) {}', 'cpp', 'max')).toBe('call');
    expect(kindOf('Node n = new Node(5);', 'java', 'Node')).toBe('type');
    expect(highlightLines('Node n = new Node(5);', 'java')[0].filter(t => t.text === 'Node').map(t => t.kind)).toEqual(['type', 'call']);
  });
});

describe('token kinds', () => {
  it('C++: keywords, library types, calls, variables, numbers, operators, punctuation and comments', () => {
    const [line] = highlightLines('vector<int> out = solve(arr, 42); // done', 'cpp');
    expect(kinds(line)).toEqual([
      ['type', 'vector'],
      ['operator', '<'],
      ['keyword', 'int'],
      ['operator', '>'],
      ['variable', 'out'],
      ['operator', '='],
      ['call', 'solve'],
      ['punctuation', '('],
      ['variable', 'arr'],
      ['punctuation', ','],
      ['number', '42'],
      ['punctuation', ')'],
      ['punctuation', ';'],
      ['comment', '// done'],
    ]);
    expect(kinds(highlightLines('if (a[i] <= b && i++ != n) x += 2;', 'cpp')[0]).filter(([k]) => k === 'operator').map(([, t]) => t)).toEqual([
      '<=',
      '&&',
      '++',
      '!=',
      '+=',
    ]);
    expect(kindOf('string s = "a // b";', 'cpp', '"a // b"')).toBe('string');
    expect(kindOf('if (x) return nullptr;', 'cpp', 'if')).toBe('keyword');
    expect(kindOf('if (x) return nullptr;', 'cpp', 'nullptr')).toBe('number'); // constants share the number colour
    expect(kindOf('TreeNode* root;', 'cpp', 'TreeNode')).toBe('type');
  });

  it('C: #include directives and char literals', () => {
    const [line] = highlightLines('#include <stdio.h>', 'c');
    expect(kinds(line)).toEqual([
      ['keyword', '#include'],
      ['string', '<stdio.h>'],
    ]);
    expect(kindOf("char c = 'x';", 'c', "'x'")).toBe('string');
    expect(kindOf('x = 1.5e3f;', 'c', '1.5e3f')).toBe('number');
  });

  it('Java: class names, annotations, library types and null', () => {
    const src = '@Override\npublic static int find(List<Integer> xs) { return Math.max(0, xs.size()); }';
    expect(kindOf(src, 'java', '@Override')).toBe('keyword');
    expect(kindOf(src, 'java', 'public')).toBe('keyword');
    expect(kindOf(src, 'java', 'find')).toBe('function');
    expect(kindOf(src, 'java', 'List')).toBe('type');
    expect(kindOf(src, 'java', 'Math')).toBe('type');
    expect(kindOf(src, 'java', 'max')).toBe('call');
    expect(kindOf(src, 'java', 'size')).toBe('call');
    expect(kindOf(src, 'java', 'xs')).toBe('variable');
    expect(kindOf('return null;', 'java', 'null')).toBe('number');
  });

  it('Python: def, builtins called as functions, None/True, # comments and strings', () => {
    const src = 'def bubble_sort(arr):\n    for i in range(len(arr)):  # outer\n        ok = True\n    return None';
    expect(kindOf(src, 'python', 'def')).toBe('keyword');
    expect(kindOf(src, 'python', 'bubble_sort')).toBe('function');
    expect(kindOf(src, 'python', 'in')).toBe('keyword');
    expect(kindOf(src, 'python', 'range')).toBe('call');
    expect(kindOf(src, 'python', 'len')).toBe('call');
    expect(kindOf(src, 'python', '# outer')).toBe('comment');
    expect(kindOf(src, 'python', 'True')).toBe('number');
    expect(kindOf(src, 'python', 'None')).toBe('number');
    expect(kindOf("s = f'{x}'", 'python', "f'{x}'")).toBe('string');
  });

  it('block comments and triple-quoted strings keep their colour on every line they span', () => {
    const c = highlightLines('/* first\n   second */ int x;', 'c');
    expect(kinds(c[0])).toEqual([['comment', '/* first']]);
    expect(kinds(c[1])).toEqual([
      ['comment', '   second */'],
      ['keyword', 'int'],
      ['variable', 'x'],
      ['punctuation', ';'],
    ]);
    const py = highlightLines('"""doc\nstring"""\nx = 1', 'python');
    expect(kinds(py[1])).toEqual([['string', 'string"""']]);
    expect(kinds(py[2])).toEqual([
      ['variable', 'x'],
      ['operator', '='],
      ['number', '1'],
    ]);
  });
});
