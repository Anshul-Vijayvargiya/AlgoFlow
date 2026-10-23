import { describe, it, expect } from 'vitest';
import { DEV_DEFAULT_MONGODB_URI, E2E_EMAIL_DOMAIN, checkE2eDatabaseUri, isE2eEmail, parseMongoUri } from '../e2e/testDatabase';

// The real-backend E2E suite creates and deletes accounts, so it may only run on a disposable local database.
const ATLAS = 'mongodb+srv://user:secret@cluster0.example.mongodb.net/?appName=Cluster0';
const PROTECTED = [ATLAS, DEV_DEFAULT_MONGODB_URI];

describe('E2E database guard', () => {
  it('accepts a local database named *_e2e or *_test', () => {
    for (const uri of [
      'mongodb://127.0.0.1:27999/algoflow_e2e',
      'mongodb://localhost:27999/algoflow_test',
      'mongodb://[::1]:27999/algoflow_e2e',
      'mongodb://127.0.0.1/algoflow_e2e?directConnection=true',
    ]) {
      expect(checkE2eDatabaseUri(uri, PROTECTED), uri).toEqual([]);
    }
  });

  it('refuses a missing URI, the remote cluster from .env, and any mongodb+srv URI', () => {
    expect(checkE2eDatabaseUri(undefined, PROTECTED)).not.toEqual([]);
    expect(checkE2eDatabaseUri('', PROTECTED)).not.toEqual([]);
    expect(checkE2eDatabaseUri(ATLAS, PROTECTED).join()).toMatch(/remote clusters/);
    expect(checkE2eDatabaseUri('mongodb+srv://u:p@x.mongodb.net/algoflow_e2e', PROTECTED).join()).toMatch(/remote clusters/);
  });

  it('refuses remote hosts, even with an e2e database name', () => {
    expect(checkE2eDatabaseUri('mongodb://db.example.com:27017/algoflow_e2e', PROTECTED).join()).toMatch(/this machine/);
    expect(checkE2eDatabaseUri('mongodb://127.0.0.1:27017,db.example.com:27017/algoflow_e2e', PROTECTED).join()).toMatch(/db\.example\.com/);
  });

  it('refuses development and other non-disposable database names', () => {
    for (const uri of ['mongodb://127.0.0.1:27017/algoflow', 'mongodb://127.0.0.1:27999/', 'mongodb://127.0.0.1:27999/production', 'mongodb://127.0.0.1:27999/algoflow_e2e_backup']) {
      expect(checkE2eDatabaseUri(uri, PROTECTED).join(), uri).toMatch(/must end in _e2e or _test/);
    }
  });

  it('refuses a protected database even when its name looks disposable (localhost and 127.0.0.1 are the same)', () => {
    const protectedLocal = ['mongodb://127.0.0.1:27017/shared_test'];
    expect(checkE2eDatabaseUri('mongodb://localhost:27017/shared_test', protectedLocal).join()).toMatch(/protected/);
    expect(checkE2eDatabaseUri('mongodb://localhost:27018/shared_test', protectedLocal)).toEqual([]);
  });

 it('never echoes credentials in its messages', () => {
  const username = 'test-user';
  const password = 'test-password';
  const messages = [
    ...checkE2eDatabaseUri(
      `mongodb://${username}:${password}@db.example.com/algoflow`,
      PROTECTED,
    ),
    ...checkE2eDatabaseUri(
      `mongodb+srv://${username}:${password}@x.mongodb.net/algoflow`,
      PROTECTED,
    ),
  ].join(' ');

  expect(messages).not.toContain(username);
  expect(messages).not.toContain(password);
});

  it('parses hosts, ports and the database name', () => {
    expect(parseMongoUri('mongodb://u:p@127.0.0.1:27999,localhost/algoflow_e2e?x=1')).toEqual({
      hosts: [{ host: '127.0.0.1', port: '27999' }, { host: 'localhost', port: '27017' }],
      database: 'algoflow_e2e',
    });
    expect(parseMongoUri('not a uri')).toBeNull();
  });

  it("recognises the suite's own accounts by their e-mail domain only", () => {
    expect(isE2eEmail(`someone@${E2E_EMAIL_DOMAIN}`)).toBe(true);
    expect(isE2eEmail(`SOMEONE@${E2E_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
    for (const e of ['someone@algoflow.io', `someone@${E2E_EMAIL_DOMAIN}.evil.com`, `${E2E_EMAIL_DOMAIN}@gmail.com`, null]) {
      expect(isE2eEmail(e), String(e)).toBe(false);
    }
  });
});
