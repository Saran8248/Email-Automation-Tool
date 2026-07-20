import express from 'express';
import cors from 'cors';
import multer from 'multer';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDb, dbRun, dbGet, dbAll } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Set up file upload destination for resumes or CSVs
const upload = multer({ dest: 'uploads/' });

// Initialize Database on server start
initDb().then(() => {
  console.log('Database initialized successfully.');
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// Helper: Get Settings as a single object
async function getSettingsMap() {
  const rows = await dbAll('SELECT key, value FROM settings');
  const settings = {};
  rows.forEach(r => {
    settings[r.key] = r.value;
  });
  return settings;
}

// ----------------- SETTINGS API -----------------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    // Restart scheduler if active state/schedule changed
    await syncScheduler();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- RESUME API -----------------
app.get('/api/resume', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM resume WHERE id = 1');
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resume', async (req, res) => {
  try {
    const { content, custom_prompt, filename } = req.body;
    await dbRun(
      'UPDATE resume SET content = ?, custom_prompt = ?, filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [content, custom_prompt, filename || 'custom.txt']
    );
    res.json({ success: true, message: 'Resume updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- CONTACTS API -----------------
app.get('/api/contacts', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM contacts ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const { name, email, company, role, industry, country, status } = req.body;
    const result = await dbRun(
      'INSERT INTO contacts (name, email, company, role, industry, country, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, company, role, industry, country, status || 'Active']
    );
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, company, role, industry, country, status } = req.body;
    await dbRun(
      'UPDATE contacts SET name = ?, email = ?, company = ?, role = ?, industry = ?, country = ?, status = ? WHERE id = ?',
      [name, email, company, role, industry, country, status, id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Upload CSV Contacts
app.post('/api/contacts/bulk-paste', async (req, res) => {
  try {
    const { csvText } = req.body;
    const contacts = parseCSV(csvText);
    let imported = 0;
    let failed = 0;

    for (const c of contacts) {
      try {
        await dbRun(
          'INSERT INTO contacts (name, email, company, role, industry, country) VALUES (?, ?, ?, ?, ?, ?)',
          [c.name, c.email, c.company, c.role, c.industry, c.country]
        );
        imported++;
      } catch (err) {
        failed++; // Duplicate email or SQL issue
      }
    }
    res.json({ success: true, imported, failed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CSV parser implementation
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const contacts = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Splitting simple CSV fields (allowing values inside quotes containing commas)
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
    const values = matches.map(v => v.replace(/^["']|["']$/g, '').trim());

    const nameIndex = headers.indexOf('name');
    const emailIndex = headers.indexOf('email');
    const companyIndex = headers.indexOf('company');
    const roleIndex = headers.indexOf('role');
    const industryIndex = headers.indexOf('industry');
    const countryIndex = headers.indexOf('country');

    const name = values[nameIndex !== -1 ? nameIndex : 0] || '';
    const email = values[emailIndex !== -1 ? emailIndex : 1] || '';
    const company = values[companyIndex !== -1 ? companyIndex : 2] || '';
    const role = values[roleIndex !== -1 ? roleIndex : 3] || '';
    const industry = values[industryIndex !== -1 ? industryIndex : 4] || '';
    const country = values[countryIndex !== -1 ? countryIndex : 5] || '';

    if (name && email && email.includes('@')) {
      contacts.push({ name, email, company, role, industry, country });
    }
  }
  return contacts;
}

// ----------------- OUTREACH LOGS API -----------------
app.get('/api/logs', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM logs ORDER BY id DESC LIMIT 500');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear Logs
app.post('/api/logs/clear', async (req, res) => {
  try {
    await dbRun('DELETE FROM logs');
    res.json({ success: true, message: 'Outreach logs cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- GENERATION & SENDING LOGIC -----------------

// Generate preview
app.post('/api/generate-preview', async (req, res) => {
  try {
    const { contactId } = req.body;
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const resume = await dbGet('SELECT * FROM resume WHERE id = 1');
    const settings = await getSettingsMap();

    const generated = await generateEmailContent(resume, contact, settings);
    res.json(generated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single email sender (Manual triggers)
app.post('/api/send-email', async (req, res) => {
  const { contactId, customSubject, customBody } = req.body;
  try {
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const settings = await getSettingsMap();
    let subject = customSubject;
    let body = customBody;

    // Generate if not provided
    if (!subject || !body) {
      const resume = await dbGet('SELECT * FROM resume WHERE id = 1');
      const generated = await generateEmailContent(resume, contact, settings);
      subject = generated.subject;
      body = generated.body;
    }

    await sendRawEmail(contact.email, subject, body, settings);

    // Save to success log
    await dbRun(
      'INSERT INTO logs (contact_name, contact_email, company, subject, body, status) VALUES (?, ?, ?, ?, ?, ?)',
      [contact.name, contact.email, contact.company, subject, body, 'Sent']
    );

    res.json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    // Log failure
    try {
      const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
      if (contact) {
        await dbRun(
          'INSERT INTO logs (contact_name, contact_email, company, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [contact.name, contact.email, contact.company, customSubject || '', customBody || '', 'Failed', error.message]
        );
      }
    } catch (dbErr) {
      console.error('Failed to log email send failure:', dbErr);
    }
    res.status(500).json({ error: error.message });
  }
});

// Trigger complete campaign (manual trigger of the daily list)
app.post('/api/campaign/trigger', async (req, res) => {
  try {
    const results = await runDailyCampaign();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- CORE LOGIC UTILS -----------------

async function generateEmailContent(resume, contact, settings) {
  if (!settings.gemini_api_key) {
    throw new Error('Gemini API key is not configured in settings.');
  }

  const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
  // Using gemini-2.5-flash as default, or fall back to gemini-1.5-flash
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
${resume.custom_prompt}

My Resume Details:
---
${resume.content || 'No resume details provided. Please generate a general professional introduction.'}
---

Recipient Details:
- Name: ${contact.name}
- Email: ${contact.email}
- Company: ${contact.company || 'Target Company'}
- Job Role: ${contact.role || 'Hiring Manager'}
- Industry: ${contact.industry || 'relevant sector'}
- Country: ${contact.country || 'N/A'}

Generate the email now. Return a JSON structure exactly like this:
{
  "subject": "personalized subject line",
  "body": "Hi ${contact.name},\\n\\n[professional message]\\n\\nBest regards,\\n[Sender]"
}
Ensure the output is valid JSON, no backticks or extra markdown wrap outside the JSON structure. If you must use code fences, use \`\`\`json.
`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();
  
  // Sanitize text if Gemini returns markdown code blocks
  if (text.startsWith('```json')) {
    text = text.substring(7, text.lastIndexOf('```')).trim();
  } else if (text.startsWith('```')) {
    text = text.substring(3, text.lastIndexOf('```')).trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Gemini didn\'t return proper JSON. raw text:', text);
    // Parse manually or fallback
    const lines = text.split('\n');
    let subject = `Job Application / Introduction`;
    let body = text;
    
    // Check if subject can be parsed
    const subMatch = text.match(/"subject"\s*:\s*"(.*?)"/);
    const bodyMatch = text.match(/"body"\s*:\s*"(.*?)"/s);
    if (subMatch) subject = subMatch[1];
    if (bodyMatch) body = bodyMatch[1].replace(/\\n/g, '\n');
    
    return { subject, body };
  }
}

async function sendRawEmail(to, subject, body, settings) {
  if (!settings.smtp_user || !settings.smtp_pass) {
    throw new Error('SMTP user or password not configured in settings.');
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host || 'smtp.gmail.com',
    port: parseInt(settings.smtp_port) || 465,
    secure: (settings.smtp_port === '465'), // Port 465 is secure ssl
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
    // Adding timeout values to prevent indefinite hangs
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  // Convert raw body text newline to HTML breaks
  const htmlBody = body.replace(/\n/g, '<br>');

  const mailOptions = {
    from: `"${settings.sender_name}" <${settings.smtp_user}>`,
    to,
    subject,
    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${htmlBody}</div>`,
  };

  return transporter.sendMail(mailOptions);
}

// SMTP Connection Test API
app.post('/api/settings/test-smtp', async (req, res) => {
  try {
    const settings = req.body;
    await sendRawEmail(
      settings.smtp_user,
      "SMTP connection test success",
      "Hello! This is a test email confirming that your email automation settings are configured correctly.",
      settings
    );
    res.json({ success: true, message: 'SMTP Test email sent successfully to yourself!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run Daily Campaign Logic
async function runDailyCampaign() {
  console.log("Running scheduled email campaign...");
  const settings = await getSettingsMap();
  const limit = parseInt(settings.daily_limit) || 10;
  
  if (!settings.gemini_api_key || !settings.smtp_user || !settings.smtp_pass) {
    console.log("Campaign aborted: API key or SMTP config missing.");
    return { success: false, reason: "Configuration incomplete" };
  }

  // Get active contacts who haven't received an email recently (we can just check if they are "Active")
  // For a complete automation, we can pick 'Active' contacts up to the daily limit,
  // then change their status to 'Sent' (or keep track using logs) so we don't double email.
  // Let's select active contacts who do not have a successful entry in the log table.
  const activeContacts = await dbAll(`
    SELECT * FROM contacts 
    WHERE status = 'Active' 
    AND email NOT IN (SELECT contact_email FROM logs WHERE status = 'Sent')
    LIMIT ?
  `, [limit]);

  if (activeContacts.length === 0) {
    console.log("No contacts left to email today.");
    return { success: true, sent: 0, skipped: 0, message: "No active, unsent contacts found." };
  }

  const resume = await dbGet('SELECT * FROM resume WHERE id = 1');
  let sentCount = 0;
  let failCount = 0;

  for (const contact of activeContacts) {
    try {
      // 1. Generate Content
      const generated = await generateEmailContent(resume, contact, settings);
      
      // 2. Send Email
      await sendRawEmail(contact.email, generated.subject, generated.body, settings);
      
      // 3. Log Success
      await dbRun(
        'INSERT INTO logs (contact_name, contact_email, company, subject, body, status) VALUES (?, ?, ?, ?, ?, ?)',
        [contact.name, contact.email, contact.company, generated.subject, generated.body, 'Sent']
      );
      
      // Optionally update contact status so we know they were emailed
      // await dbRun('UPDATE contacts SET status = "Emailed" WHERE id = ?', [contact.id]);
      
      sentCount++;
      // Wait a few seconds between sends to avoid rate limits
      await new Promise(r => setTimeout(r, 3000));
    } catch (error) {
      console.error(`Failed to send email to ${contact.email}:`, error);
      failCount++;
      await dbRun(
        'INSERT INTO logs (contact_name, contact_email, company, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [contact.name, contact.email, contact.company, '', '', 'Failed', error.message]
      );
    }
  }

  return { success: true, sent: sentCount, failed: failCount };
}

// ----------------- SCHEDULER SYSTEM -----------------
let activeCronJob = null;

async function syncScheduler() {
  const settings = await getSettingsMap();
  const isActive = settings.is_scheduler_active === 'true';
  const hour = settings.send_hour || '12';
  const minute = settings.send_minute || '00';

  if (activeCronJob) {
    activeCronJob.stop();
    activeCronJob = null;
    console.log("Stopped active scheduler job.");
  }

  if (isActive) {
    // Cron pattern: minute hour * * * (daily at specified time)
    const cronPattern = `${minute} ${hour} * * *`;
    console.log(`Setting up daily scheduler with pattern: "${cronPattern}"`);
    activeCronJob = cron.schedule(cronPattern, async () => {
      try {
        await runDailyCampaign();
      } catch (err) {
        console.error("Error in scheduled campaign run:", err);
      }
    });
    activeCronJob.start();
  }
}

// Sync scheduler on boot after DB is ready
setTimeout(() => {
  syncScheduler().catch(err => console.error("Failed to start scheduler on load:", err));
}, 2000);

// ----------------- FRONTEND SERVING -----------------
// Serve production Vite assets if they exist
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API Server is running. Frontend dev server is separate in development.');
  });
}

// Start Server
app.listen(port, () => {
  console.log(`Email Automation Server is listening at http://localhost:${port}`);
});
