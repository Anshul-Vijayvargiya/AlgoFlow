import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEARNING_RESOURCES, _resetResourceChecksForTesting, checkResource, fileSizeText, resourceUrl } from '../learningResources';

// The downloadable notes: what the card says about them, a URL that follows the deployment's base path, and a
// missing file detected rather than shown as working links. (The file's own bytes are checked in
// server/tests/staticResources.test.ts, where Node's file APIs are typed.)
const sql = LEARNING_RESOURCES.find(r => r.id === 'sql-notes')!;
beforeEach(() => _resetResourceChecksForTesting());

describe('SQL Notes resource', () => {
  it('the card describes the notes as asked: title, topics, PDF, 6 pages, a sensible download name', () => {
    expect(sql).toMatchObject({
      title: 'SQL Notes',
      description: 'MySQL basics, CRUD, datatypes, keys, constraints, filtering, aggregates, joins, UNION, subqueries, and views.',
      format: 'PDF',
      pages: 6,
      path: 'downloads/sql-notes.pdf',
      downloadName: 'AlgoFlow-SQL-Notes.pdf',
    });
  });

  it('its URL is relative to the base the app is deployed under, never a filesystem path', () => {
    expect(resourceUrl(sql, '/')).toBe('/downloads/sql-notes.pdf');
    expect(resourceUrl(sql, '/algoflow/')).toBe('/algoflow/downloads/sql-notes.pdf');
    expect(resourceUrl(sql, '/algoflow')).toBe('/algoflow/downloads/sql-notes.pdf');
    expect(resourceUrl(sql)).not.toMatch(/^[a-z]:|\\|file:/i);
  });

  it('the size is shown in KB below a megabyte, in MB above', () => {
    expect(fileSizeText(sql.sizeBytes)).toBe('171 KB');
    expect(fileSizeText(300)).toBe('1 KB');
    expect(fileSizeText(3_928_431)).toBe('3.7 MB');
  });
});

describe('checkResource: is the file really there?', () => {
  const respond = (status: number, type: string) => vi.fn(async () => new Response(null, { status, headers: { 'content-type': type } }));

  it('a PDF answer: available (checked with HEAD, once per URL)', async () => {
    const fetchImpl = respond(200, 'application/pdf');
    expect(await checkResource('/downloads/sql-notes.pdf', fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(await checkResource('/downloads/sql-notes.pdf', fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/downloads/sql-notes.pdf', { method: 'HEAD' });
  });

  it("missing: a 404, the app's own HTML page in its place (a dev server's fallback), or no network", async () => {
    expect(await checkResource('/a.pdf', respond(404, 'text/plain') as unknown as typeof fetch)).toBe(false);
    expect(await checkResource('/b.pdf', respond(200, 'text/html; charset=utf-8') as unknown as typeof fetch)).toBe(false);
    expect(await checkResource('/c.pdf', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBe(false);
  });
});
