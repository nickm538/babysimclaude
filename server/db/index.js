import { createPostgresStore } from './postgres.js';
import { createFileStore } from './filestore.js';

export async function createStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const s = await createPostgresStore(url);
    console.log('[db] connected to Postgres');
    return s;
  }
  const dir = process.env.DATA_DIR || './data';
  const s = await createFileStore(dir);
  console.log(`[db] DATABASE_URL not set — using JSON file store at ${dir} (set DATABASE_URL for Postgres)`);
  return s;
}
