import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from '../../../data/algorithmMetadata';
import { filterByName, normalizeQuery } from '../sidebarSearch';
import { Sidebar } from '../Sidebar';

// The sidebar's search (a filter over the app's own algorithm list) and its collapse toggle. Typing, clicking and
// toggling in a real browser are covered by e2e/tests/sidebar.spec.ts.
const names = (items: readonly { name: string }[]) => items.map(a => a.name);
/** text as it appears in rendered markup ("STACK & QUEUE" → "STACK &amp; QUEUE", "Dijkstra's" → "Dijkstra&#x27;s") */
const html$ = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

describe('sidebar search: filterByName over ALGORITHM_NAV', () => {
  it('an empty or blank query is the full list, in its order', () => {
    expect(filterByName(ALGORITHM_NAV, '')).toEqual(ALGORITHM_NAV);
    expect(filterByName(ALGORITHM_NAV, '   ')).toEqual(ALGORITHM_NAV);
  });

  it('matches names case-insensitively, anywhere in the name', () => {
    expect(names(filterByName(ALGORITHM_NAV, 'quick'))).toEqual(['Quick Sort']);
    expect(names(filterByName(ALGORITHM_NAV, 'QUICK'))).toEqual(['Quick Sort']);
    expect(names(filterByName(ALGORITHM_NAV, 'qUiCk sOrT'))).toEqual(['Quick Sort']);
    const searches = names(filterByName(ALGORITHM_NAV, 'search'));
    expect(searches).toEqual(ALGORITHM_NAV.filter(a => /search/i.test(a.name)).map(a => a.name));
    expect(searches).toContain('Binary Search');
    expect(searches).toContain('Search Linked List');
  });

  it('ignores surrounding spaces and runs of spaces', () => {
    expect(names(filterByName(ALGORITHM_NAV, '  binary   search '))).toEqual(['Binary Search']);
    expect(normalizeQuery('  Two   Sum ')).toBe('two sum');
  });

  it('matches names only (not categories or subtitles), and nothing for an unknown name', () => {
    expect(filterByName(ALGORITHM_NAV, 'zzz')).toEqual([]);
    // "sorting" is a category label, and no algorithm is named with it
    expect(filterByName(ALGORITHM_NAV, 'sorting')).toEqual([]);
  });

  it('keeps every match: implemented and locked (not yet implemented) algorithms alike', () => {
    const all = filterByName(ALGORITHM_NAV, 'a');
    expect(all.some(a => a.implemented)).toBe(true);
    expect(all.some(a => !a.implemented)).toBe(true);
  });
});

describe('Sidebar markup', () => {
  const html = renderToStaticMarkup(<Sidebar />);

  it('the search field sits under the heading and description: labelled, with the placeholder, no shortcut hint', () => {
    const heading = html.indexOf('ALGORITHMS');
    const description = html.indexOf('Select an algorithm to visualize step-by-step');
    const search = html.indexOf('data-testid="sidebar-search"');
    expect(heading).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(heading);
    expect(search).toBeGreaterThan(description);
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">Search algorithms<\/label>.*<input id="\1" type="search"/);
    expect(html).toContain('placeholder="Search algorithms..."');
    expect(html).not.toMatch(/Ctrl\s*\+\s*K|⌘\s*K/);
  });

  it('with no query: every category with its label and full count, and every algorithm (one button each)', () => {
    for (const cat of ALGORITHM_CATEGORIES) {
      const inCat = ALGORITHM_NAV.filter(a => a.category === cat.id);
      if (inCat.length === 0) continue;
      expect(html).toContain(`<span>${html$(cat.label)}</span>`);
      expect(html).toContain(`>${inCat.filter(a => a.implemented).length}/${inCat.length}</span>`);
    }
    for (const a of ALGORITHM_NAV) expect(html).toContain(`<span class="min-w-0 break-words">${html$(a.name)}</span>`);
    expect(html).not.toContain('No algorithms found');
    expect(html).not.toContain('role="status"');
  });

  it('algorithm names are 16px (text-base), medium weight, and wrap instead of being cut; headings keep their sizes', () => {
    const items = [...html.matchAll(/<button title="[^"]*" class="([^"]*)">/g)].map(m => m[1]);
    expect(items).toHaveLength(ALGORITHM_NAV.length);
    for (const cls of items) {
      expect(cls).toMatch(/(^| )text-base( |$)/);
      expect(cls).toMatch(/(^| )font-medium( |$)/);
      expect(cls).not.toMatch(/(^| )text-xs( |$)/);
    }
    expect(html).not.toContain('class="truncate"');
    // category headings, their counts and the description are unchanged
    expect(html).toMatch(/<div class="px-2 py-1 text-\[11px\] font-mono font-semibold tracking-wider text-slate-400 uppercase /);
    expect(html).toMatch(/<span class="text-\[10px\] bg-slate-800 /);
    expect(html).toContain('<p class="text-[11px] text-slate-400 mt-1">Select an algorithm to visualize step-by-step</p>');
  });

  it('without a toggle handler (the mobile drawer) there is no toggle', () => {
    expect(html).not.toContain('data-testid="sidebar-toggle"');
  });

  it('expanded: a "Collapse sidebar" toggle that controls the content, which is visible', () => {
    const open = renderToStaticMarkup(<Sidebar onToggleCollapse={() => {}} />);
    const toggle = /<button type="button" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded="true" aria-controls="([^"]+) ([^"]+)"/.exec(open);
    expect(toggle).not.toBeNull();
    // not inert while expanded
    expect(open).toMatch(new RegExp(`id="${toggle![1]}" class="w-56 [^"]*visible opacity-100`));
    expect(open).toMatch(new RegExp(`id="${toggle![2]}" class="[^"]*visible opacity-100`));
    expect(open).toMatch(/<aside class="relative w-64 /);
  });

  it('collapsed: a narrow rail with an "Expand sidebar" toggle; the content is hidden (not focusable or read out)', () => {
    const closed = renderToStaticMarkup(<Sidebar collapsed onToggleCollapse={() => {}} />);
    const toggle = /aria-label="Expand sidebar" title="Expand sidebar" aria-expanded="false" aria-controls="([^"]+) ([^"]+)"/.exec(closed);
    expect(toggle).not.toBeNull();
    // inert at once (focus and screen readers skip it without waiting for the fade), and invisible
    for (const id of [toggle![1], toggle![2]]) expect(closed).toMatch(new RegExp(`id="${id}" inert="" class="[^"]*invisible opacity-0`));
    expect(closed).toMatch(/<aside class="relative w-12 overflow-y-hidden /);
    // the width change is animated, except for users who prefer reduced motion
    expect(closed).toMatch(/<aside class="[^"]*transition-\[width\] duration-300 [^"]*motion-reduce:transition-none/);
  });

  it('two sidebars in one page (desktop + mobile drawer) never share ids', () => {
    const both = renderToStaticMarkup(
      <>
        <Sidebar onToggleCollapse={() => {}} />
        <Sidebar />
      </>
    );
    const ids = [...both.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
