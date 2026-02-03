import pg from 'pg';
import { config } from './config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        api_key VARCHAR(128) UNIQUE NOT NULL,
        label VARCHAR(255),
        address VARCHAR(42) UNIQUE NOT NULL,
        encrypted_key TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        rose_api_key TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
      CREATE INDEX IF NOT EXISTS idx_agents_address ON agents(address);
    `);
    console.log('[DB] Tables initialized');
  } finally {
    client.release();
  }
}

export interface AgentRow {
  id: number;
  api_key: string;
  label: string | null;
  address: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  rose_api_key: string | null;
  created_at: Date;
}
