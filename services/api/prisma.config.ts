import { config } from 'dotenv';
// Production servers keep their settings in .env.production (never committed); the first file wins.
config({ path: process.env.NODE_ENV === 'production' ? ['.env.production', '.env'] : ['.env'], quiet: true });
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env (not env()) so `prisma generate` works without a database configured
    url: process.env.DATABASE_URL,
  },
});
