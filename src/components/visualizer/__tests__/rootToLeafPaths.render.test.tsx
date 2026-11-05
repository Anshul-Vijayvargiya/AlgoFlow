import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { ExecutionStep } from '../../../types/algorithm';
import { TreeVisualizer } from '../TreeVisualizer';

// The real TreeVisualizer for steps of the real Root to Leaf Paths trace: each node's state (current, on the current
// path, explored and backtracked), the lit edges along the current path, the current path, the call stack and the
// paths found.
const run = (tree: string) => getAlgorithmDefinition('tree-root-to-leaf-paths')!.generateSteps([], { texts: [tree] });
const render = (s: ExecutionStep) => renderToStaticMarkup(<TreeVisualizer currentStep={s} stepIntervalMs={700} />);
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/<!-- -->/g, '');
const states = (html: string) => Object.fromEntries([...html.matchAll(/data-node-id="(n\d+)" data-value="(-?\d+)" data-state="([a-z]+)"/g)].map(m => [m[1], m[3]]));
const litEdges = (html: string) => [...html.matchAll(/data-edge="(n\d+-n\d+)"[^>]*class="stroke-emerald-500\/70"/g)].map(m => m[1]).sort();
const saved = (html: string) => [...html.matchAll(/data-saved-path="([^"]*)"/g)].map(m => m[1]);
const calls = (html: string) =>
  [...html.matchAll(/data-frame="\d+" data-frame-status="([a-z]+)" data-frame-node="([^"]+)" data-frame-via="([a-z]+)"[^>]*>(.*?)<\/li>/g)].map(m => decode(m[4].replace(/<[^>]+>/g, '')));

// [1, 2, 3, 4, 5, 6, 7]: n0 = 1, n1 = 2, n2 = 3, n3 = 4, n4 = 5, n5 = 6, n6 = 7
const example = run('[1, 2, 3, 4, 5, 6, 7]');
const at = (codeRef: string, n = 0) => example.filter(s => s.codeRef === codeRef)[n];

describe('TreeVisualizer — Root to Leaf Paths', () => {
  it('the setup: an empty path, no call yet, no path found', () => {
    const html = render(example[0]);
    expect(html).toMatch(/data-testid="tree-current-path" data-path=""/);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/data-testid="tree-paths" data-count="0"/);
    expect(html).toContain('none yet');
  });

  it('saving [1, 2, 4] at leaf 4: 1 and 2 on the path, 4 current, the edges down to it lit, three calls in progress', () => {
    const html = render(at('save'));
    expect(states(html)).toEqual({ n0: 'path', n1: 'path', n2: 'unvisited', n3: 'current', n4: 'unvisited', n5: 'unvisited', n6: 'unvisited' });
    expect(html).toMatch(/data-testid="tree-current-path" data-path="1,2,4"/);
    expect(litEdges(html)).toEqual(['n0-n1', 'n1-n3']);
    expect(calls(html)).toEqual(['dfs(root = 1) (waiting)', '└─ dfs(node.left = 2) (waiting)', '└─ dfs(node.left = 4)']);
    expect(saved(html)).toEqual(['1,2,4']);
  });

  it('backtracking from 4: it is explored and backtracked, the path is [1, 2] again', () => {
    const html = render(at('backtrack'));
    expect(html).toMatch(/data-testid="tree-current-path" data-path="1,2"/);
    expect(states(html)).toMatchObject({ n1: 'path', n3: 'current' });
    expect(states(render(at('left-returned')))).toMatchObject({ n1: 'current', n3: 'visited' });
    expect(decode(render(at('left-returned')))).toContain('Node 4: explored and backtracked');
  });

  it('the end: all four paths in order, everything backtracked, no call left, the answer', () => {
    const html = render(example.at(-1)!);
    expect(saved(html)).toEqual(['1,2,4', '1,2,5', '1,3,6', '1,3,7']);
    expect(Object.values(states(html)).every(s => s === 'visited')).toBe(true);
    expect(html).toMatch(/data-testid="tree-current-path" data-path=""/);
    expect(html).toContain('no call in progress');
    expect(html).toMatch(/data-testid="tree-result"[^>]*>.*4 root-to-leaf paths: \[1, 2, 4\], \[1, 2, 5\], \[1, 3, 6\], \[1, 3, 7\]/);
    // the paths are listed for assistive technology too
    expect(decode(html)).toContain('aria-label="Paths found: 1 → 2 → 4; 1 → 2 → 5; 1 → 3 → 6; 1 → 3 → 7"');
  });

  it('a call on an empty child is drawn as such', () => {
    const steps = run('[1, 2]');
    const html = render(steps.find(s => s.codeRef === 'return-null')!);
    expect(calls(html).at(-1)).toBe('└─ dfs(node.right = null) — empty child');
    // no node is current while the empty child's call runs: its pointer is null, and 1 waits on the path
    expect(html).toMatch(/data-testid="tree-null-pointers"[^>]*>node = null</);
    expect(decode(html)).toContain('Node 1: on the current path');
  });

  it('the empty tree: the empty drawing and the answer', () => {
    const html = render(run('[]').at(-1)!);
    expect(html).toContain('data-testid="tree-empty"');
    expect(html).toMatch(/Empty tree: no root-to-leaf paths/);
  });

  it('the other tree algorithms render as before: no current path, no paths list', () => {
    const html = render(getAlgorithmDefinition('tree-preorder')!.generateSteps([]).at(-1)!);
    expect(html).not.toContain('data-testid="tree-current-path"');
    expect(html).not.toContain('data-testid="tree-paths"');
    expect(html).toMatch(/output:<\/span>/);
  });
});
