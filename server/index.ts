import { app } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';

async function startServer() {
  await connectDB();

  // HOST defaults to 127.0.0.1 in development (loopback only) and 0.0.0.0 in staging/production; see config/env.ts
  const server = app.listen(Number(env.PORT), env.HOST, () => {
    console.log(`🚀 AlgoFlow Backend Server running on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n⚠️ Received ${signal}. Shutting down server gracefully...`);
    server.close(async () => {
      await disconnectDB();
      console.log('👋 Process terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('❌ Server failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
