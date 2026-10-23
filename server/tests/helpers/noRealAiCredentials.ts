/**
 * Runs before every Vitest file (setupFiles in vitest.config.ts). server/config/env.ts loads the developer's .env, and
 * dotenv never overrides a variable that is already set, even to ''. Setting these first keeps a real Gemini key out
 * of every test process, so no test, assertion message or failure output can contain it, and keeps the AI Tutor
 * disabled whatever .env says. The opt-in live test (gemini.live.test.ts) reads its own GEMINI_LIVE_* variables.
 */
process.env.GEMINI_API_KEY = '';
process.env.AI_PROVIDER = 'disabled';
