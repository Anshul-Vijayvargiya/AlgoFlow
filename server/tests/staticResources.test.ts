import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { LEARNING_RESOURCES, fileSizeText } from '../../src/data/learningResources';

// The downloadable learning resources are public static files (public/, served by the front end as-is, no API route):
// each one listed on the dashboard exists, is a complete PDF, and matches the size and page count its card shows.

/** the page count from the PDF's page tree (in a compressed object stream, as Chrome's Skia writer stores it) */
function pdfPageCount(bytes: Buffer): number | null {
  const text = bytes.toString('latin1');
  const plain = /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/.exec(text);
  if (plain) return Number(plain[1] ?? plain[2]);
  for (const m of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const x = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      const c = /\/Type\s*\/Pages\b[\s\S]*?\/Count\s+(\d+)/.exec(x) ?? /\/Count\s+(\d+)[\s\S]*?\/Type\s*\/Pages\b/.exec(x);
      if (c) return Number(c[1]);
    } catch {
      // not a deflate stream
    }
  }
  return null;
}

describe('public learning resources', () => {
  for (const r of LEARNING_RESOURCES) {
    it(`${r.title}: public/${r.path} is a complete PDF of the size and page count its card shows`, () => {
      const file = join(process.cwd(), 'public', r.path);
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.subarray(-8).toString('latin1')).toContain('%%EOF');
      expect(bytes.length).toBe(r.sizeBytes);
      expect(pdfPageCount(bytes)).toBe(r.pages);
    });
  }

  it('SQL Notes is 6 pages, about 171 KB', () => {
    const sql = LEARNING_RESOURCES.find(r => r.id === 'sql-notes')!;
    expect(sql.pages).toBe(6);
    expect(fileSizeText(sql.sizeBytes)).toBe('171 KB');
  });
});
