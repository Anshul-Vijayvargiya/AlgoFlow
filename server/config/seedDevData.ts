import { User } from '../models/User';
import { Problem } from '../models/Problem';
import { hashPassword } from '../services/authService';
import { env } from './env';
import { SEEDED_PRACTICE_PROBLEMS } from './practiceProblemTests';

/** Accounts with passwords committed in this file. They must never exist in a staging or production database. */
export const DEV_SEED_ACCOUNT_EMAILS = ['demo@algoflow.io', 'admin@algoflow.io', 'superadmin@algoflow.io'] as const;

/**
 * Development only (allow-list: staging, production, test and anything else are skipped). The fixed-password
 * ADMIN and SUPER_ADMIN accounts are additionally opt-in via SEED_DEV_ADMINS=true.
 */
export async function seedDevelopmentData(): Promise<void> {
  if (env.NODE_ENV !== 'development') return;

  try {
    // 1. Seed demo user for "Use demo credentials" button in AuthPage.tsx (development builds only)
    const demoUser = await User.findOne({ email: 'demo@algoflow.io' });
    if (!demoUser) {
      await User.create({
        name: 'Demo Engineer',
        email: 'demo@algoflow.io',
        passwordHash: await hashPassword('Demo1234!'),
        role: 'USER',
        accountStatus: 'active',
        streakDays: 14,
        solvedCount: 42,
        algorithmsLearned: 18,
      });
      console.log('🌱 Seeded development demo user: demo@algoflow.io');
    }

    if (env.SEED_DEV_ADMINS === 'true') {
      // 2. Seed admin user
      const adminUser = await User.findOne({ email: 'admin@algoflow.io' });
      if (!adminUser) {
        await User.create({
          name: 'System Admin',
          email: 'admin@algoflow.io',
          passwordHash: await hashPassword('Admin1234!'),
          role: 'ADMIN',
          accountStatus: 'active',
          streakDays: 30,
          solvedCount: 150,
          algorithmsLearned: 35,
        });
        console.log('🌱 Seeded development admin user: admin@algoflow.io');
      }

      // 3. Seed super admin user
      const superAdmin = await User.findOne({ email: 'superadmin@algoflow.io' });
      if (!superAdmin) {
        await User.create({
          name: 'Root Administrator',
          email: 'superadmin@algoflow.io',
          passwordHash: await hashPassword('SuperAdmin1234!'),
          role: 'SUPER_ADMIN',
          accountStatus: 'active',
          streakDays: 45,
          solvedCount: 220,
          algorithmsLearned: 40,
        });
        console.log('🌱 Seeded development super admin: superadmin@algoflow.io');
      }
    }

    // 4. Seed practice problems if collection is empty (an existing database keeps its problems: see
    //    server/scripts/migratePracticeProblems.ts to convert the earlier seeded versions)
    const problemCount = await Problem.countDocuments();
    if (problemCount === 0) {
      await Problem.insertMany(SEEDED_PRACTICE_PROBLEMS);
      console.log(`🌱 Seeded ${SEEDED_PRACTICE_PROBLEMS.length} initial practice problems into MongoDB.`);
    }
  } catch (error) {
    console.warn('⚠️ Development seeding warning (non-fatal):', error);
  }
}

/**
 * Strict environments refuse to start while a known development seed account exists (e.g. a database that was once
 * run in development mode): their passwords are public.
 */
export async function assertNoDevSeedAccounts(): Promise<void> {
  const found = await User.find({ email: { $in: [...DEV_SEED_ACCOUNT_EMAILS] } }).select('email').lean();
  if (found.length > 0) {
    const emails = found.map(u => u.email).join(', ');
    throw new Error(
      `Refusing to start: development seed accounts with public passwords exist in this database (${emails}). ` +
        'Delete them before running in staging or production.'
    );
  }
}
