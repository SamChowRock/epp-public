import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: './recovery-history' },
  datasource: { url: process.env.DATABASE_URL! },
});
