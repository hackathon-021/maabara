import { config } from 'dotenv';

// .env.test wins; tests must never touch the dev database.
config({ path: '.env.test', override: true });
if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('Refusing to run tests: DATABASE_URL in .env.test must point at a *test* database');
}
