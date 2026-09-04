// Applies server/db/schema.sql to DATABASE_URL (idempotent). The server also does this on boot.
import { createPostgresStore } from '../server/db/postgres.js';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const s = await createPostgresStore(process.env.DATABASE_URL);
console.log('schema applied'); await s.close();
