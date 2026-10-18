import mongoose from 'mongoose';
import { env } from './env';
import { seedDevelopmentData, assertNoDevSeedAccounts } from './seedDevData';

export async function connectDB(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return; // Tests manage connection or mock memory server
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI);
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    if (env.isStrict) {
      await assertNoDevSeedAccounts();
    } else {
      await seedDevelopmentData();
    }
  } catch (error) {

    console.error('❌ MongoDB startup failure:', error instanceof Error ? error.message : error);
    // Staging and production fail closed; development keeps running so the front end can still be worked on
    if (env.isStrict) {
      process.exit(1);
    }
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB Disconnected.');
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('🍃 MongoDB Connection closed.');
}
