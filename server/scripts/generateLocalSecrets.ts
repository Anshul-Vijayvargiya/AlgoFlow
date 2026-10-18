/**
 * Fill JWT_SECRET and COOKIE_SECRET in the local .env with random values:  npm run env:secrets
 *
 * - Only a secret that is missing, empty or a published value (config/publicSecrets.ts) is replaced; a secret you set
 *   yourself is kept. Every other line is left exactly as it was.
 * - Creates .env from .env.example when it does not exist.
 * - Prints only the names of the keys it changed, never a value.
 * - Refuses when the file says NODE_ENV=staging or production: deployed secrets belong in a secret store.
 *
 * Replacing a secret ends every existing session (users log in again). It does not touch the database.
 * Deliberately does not import config/env.ts, which would refuse to load with the very values this replaces.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_SECRETS } from '../config/publicSecrets';

export const SECRET_KEYS = ['JWT_SECRET', 'COOKIE_SECRET'] as const;

export type FillResult = { ok: true; content: string; changed: string[] } | { ok: false; error: string };

function unquote(value: string): string {
  const v = value.trim();
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
}

export function fillLocalSecrets(content: string, newSecret: () => string = () => randomBytes(48).toString('hex')): FillResult {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const lineOf = (key: string) => lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));

  const nodeEnvLine = lineOf('NODE_ENV');
  const nodeEnv = nodeEnvLine >= 0 ? unquote(lines[nodeEnvLine].split('=').slice(1).join('=')) : '';
  if (nodeEnv === 'staging' || nodeEnv === 'production') {
    return { ok: false, error: `This .env is for NODE_ENV=${nodeEnv}; set its secrets from your secret store instead.` };
  }

  const changed: string[] = [];
  const used = new Set<string>();
  for (const key of SECRET_KEYS) {
    const index = lineOf(key);
    const current = index >= 0 ? unquote(lines[index].slice(lines[index].indexOf('=') + 1)) : '';
    if (current && !PUBLIC_SECRETS.has(current)) {
      used.add(current);
      continue;
    }
    let value = newSecret();
    while (used.has(value)) value = newSecret();
    used.add(value);
    if (index >= 0) {
      lines[index] = `${key}=${value}`;
    } else {
      // Append before a trailing empty line so the file keeps its final newline
      const at = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
      lines.splice(at, 0, `${key}=${value}`);
    }
    changed.push(key);
  }
  return { ok: true, content: lines.join(eol), changed };
}

function main(): number {
  const envPath = resolve(process.cwd(), '.env');
  const examplePath = resolve(process.cwd(), '.env.example');
  let content: string;
  if (existsSync(envPath)) {
    content = readFileSync(envPath, 'utf8');
  } else if (existsSync(examplePath)) {
    content = readFileSync(examplePath, 'utf8');
    console.log('Creating .env from .env.example.');
  } else {
    console.error('Neither .env nor .env.example was found in the current directory.');
    return 1;
  }

  const result = fillLocalSecrets(content);
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }
  if (result.changed.length === 0) {
    console.log('JWT_SECRET and COOKIE_SECRET are already set to private values; nothing changed.');
    return 0;
  }
  writeFileSync(envPath, result.content, 'utf8');
  console.log(`Generated new ${result.changed.join(' and ')} in .env (values not shown). Existing sessions have ended.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
