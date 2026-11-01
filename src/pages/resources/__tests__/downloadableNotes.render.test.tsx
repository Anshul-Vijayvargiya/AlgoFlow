import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DownloadableNotes } from '../DownloadableNotes';

// The Resources page's downloadable notes: the SQL Notes card with what it covers, the PDF's format, pages and size, and
// labelled Preview / Download links to the real file. (Its availability check runs in the browser; see the E2E spec.)
const html = renderToStaticMarkup(<DownloadableNotes />);
const card = html.slice(html.indexOf('data-resource="sql-notes"'));

describe('DownloadableNotes', () => {
  it('a titled section with one card per resource, in a responsive grid', () => {
    expect(html).toMatch(/<section aria-labelledby="downloadable-notes-heading" data-testid="downloadable-notes"/);
    expect(html).toMatch(/<h2 id="downloadable-notes-heading"[^>]*>.*Downloadable notes<\/h2>/);
    expect(html).toMatch(/<ul class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="downloadable-notes-list">/);
    expect([...html.matchAll(/data-resource="([^"]+)"/g)].map(m => m[1])).toEqual(['sql-notes']);
  });

  it('SQL Notes: the title, what it covers, and the PDF metadata from the actual file', () => {
    expect(card).toMatch(/<h3[^>]*>SQL Notes<\/h3>/);
    expect(card).toContain('MySQL basics, CRUD, datatypes, keys, constraints, filtering, aggregates, joins, UNION, subqueries, and views.');
    expect(card).toMatch(/data-testid="resource-meta"[^>]*>PDF · 6 pages · 171 KB</);
  });

  it('Preview Notes opens the real PDF in a new tab; Download PDF saves it as AlgoFlow-SQL-Notes.pdf; both labelled', () => {
    const preview = card.match(/<a [^>]*data-testid="resource-preview"[^>]*>/)![0];
    expect(preview).toContain('href="/downloads/sql-notes.pdf"');
    expect(preview).toContain('target="_blank"');
    expect(preview).toContain('rel="noopener noreferrer"');
    expect(preview).toContain('aria-label="Preview Notes: SQL Notes (PDF, opens in a new tab)"');
    const download = card.match(/<a [^>]*data-testid="resource-download"[^>]*>/)![0];
    expect(download).toContain('href="/downloads/sql-notes.pdf"');
    expect(download).toContain('download="AlgoFlow-SQL-Notes.pdf"');
    expect(download).toContain('aria-label="Download PDF: SQL Notes (171 KB)"');
    expect(card).toMatch(/>Preview Notes<\/a>/);
    expect(card).toMatch(/>Download PDF<\/a>/);
  });
});
