import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Promisify DB methods
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

// Initialize Tables
export async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS resume (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      content TEXT,
      custom_prompt TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  // Insert default system prompt and settings if not present
  const defaultPrompt = `You are a professional candidate applying for jobs. Based on my resume and the recipient's details (Company, Industry, Role), craft a personalized, compelling, and concise cold outreach email.
Keep the email structured, clear, and professional. Ensure it explains why I am interested in their company and how my skills align. Focus on a clear call-to-action (e.g., a brief call or review of my attached resume).

Do not include subject line placeholders in the body; only output the clean body of the email.`;

  await dbRun(`INSERT OR IGNORE INTO resume (id, filename, content, custom_prompt) VALUES (1, 'default.txt', '', ?)`, [defaultPrompt]);
  
  // Default program settings
  const defaults = {
    'smtp_host': 'smtp.gmail.com',
    'smtp_port': '465',
    'smtp_user': '',
    'smtp_pass': '',
    'sender_name': 'My Outreach Bot',
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
