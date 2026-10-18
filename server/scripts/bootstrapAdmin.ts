/**
 * Create the first SUPER_ADMIN (see server/services/adminBootstrap.ts for the security model).
 *
 *   1. The future administrator registers and logs in through the normal front end.
 *   2. While logged in, they read their account id from GET /api/auth/me (`user.id`).
 *   3. An operator with database access runs, with the deployment's environment loaded:
 *        npm run admin:bootstrap -- --email admin@example.com --user-id 64f0c0ffee0000000000abcd
 *   4. The administrator logs in again (their old session is revoked).
 *
 * No password is ever passed to or printed by this script. It connects directly (no development seeding).
 */
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { bootstrapSuperAdmin } from '../services/adminBootstrap';

export interface BootstrapArgs {
  email: string;
  userId: string;
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs | { error: string } {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--email' && flag !== '--user-id') return { error: `Unknown argument: ${flag}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { error: `Missing value for ${flag}` };
    values[flag] = value;
    i++;
  }
  if (!values['--email'] || !values['--user-id']) {
    return { error: 'Usage: npm run admin:bootstrap -- --email <email> --user-id <account id from /api/auth/me>' };
  }
  return { email: values['--email'], userId: values['--user-id'] };
}

export function operatorIdentity(): string {
  let user = 'unknown-user';
  try {
    user = os.userInfo().username;
  } catch {
    // some containers have no passwd entry
  }
  return `${user}@${os.hostname()}`;
}

async function main(): Promise<number> {
  const args = parseBootstrapArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(args.error);
    return 2;
  }

  await mongoose.connect(env.MONGODB_URI);
  try {
    const result = await bootstrapSuperAdmin({ ...args, operator: operatorIdentity() });
    if (!result.ok) {
      console.error(`Bootstrap refused: ${result.error}`);
      return 1;
    }
    console.log(
      `SUPER_ADMIN granted to ${result.email} (${result.userId}, previously ${result.previousRole}) in ${env.NODE_ENV}. ` +
        'An audit record was written; the user must log in again.'
    );
    return 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(code => process.exit(code))
    .catch(err => {
      console.error('Bootstrap failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
