import { describe, it, expect } from 'vitest';
import { fillLocalSecrets } from '../scripts/generateLocalSecrets';
import { KNOWN_DEV_FALLBACK_JWT, ENV_EXAMPLE_PLACEHOLDER_COOKIE } from '../config/publicSecrets';

// Hardening F1: `npm run env:secrets` replaces only missing, empty or published secrets and never touches other lines.

let n = 0;
const fake = () => `generated-${++n}`;
const value = (content: string, key: string) => content.split(/\r?\n/).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1);

describe('fillLocalSecrets', () => {
  it('replaces published values and leaves every other line untouched', () => {
    const input = [
      '# comment',
      'NODE_ENV=development',
      `JWT_SECRET=${KNOWN_DEV_FALLBACK_JWT}`,
      `COOKIE_SECRET="${ENV_EXAMPLE_PLACEHOLDER_COOKIE}"`,
      'MONGODB_URI=mongodb://127.0.0.1:27017/algoflow',
      '',
    ].join('\n');
    const result = fillLocalSecrets(input, fake);
    if (!result.ok) throw new Error(result.error);

    expect(result.changed).toEqual(['JWT_SECRET', 'COOKIE_SECRET']);
    const out = result.content.split('\n');
    expect(out).toHaveLength(6);
    expect([out[0], out[1], out[4], out[5]]).toEqual(['# comment', 'NODE_ENV=development', 'MONGODB_URI=mongodb://127.0.0.1:27017/algoflow', '']);
    expect(value(result.content, 'JWT_SECRET')).toMatch(/^generated-/);
    expect(value(result.content, 'COOKIE_SECRET')).toMatch(/^generated-/);
    expect(value(result.content, 'JWT_SECRET')).not.toBe(value(result.content, 'COOKIE_SECRET'));
  });

  it('fills empty and missing secrets (the new .env.example ships them empty)', () => {
    const result = fillLocalSecrets('NODE_ENV=development\nJWT_SECRET=\n', fake);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toEqual(['JWT_SECRET', 'COOKIE_SECRET']);
    expect(result.content.endsWith('\n')).toBe(true);
    expect(value(result.content, 'COOKIE_SECRET')).toMatch(/^generated-/);
  });

  it('keeps secrets the developer already set privately', () => {
    const input = 'NODE_ENV=development\nJWT_SECRET=my-own-private-secret\nCOOKIE_SECRET=\n';
    const result = fillLocalSecrets(input, fake);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toEqual(['COOKIE_SECRET']);
    expect(value(result.content, 'JWT_SECRET')).toBe('my-own-private-secret');
  });

  it('is a no-op when both secrets are private', () => {
    const input = 'JWT_SECRET=aaa\r\nCOOKIE_SECRET=bbb\r\n';
    const result = fillLocalSecrets(input, fake);
    expect(result).toEqual({ ok: true, content: input, changed: [] });
  });

  it('preserves CRLF line endings', () => {
    const result = fillLocalSecrets(`JWT_SECRET=${KNOWN_DEV_FALLBACK_JWT}\r\nCOOKIE_SECRET=x\r\n`, fake);
    if (!result.ok) throw new Error(result.error);
    expect(result.content).toMatch(/^JWT_SECRET=generated-\d+\r\nCOOKIE_SECRET=x\r\n$/);
  });

  it('never generates the same value for both secrets', () => {
    const values = ['dup', 'dup', 'other'];
    const result = fillLocalSecrets('JWT_SECRET=\nCOOKIE_SECRET=\n', () => values.shift()!);
    if (!result.ok) throw new Error(result.error);
    expect(value(result.content, 'JWT_SECRET')).toBe('dup');
    expect(value(result.content, 'COOKIE_SECRET')).toBe('other');
  });

  it.each(['staging', 'production', '"production"'])('refuses a .env for NODE_ENV=%s', nodeEnv => {
    const result = fillLocalSecrets(`NODE_ENV=${nodeEnv}\nJWT_SECRET=\n`, fake);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/secret store/) });
  });

  it('uses 96 hex characters of randomness by default', () => {
    const result = fillLocalSecrets('JWT_SECRET=\nCOOKIE_SECRET=\n');
    if (!result.ok) throw new Error(result.error);
    expect(value(result.content, 'JWT_SECRET')).toMatch(/^[0-9a-f]{96}$/);
  });
});
