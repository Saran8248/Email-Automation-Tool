import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

export const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Clients (Candidates) Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      app_password TEXT,
      enrollment_id TEXT,
      mobile TEXT,
      target_industries TEXT,
      target_countries TEXT,
      resume_text TEXT,
      email_template TEXT,
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try { await dbRun(`ALTER TABLE clients ADD COLUMN daily_limit INTEGER DEFAULT 10`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN email_template TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN resume_analysis TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN cover_letter_text TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN target_job_roles TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN resume_filename TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE clients ADD COLUMN cover_letter_filename TEXT`); } catch (err) {}

  // Global HR Contacts (Recipients) Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      company TEXT,
      role TEXT,
      industry TEXT,
      country TEXT,
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Outreach Logs tracking Client and Contact mapping
  await dbRun(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      client_name TEXT,
      client_email TEXT,
      contact_name TEXT,
      contact_email TEXT,
      company TEXT,
      subject TEXT,
      body TEXT,
      status TEXT,
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add missing columns to logs table if database was created previously
  try { await dbRun(`ALTER TABLE logs ADD COLUMN client_id INTEGER`); } catch (err) {}
  try { await dbRun(`ALTER TABLE logs ADD COLUMN client_name TEXT`); } catch (err) {}
  try { await dbRun(`ALTER TABLE logs ADD COLUMN client_email TEXT`); } catch (err) {}

  // Insert default configurations
  const defaults = {
    'gemini_api_key': '',
    'daily_limit': '10',
    'send_hour': '12',
    'send_minute': '00',
    'is_scheduler_active': 'false'
  };

  for (const [key, value] of Object.entries(defaults)) {
    await dbRun(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  }
}
export default db;
