import { describe, it, expect } from 'vitest';
import { buildTutorContext, languagesMentioned, tutorSystemInstruction } from '../services/tutor/context';
import { useVisualizerStore } from '../../src/store/useVisualizerStore';
import { ALGORITHM_NAV } from '../../src/data/algorithmMetadata';
import { getAlgorithmDefinition } from '../../src/engine/AlgorithmRegistry';
import type { AlgorithmId } from '../../src/types/algorithm';

// The tutor's context is rebuilt on the server from the same engine the visualizer runs.

/** the visualizer's state for an algorithm with its default input (as the browser has it) */
function visualizerState(id: AlgorithmId) {
  useVisualizerStore.getState().setAlgorithm(id);
  const s = useVisualizerStore.getState();
  return { array: s.array, target: s.target, index: s.index, second: s.second, texts: s.texts, steps: s.steps };
}

describe('tutor context: other languages', () => {
  const bubble = () => visualizerState('bubble-sort');
  const def = getAlgorithmDefinition('bubble-sort')!;
  const build = (question: string, language: 'c' | 'cpp' | 'java' | 'python' = 'cpp') => {
    const s = bubble();
    const r = buildTutorContext({ algorithmId: 'bubble-sort', array: s.array, target: null, index: null, stepIndex: 1, language, question });
    if (!r.ok) throw new Error('context not built');
    return r.context;
  };
  const otherBlock = (name: string) => `AlgoFlow's ${name} version of this algorithm (another language: the current step and line numbers above refer to the C++ code):`;

  it.each([
    ['for python gave code', ['python']],
    ['why not Python?', ['python']],
    ['show it in Java', ['java']],
    ['and in C++?', ['cpp']],
    ['the cpp version', ['cpp']],
    ['what about C', ['c']],
    ['write it in c please', ['c']],
    ['compare Python and Java', ['java', 'python']],
    ['why compare these two?', []],
    ['what does the variable c hold here?', []],
    ['Can you explain this?', []],
    ['is it the same in C#?', []],
    ['JavaScript version?', []],
    ['in rust', []],
  ] as const)('"%s" names %j', (question, expected) => {
    expect(languagesMentioned(question)).toEqual(expected);
  });

  it("a question naming another language adds AlgoFlow's own code in it, exactly as the visualizer has it", () => {
    const context = build('for python gave code');
    expect(context).toContain(`C++ code shown to the learner:\n${def.code.cpp}`);
    expect(context).toContain(`${otherBlock('Python')}\n${def.code.python}`);
    // the step and highlighted line still refer to the C++ code being stepped through
    expect(context).toMatch(/Code line being executed \(C\+\+, line \d+\)/);
  });

  it('a question naming no other language (or only the current one, or an unsupported one) adds nothing', () => {
    const plain = build('why compare these two?');
    for (const question of ['why compare these two?', 'explain the C++ code', 'show it in rust']) {
      const context = build(question);
      expect(context, question).toBe(plain);
      expect(context, question).not.toContain("AlgoFlow's ");
    }
  });

  it('each named language is added once, in AlgoFlow order, never the current one', () => {
    const context = build('compare java, python, c++ and java again', 'python');
    expect(context.match(/AlgoFlow's \w+\+* version/g)).toEqual(["AlgoFlow's C++ version", "AlgoFlow's Java version"]);
    expect(context).not.toContain("AlgoFlow's Python version");
  });

  it('the instruction allows AlgoFlow\'s four languages, ties line numbers to the stepped-through code, and refuses others', () => {
    const system = tutorSystemInstruction(build('for python gave code'));
    expect(system).toContain("its code in any of AlgoFlow's languages: C, C++, Java and Python");
    expect(system).toContain('the current step, the highlighted line and line numbers refer only to that code');
    expect(system).toContain("use that code as it is, and mention that switching the visualizer's language steps through it");
    expect(system).toContain('AlgoFlow supports only C, C++, Java and Python. For any other programming language, say that AlgoFlow does not support it');
    expect(system).toMatch(/Never invent steps, values or line numbers/);
    expect(system).not.toMatch(/@|userId|e-mail address/i);
  });
});

describe('tutor context', () => {
  it('matches the visualizer: the same step message, count and data for every implemented algorithm', () => {
    for (const nav of ALGORITHM_NAV.filter(a => a.implemented)) {
      const s = visualizerState(nav.id as AlgorithmId);
      const k = Math.min(3, s.steps.length - 1);
      const r = buildTutorContext({ algorithmId: nav.id, array: s.array, target: s.target, index: s.index, second: s.second, texts: s.texts, stepIndex: k, language: 'python' });
      expect(r.ok, nav.id).toBe(true);
      if (!r.ok) continue;
      expect(r.context, nav.id).toContain(`Current step: ${k + 1} of ${s.steps.length}: ${s.steps[k].message}`);
      // a text algorithm's step is its strings (and stack), not an array
      if (s.steps[k].tree) expect(r.context, nav.id).toMatch(/Tree at this step: output \[/);
      else if (s.steps[k].text) expect(r.context, nav.id).toContain(`Strings at this step: ${s.steps[k].text!.rows[0].name} = ${JSON.stringify(s.steps[k].text!.rows[0].text)}`);
      else expect(r.context, nav.id).toContain(`Data at this step: ${JSON.stringify(s.steps[k].state)}`);
      expect(r.algorithmName).toBe(getAlgorithmDefinition(nav.id as AlgorithmId)!.name);
    }
  });

  it('includes the complexity, the code in the chosen language and the line being executed', () => {
    const s = visualizerState('bubble-sort');
    const step = s.steps.findIndex(x => x.codeRef);
    const def = getAlgorithmDefinition('bubble-sort')!;
    for (const language of ['c', 'cpp', 'java', 'python'] as const) {
      const r = buildTutorContext({ algorithmId: 'bubble-sort', array: s.array, target: null, index: null, stepIndex: step, language });
      expect(r.ok && r.context).toContain(`Complexity: best ${def.complexity.best}`);
      expect(r.ok && r.context).toContain(def.code[language].split('\n')[0]);
      expect(r.ok && r.context).toMatch(/Code line being executed \((C|C\+\+|Java|Python), line \d+\): \S/);
    }
  });

  it('linked-list operations use their value and position, as the visualizer does', () => {
    const s = visualizerState('ll-insert-at');
    const r = buildTutorContext({ algorithmId: 'll-insert-at', array: s.array, target: s.target, index: s.index, stepIndex: 0, language: 'cpp' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.context).toContain(`position ${s.index}`);
  });

  it('text algorithms: the strings as entered, each row with its pointers, and the stack', () => {
    const r = buildTutorContext({ algorithmId: 'find-first-occurrence', array: [], target: null, index: null, texts: ['hello', 'll'], stepIndex: 5, language: 'cpp' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.context).toContain('Input: haystack = "hello", needle = "ll"');
    expect(r.ok && r.context).toMatch(/Strings at this step: haystack = "hello" \(i at \d+.*\); needle = "ll"/);
    const vp = buildTutorContext({ algorithmId: 'valid-parentheses', array: [], target: null, index: null, texts: ['(['], stepIndex: 6, language: 'python' });
    expect(vp.ok && vp.context).toContain('stack (bottom to top): [(');
    // strings that the visualizer would refuse are refused here too, and so are strings for a non-text algorithm
    for (const bad of [
      { algorithmId: 'roman-to-integer', texts: ['IIII'] },
      { algorithmId: 'add-binary', texts: ['1'] },
      { algorithmId: 'add-binary', texts: null },
    ]) {
      expect(buildTutorContext({ ...bad, array: [], target: null, index: null, stepIndex: 0, language: 'cpp' }).ok, JSON.stringify(bad)).toBe(false);
    }
    // a non-text algorithm ignores strings, exactly as the visualizer does
    const s = visualizerState('bubble-sort');
    expect(buildTutorContext({ algorithmId: 'bubble-sort', array: s.array, target: null, index: null, texts: ['x'], stepIndex: 0, language: 'cpp' }).ok).toBe(true);
  });

  it('tree traversals: the tree as entered, and the output, current node and stack at the step', () => {
    // the first visit: node 2 (the leftmost), with 1 still on the stack
    const visit = getAlgorithmDefinition('tree-inorder')!.generateSteps([], { texts: ['[1, 2, 3]'] }).findIndex(st => st.codeRef === 'visit');
    const r = buildTutorContext({ algorithmId: 'tree-inorder', array: [], target: null, index: null, texts: ['[1, 2, 3]'], stepIndex: visit, language: 'cpp' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.context).toContain('Input: root = "[1, 2, 3]"');
    expect(r.ok && r.context).toMatch(/Tree at this step: output \[2\], current node 2, stack \(bottom to top\) \[1\]/);
    expect(buildTutorContext({ algorithmId: 'tree-level-order', array: [], target: null, index: null, texts: ['[null, 1]'], stepIndex: 0, language: 'cpp' }).ok).toBe(false);
  });

  it('refuses what the visualizer cannot run: unknown or unimplemented algorithms, invalid input, a step past the end', () => {
    const unimplemented = ALGORITHM_NAV.find(a => !a.implemented)!.id;
    const s = visualizerState('binary-search');
    for (const input of [
      { algorithmId: 'no-such-algo', array: [1, 2], target: null, index: null, stepIndex: 0 },
      { algorithmId: unimplemented, array: [1, 2], target: null, index: null, stepIndex: 0 },
      // binary search needs a sorted array and a target
      { algorithmId: 'binary-search', array: [5, 1, 3], target: 3, index: null, stepIndex: 0 },
      { algorithmId: 'binary-search', array: s.array, target: null, index: null, stepIndex: 0 },
      { algorithmId: 'bubble-sort', array: Array.from({ length: 40 }, (_, i) => i), target: null, index: null, stepIndex: 0 },
      { algorithmId: 'binary-search', array: s.array, target: s.target, index: null, stepIndex: s.steps.length },
    ]) {
      expect(buildTutorContext({ ...input, language: 'cpp' }).ok, JSON.stringify(input).slice(0, 80)).toBe(false);
    }
  });

  it('the system instruction limits the scope, asks for honesty, and carries the context; no account data', () => {
    const s = visualizerState('bubble-sort');
    const r = buildTutorContext({ algorithmId: 'bubble-sort', array: s.array, target: null, index: null, stepIndex: 0, language: 'java' });
    const system = tutorSystemInstruction(r.ok ? r.context : '');
    expect(system).toMatch(/Answer only questions about data structures, algorithms/);
    expect(system).toMatch(/Never invent steps, values or line numbers/);
    expect(system).toContain('Algorithm: Bubble Sort');
    expect(system).not.toMatch(/@|userId|e-mail address/i);
  });
});
