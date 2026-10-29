/**
 * Runs before every Vitest file (setupFiles in vitest.config.ts). server/config/env.ts loads the developer's .env, and
 * dotenv never overrides a variable that is already set, even to ''. Setting these first keeps a real Gemini key out
 * of every test process, so no test, assertion message or failure output can contain it, and keeps the AI Tutor
 * disabled whatever .env says. The opt-in live test (gemini.live.test.ts) reads its own GEMINI_LIVE_* variables.
 *
 * The same holds for code execution: no test process uses the developer's provider (a Judge0 key, or the local
 * provider, which the environment check refuses in test mode unless HOST is loopback), whatever .env says. Tests that
 * need a provider build or mock their own; the opt-in live test (judge0.live.test.ts) reads its own JUDGE0_LIVE_*.
 */
process.env.GEMINI_API_KEY = '';
process.env.AI_PROVIDER = 'disabled';
process.env.EXECUTION_PROVIDER = 'disabled';
process.env.JUDGE0_API_KEY = '';
process.env.JUDGE0_API_URL = '';
