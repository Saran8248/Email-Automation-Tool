import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDb, dbRun, dbGet, dbAll } from './db.js';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';

const upload = multer({ storage: multer.memoryStorage() });


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Database
initDb().then(() => {
  console.log('Database initialized successfully.');
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// Helper: Get Settings Map
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
    await syncScheduler();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- CLIENTS (CANDIDATES) API -----------------
app.get('/api/clients', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM clients ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status } = req.body;
    const result = await dbRun(
      `INSERT INTO clients (name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status || 'Active']
    );
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status } = req.body;
    await dbRun(
      `UPDATE clients SET name = ?, email = ?, app_password = ?, enrollment_id = ?, mobile = ?, 
       target_industries = ?, target_countries = ?, resume_text = ?, email_template = ?, status = ? WHERE id = ?`,
      [name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status, id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PDF Parsing Route
app.post('/api/parse-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const parser = new PDFParse({ data: req.file.buffer });
    const result = await parser.getText();
    res.json({ success: true, text: result.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Template Generation Route
app.post('/api/generate-template', async (req, res) => {
  try {
    const { name, resume_text } = req.body;
    const settings = await getSettingsMap();
    if (!settings.gemini_api_key) {
    const fallbackTemplate = {
      subject: `Application for {role} role at {company_name} - {candidate_name}`,
      body: `Hi {contact_name},\n\nI hope this email finds you well. I am reaching out to express my strong interest in potential {role} opportunities at {company_name}.\n\nGiven my background in the {industry} sector and extensive technical experience, I believe I can add immediate value to your team. I have attached my resume details for your review.\n\nI would welcome the opportunity for a brief conversation to discuss how my skills align with your upcoming goals.\n\nBest regards,\n{candidate_name}\n{candidate_email}`
    };
    return res.json({ success: true, template: fallbackTemplate, isFallback: true });
  }
    
    const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `
You are an expert career advisor and cold outreach specialist. 
Based on the candidate's resume, craft a highly professional, polite, and persuasive outreach email template that can be sent to Hiring Managers/HR contacts.
The template MUST use the following placeholders so we can dynamically personalize it later:
- {contact_name} for the recipient's name
- {company_name} for the recipient's company name
- {role} for the recipient's job role / title
- {industry} for the recipient's industry
- {candidate_name} for the candidate's name (${name || 'Candidate'})
- {candidate_email} for the candidate's email

Keep the email concise, structured, and easy to read. Write a compelling subject and body.
Return a JSON structure exactly like this:
{
  "subject": "Interested in roles at {company_name} - {candidate_name}",
  "body": "Hi {contact_name},\\n\\n[professional, compelling email content mentioning details like {role} and {industry}]\\n\\nBest regards,\\n{candidate_name}"
}
Ensure the output is valid JSON. If you use markdown code fences, use \`\`\`json.

Candidate Resume Content:
${resume_text || 'General candidate profile.'}
`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    
    if (text.startsWith('```json')) {
      text = text.substring(7, text.lastIndexOf('```')).trim();
    } else if (text.startsWith('```')) {
      text = text.substring(3, text.lastIndexOf('```')).trim();
    }

    const generated = JSON.parse(text);
    res.json({ success: true, template: generated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- HR CONTACTS API -----------------
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

// Bulk Upload HR File (.csv, .xlsx, .xls, .pdf)
app.post('/api/contacts/bulk-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let csvText = '';
    const filename = (req.file.originalname || '').toLowerCase();

    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (firstSheetName) {
        const worksheet = workbook.Sheets[firstSheetName];
        csvText = XLSX.utils.sheet_to_csv(worksheet);
      }
    } else if (filename.endsWith('.pdf')) {
      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getText();
      csvText = result.text;
    } else {
      csvText = req.file.buffer.toString('utf-8');
    }

    const contacts = parseCSV(csvText);
    let imported = 0;
    let failed = 0;

    for (const c of contacts) {
      try {
        await dbRun(
          'INSERT OR REPLACE INTO contacts (name, email, company, role, industry, country) VALUES (?, ?, ?, ?, ?, ?)',
          [c.name, c.email, c.company, c.role, c.industry, c.country]
        );
        imported++;
      } catch (err) {
        console.error('Failed to import contact from file:', err);
        failed++;
      }
    }
    res.json({ success: true, imported, failed });
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
          'INSERT OR REPLACE INTO contacts (name, email, company, role, industry, country) VALUES (?, ?, ?, ?, ?, ?)',
          [c.name, c.email, c.company, c.role, c.industry, c.country]
        );
        imported++;
      } catch (err) {
        console.error('Failed to import contact:', err);
        failed++;
      }
    }
    res.json({ success: true, imported, failed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  // Clean UTF-8 BOM or other zero-width characters at the start of text
  text = text.replace(/^[\uFEFF\uFFFE\u200B\u200D]/g, '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  
  // Detect separator: count commas vs semicolons vs tabs in the first line
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let sep = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) sep = ';';
  else if (tabCount > commaCount && tabCount > semicolonCount) sep = '\t';

  // Helper to parse a single CSV line respecting quotes and keeping empty fields
  const parseLine = (line, separator) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, '').trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, '').trim());
    return result;
  };

  const firstLineValues = parseLine(lines[0], sep);
  // If first line contains an '@' symbol, it's a data row (no header row present)
  const hasHeader = !firstLineValues.some(v => v.includes('@'));

  let nameIndex = -1;
  let emailIndex = -1;
  let companyIndex = -1;
  let roleIndex = -1;
  let industryIndex = -1;
  let countryIndex = -1;

  if (hasHeader) {
    const headers = firstLineValues.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    nameIndex = headers.findIndex(h => h === 'name' || h.includes('name') || h === 'contact' || h.includes('person') || h.includes('hr'));
    emailIndex = headers.findIndex(h => h === 'email' || h.includes('email') || h.includes('mail'));
    companyIndex = headers.findIndex(h => h === 'company' || h.includes('company') || h === 'firm' || h === 'organization' || h === 'employer' || h.includes('corp'));
    roleIndex = headers.findIndex(h => h === 'role' || h.includes('role') || h === 'title' || h.includes('title') || h === 'designation' || h === 'job' || h.includes('position'));
    industryIndex = headers.findIndex(h => h === 'industry' || h.includes('industry') || h === 'sector' || h.includes('domain'));
    countryIndex = headers.findIndex(h => h === 'country' || h.includes('country') || h === 'location' || h === 'nation' || h.includes('state'));
  }

  const contacts = [];
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const values = parseLine(lines[i], sep);
    
    // Extract by header index if matched, else fallback to column position
    let name = (nameIndex !== -1 && values[nameIndex] !== undefined) ? values[nameIndex] : (values[0] || '');
    let email = (emailIndex !== -1 && values[emailIndex] !== undefined) ? values[emailIndex] : (values[1] || '');
    const company = (companyIndex !== -1 && values[companyIndex] !== undefined) ? values[companyIndex] : (values[2] || '');
    const role = (roleIndex !== -1 && values[roleIndex] !== undefined) ? values[roleIndex] : (values[3] || '');
    const industry = (industryIndex !== -1 && values[industryIndex] !== undefined) ? values[industryIndex] : (values[4] || '');
    const country = (countryIndex !== -1 && values[countryIndex] !== undefined) ? values[countryIndex] : (values[5] || '');

    // Fallback: if email wasn't found by index, find any value that contains '@'
    if (!email || !email.includes('@')) {
      const emailVal = values.find(v => v.includes('@'));
      if (emailVal) email = emailVal;
    }

    // Fallback: if name is empty, extract from email prefix
    if (!name && email && email.includes('@')) {
      const prefix = email.split('@')[0].replace(/[._-]/g, ' ');
      name = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    if (email && email.includes('@')) {
      contacts.push({ name: name || 'HR Contact', email, company, role, industry, country });
    }
  }

  // Fallback scanner for PDF / Unstructured / Key-Value text if no structured CSV rows were matched
  if (contacts.length === 0) {
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const seenEmails = new Set();
    const allMatches = [...text.matchAll(emailRegex)];

    for (const match of allMatches) {
      const email = match[1].toLowerCase();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);

      const matchIndex = match.index || 0;
      const snippetStart = Math.max(0, matchIndex - 200);
      const snippetEnd = Math.min(text.length, matchIndex + 200);
      const snippet = text.substring(snippetStart, snippetEnd);

      let name = '';
      let company = '';
      let role = '';
      let country = '';

      const nameM = snippet.match(/(?:Name|Contact|HR|Person|Candidate):\s*([A-Za-z\s.'-]+)/i);
      if (nameM) name = nameM[1].trim();

      const compM = snippet.match(/(?:Company|Firm|Organization|Employer):\s*([A-Za-z0-9\s.'-]+)/i);
      if (compM) company = compM[1].trim();

      const roleM = snippet.match(/(?:Role|Title|Position|Job):\s*([A-Za-z0-9\s.'-]+)/i);
      if (roleM) role = roleM[1].trim();

      const countryM = snippet.match(/(?:Country|Location):\s*([A-Za-z\s.'-]+)/i);
      if (countryM) country = countryM[1].trim();

      if (!name) {
        const prefix = email.split('@')[0].replace(/[._-]/g, ' ');
        name = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      }

      contacts.push({
        name: name || 'HR Contact',
        email,
        company: company || '',
        role: role || '',
        industry: '',
        country: country || ''
      });
    }
  }

  return contacts;
}

// ----------------- OUTREACH LOGS API -----------------
app.get('/api/logs', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM logs ORDER BY id DESC LIMIT 1000');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logs/clear', async (req, res) => {
  try {
    await dbRun('DELETE FROM logs');
    res.json({ success: true, message: 'Outreach logs cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------- GENERATION & SENDING LOGIC -----------------

// Generate preview for a client and contact
app.post('/api/generate-preview', async (req, res) => {
  try {
    const { clientId, contactId } = req.body;
    const client = await dbGet('SELECT * FROM clients WHERE id = ?', [clientId]);
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
    
    if (!client || !contact) {
      return res.status(404).json({ error: 'Client or Contact not found' });
    }

    const settings = await getSettingsMap();
    const generated = await generateEmailContent(client, contact, settings);
    res.json(generated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send custom email for a specific client to a contact
app.post('/api/send-email', async (req, res) => {
  const { clientId, contactId, customSubject, customBody } = req.body;
  try {
    const client = await dbGet('SELECT * FROM clients WHERE id = ?', [clientId]);
    const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
    
    if (!client || !contact) {
      return res.status(404).json({ error: 'Client or Contact not found' });
    }

    const settings = await getSettingsMap();
    let subject = customSubject;
    let body = customBody;

    if (!subject || !body) {
      const generated = await generateEmailContent(client, contact, settings);
      subject = generated.subject;
      body = generated.body;
    }

    await sendRawEmail(contact.email, subject, body, client);

    // Save to logs
    await dbRun(
      `INSERT INTO logs (client_id, client_name, client_email, contact_name, contact_email, company, subject, body, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [client.id, client.name, client.email, contact.name, contact.email, contact.company, subject, body, 'Sent']
    );

    res.json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    try {
      const client = await dbGet('SELECT * FROM clients WHERE id = ?', [clientId]);
      const contact = await dbGet('SELECT * FROM contacts WHERE id = ?', [contactId]);
      if (client && contact) {
        await dbRun(
          `INSERT INTO logs (client_id, client_name, client_email, contact_name, contact_email, company, subject, body, status, error_message) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [client.id, client.name, client.email, contact.name, contact.email, contact.company, customSubject || '', customBody || '', 'Failed', error.message]
        );
      }
    } catch (dbErr) {
      console.error('Failed to log email send failure:', dbErr);
    }
    res.status(500).json({ error: error.message });
  }
});

// Trigger campaign for all clients
app.post('/api/campaign/trigger', async (req, res) => {
  try {
    const results = await runDailyCampaign();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test SMTP connection (takes client's parameters)
app.post('/api/clients/test-smtp', async (req, res) => {
  try {
    const client = req.body; // containing name, email, app_password
    await sendRawEmail(
      client.email,
      "OutreachSphere SMTP connection test success",
      `Hello! This is a test email confirming that your email configuration for ${client.name} is working correctly.`,
      client
    );
    res.json({ success: true, message: 'SMTP Test succeeded! Check your inbox.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Core Gemini content generator
async function generateEmailContent(client, contact, settings) {
  if (client.email_template) {
    try {
      const template = JSON.parse(client.email_template);
      if (template.subject && template.body) {
        const replacePlaceholders = (text) => {
          return text
            .replace(/{contact_name}/g, contact.name || 'Hiring Manager')
            .replace(/{company_name}/g, contact.company || 'your company')
            .replace(/{role}/g, contact.role || 'Hiring Team')
            .replace(/{industry}/g, contact.industry || 'your industry')
            .replace(/{candidate_name}/g, client.name || '')
            .replace(/{candidate_email}/g, client.email || '')
            .replace(/{candidate_mobile}/g, client.mobile || '');
        };
        return {
          subject: replacePlaceholders(template.subject),
          body: replacePlaceholders(template.body)
        };
      }
    } catch (e) {
      console.error('Failed to parse or use candidate email template:', e);
    }
  }

  if (!settings.gemini_api_key) {
    return {
      subject: `Application for ${contact.role || 'Opportunity'} at ${contact.company || 'your team'} - ${client.name}`,
      body: `Hi ${contact.name || 'Hiring Manager'},\n\nI hope you are having a great week. I am reaching out to express my strong interest in ${contact.role || 'relevant opportunities'} at ${contact.company || 'your company'}.\n\nWith my background and expertise in ${contact.industry || 'the industry'}, I am confident in my ability to contribute effectively to your team. Please find my resume details below:\n\n${client.resume_text || ''}\n\nI would love the opportunity to connect for a quick 10-minute call to introduce myself.\n\nBest regards,\n${client.name}\n${client.email}`
    };
  }

  const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const defaultPrompt = `You are a professional candidate applying for jobs. Based on my resume and the recipient's details (Company, Industry, Role), craft a personalized, compelling, and concise cold outreach email.
Keep the email structured, clear, and professional. Ensure it explains why I am interested in their company and how my skills align. Focus on a clear call-to-action (e.g., a brief call or review of my attached resume).

Do not include subject line placeholders in the body; only output the clean body of the email.`;

  const prompt = `
${defaultPrompt}

My Profile & Resume Details (Candidate):
- Name: ${client.name}
- Email: ${client.email}
- Enrollment ID: ${client.enrollment_id || 'N/A'}
- Mobile: ${client.mobile || 'N/A'}
---
Resume Content:
${client.resume_text || 'No resume details provided. Please generate a general professional introduction.'}
---

Recipient Details (Hiring Contact):
- Name: ${contact.name}
- Email: ${contact.email}
- Company: ${contact.company || 'Target Company'}
- Job Role: ${contact.role || 'Hiring Manager'}
- Industry: ${contact.industry || 'relevant sector'}
- Country: ${contact.country || 'N/A'}

Generate the email now. Return a JSON structure exactly like this:
{
  "subject": "personalized subject line",
  "body": "Hi ${contact.name},\\n\\n[professional cover letter style body of the email]\\n\\nBest regards,\\n${client.name}"
}
Ensure the output is valid JSON. If you use code fences, use \`\`\`json.
`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();
  
  if (text.startsWith('```json')) {
    text = text.substring(7, text.lastIndexOf('```')).trim();
  } else if (text.startsWith('```')) {
    text = text.substring(3, text.lastIndexOf('```')).trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Gemini response JSON. Text:', text);
    let subject = `Application for ${contact.role || 'Software Role'} - ${client.name}`;
    return { subject, body: text };
  }
}

async function sendRawEmail(to, subject, body, client) {
  if (!client.email || !client.app_password) {
    throw new Error(`Email address or Gmail App Password is not configured for candidate ${client.name}.`);
  }

  // Gmail SMTP default configurations
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: client.email,
      pass: client.app_password,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  const htmlBody = body.replace(/\n/g, '<br>');

  const mailOptions = {
    from: `"${client.name}" <${client.email}>`,
    to,
    subject,
    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${htmlBody}</div>`,
  };

  return transporter.sendMail(mailOptions);
}

// Global scheduler campaign run
async function runDailyCampaign() {
  console.log("Running scheduled multi-candidate email campaign...");
  const settings = await getSettingsMap();
  const limitPerCandidate = parseInt(settings.daily_limit) || 10;

  // Get active candidates
  const activeClients = await dbAll("SELECT * FROM clients WHERE status = 'Active'");
  if (activeClients.length === 0) {
    return { success: false, reason: "No active candidate profiles found. Please add a candidate in the Clients tab first." };
  }

  // Check if candidates have app password configured
  const clientsWithPass = activeClients.filter(c => c.app_password && c.app_password.trim().length > 0);
  if (clientsWithPass.length === 0) {
    return { 
      success: false, 
      reason: "No active candidates have a Gmail App Password configured. Please edit the candidate in Clients tab and enter their Gmail App Password." 
    };
  }

  // Get all active HR contacts
  const allContacts = await dbAll("SELECT * FROM contacts WHERE status = 'Active'");
  if (allContacts.length === 0) {
    return { success: false, reason: "No active HR contacts found. Please upload or add contacts in HR Contacts Manager." };
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const client of activeClients) {
    // Determine matches based on client's target industries and target countries
    let targetCountries = [];
    let targetIndustries = [];
    
    try {
      if (client.target_countries) targetCountries = JSON.parse(client.target_countries);
    } catch(e) {}
    try {
      if (client.target_industries) targetIndustries = JSON.parse(client.target_industries);
    } catch(e) {}

    // Filter contacts matching targets and not emailed by this client yet
    const matchingContacts = allContacts.filter(contact => {
      // Country match (if candidate target is configured)
      if (targetCountries.length > 0 && contact.country) {
        if (!targetCountries.includes(contact.country)) return false;
      }
      // Industry match (if candidate target is configured)
      if (targetIndustries.length > 0 && contact.industry) {
        if (!targetIndustries.includes(contact.industry)) return false;
      }
      return true;
    });

    // Query DB logs to exclude already emailed contacts by this client
    const alreadySentLogs = await dbAll(
      "SELECT contact_email FROM logs WHERE client_id = ? AND status = 'Sent'", 
      [client.id]
    );
    const sentEmailsList = alreadySentLogs.map(l => l.contact_email);
    
    const candidateTodoContacts = matchingContacts.filter(
      contact => !sentEmailsList.includes(contact.email)
    ).slice(0, limitPerCandidate);

    console.log(`Candidate ${client.name} has ${candidateTodoContacts.length} target contacts to email today.`);

    for (const contact of candidateTodoContacts) {
      try {
        const generated = await generateEmailContent(client, contact, settings);
        await sendRawEmail(contact.email, generated.subject, generated.body, client);
        
        await dbRun(
          `INSERT INTO logs (client_id, client_name, client_email, contact_name, contact_email, company, subject, body, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [client.id, client.name, client.email, contact.name, contact.email, contact.company, generated.subject, generated.body, 'Sent']
        );
        totalSent++;
        await new Promise(r => setTimeout(r, 4000)); // Delay between sends
      } catch (error) {
        console.error(`Failed to send email for ${client.name} to ${contact.email}:`, error);
        totalFailed++;
        await dbRun(
          `INSERT INTO logs (client_id, client_name, client_email, contact_name, contact_email, company, subject, body, status, error_message) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [client.id, client.name, client.email, contact.name, contact.email, contact.company, '', '', 'Failed', error.message]
        );
      }
    }
  }

  return { success: true, sent: totalSent, failed: totalFailed };
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

setTimeout(() => {
  syncScheduler().catch(err => console.error("Failed to start scheduler on load:", err));
}, 2000);

// Serve static build files
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: `API route ${req.path} not found` });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API Server is running.');
  });
}

// Global JSON Error Handler
app.use((err, req, res, next) => {
  console.error("Express API Error:", err);
  res.status(err.status || 500).json({ error: err.message || "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`Email Automation Server is listening at http://localhost:${port}`);
});
