/**
 * Safety rules for the database the real-backend E2E suite runs against. The suite creates and deletes accounts, so
 * it may only ever touch a disposable database on this machine:
 *  - a plain mongodb:// URI (not mongodb+srv://, which is always a remote cluster),
 *  - every host on loopback,
 *  - a database name ending in _e2e or _test,
 *  - not the same host/port/database as any protected URI (the server's own MONGODB_URI from .env, the development
 *    default, and anything listed in E2E_PROTECTED_MONGODB_URIS).
 * Records the suite creates are recognisable by their e-mail domain (E2E_EMAIL_DOMAIN), and cleanup removes only those.
 */

export const E2E_EMAIL_DOMAIN = 'e2e.algoflow.test';
export const DEFAULT_E2E_MONGO_PORT = 27999;
export const DEFAULT_E2E_DB_NAME = 'algoflow_e2e';
/** the development default in server/config/env.ts */
export const DEV_DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/algoflow';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DISPOSABLE_NAME = /^[A-Za-z0-9-]+_(e2e|test)$/;

interface ParsedMongoUri {
  hosts: { host: string; port: string }[];
  database: string;
}

/** parses mongodb://[user:pass@]host[:port][,host[:port]]/db[?opts]; null for anything else */
export function parseMongoUri(uri: string): ParsedMongoUri | null {
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)/.exec(uri.trim());
  if (!match) return null;
  const hosts = match[1].split(',').map(h => {
    const ipv6 = /^(\[[^\]]+\])(?::(\d+))?$/.exec(h);
    if (ipv6) return { host: ipv6[1], port: ipv6[2] ?? '27017' };
    const [host, port] = h.split(':');
    return { host: host.toLowerCase(), port: port ?? '27017' };
  });
  return { hosts, database: decodeURIComponent(match[2]) };
}

const canonicalHost = (host: string) => (host === 'localhost' || host === '::1' || host === '[::1]' ? '127.0.0.1' : host);
const sameDatabase = (a: ParsedMongoUri, b: ParsedMongoUri) =>
  a.database === b.database && a.hosts.some(h => b.hosts.some(k => canonicalHost(h.host) === canonicalHost(k.host) && h.port === k.port));

/** Returns the reasons the URI must not be used (empty when it is a safe, disposable E2E database). Never echoes credentials. */
export function checkE2eDatabaseUri(uri: string | undefined, protectedUris: readonly (string | undefined)[]): string[] {
  if (!uri) return ['No E2E database URI is configured.'];
  if (/^mongodb\+srv:/i.test(uri.trim())) return ['mongodb+srv:// URIs point at remote clusters; the E2E suite only runs on a local database.'];
  const parsed = parseMongoUri(uri);
  if (!parsed) return ['The E2E database URI is not a mongodb://host[:port]/database URI.'];
  const errors: string[] = [];
  const remote = parsed.hosts.filter(h => !LOOPBACK.has(h.host)).map(h => h.host);
  if (remote.length > 0) errors.push(`The E2E database must be on this machine (loopback); got host(s): ${remote.join(', ')}.`);
  if (!DISPOSABLE_NAME.test(parsed.database)) {
    errors.push(`The E2E database name must end in _e2e or _test (got "${parsed.database || '(none)'}").`);
  }
  for (const p of protectedUris) {
    const prot = p ? parseMongoUri(p) : null;
    if (prot && sameDatabase(parsed, prot)) errors.push('The E2E database URI points at a protected database (the server MONGODB_URI or the development default).');
  }
  return errors;
}

/** an address the suite creates accounts with */
export const isE2eEmail = (email: unknown) => typeof email === 'string' && email.toLowerCase().endsWith(`@${E2E_EMAIL_DOMAIN}`);
