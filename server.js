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
import PDFDocument from 'pdfkit';

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
    const { name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status, resume_analysis, cover_letter_text, target_job_roles, resume_filename, cover_letter_filename, daily_limit } = req.body;
    const result = await dbRun(
      `INSERT INTO clients (name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status, resume_analysis, cover_letter_text, target_job_roles, resume_filename, cover_letter_filename, daily_limit) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status || 'Active', resume_analysis || '', cover_letter_text || '', target_job_roles || '', resume_filename || '', cover_letter_filename || '', parseInt(daily_limit) || 10]
    );
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status, resume_analysis, cover_letter_text, target_job_roles, resume_filename, cover_letter_filename, daily_limit } = req.body;
    await dbRun(
      `UPDATE clients SET name = ?, email = ?, app_password = ?, enrollment_id = ?, mobile = ?, 
       target_industries = ?, target_countries = ?, resume_text = ?, email_template = ?, status = ?,
       resume_analysis = ?, cover_letter_text = ?, target_job_roles = ?, resume_filename = ?, cover_letter_filename = ?, daily_limit = ? WHERE id = ?`,
      [name, email, app_password, enrollment_id, mobile, target_industries, target_countries, resume_text, email_template, status, resume_analysis || '', cover_letter_text || '', target_job_roles || '', resume_filename || '', cover_letter_filename || '', parseInt(daily_limit) || 10, id]
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

app.get('/api/countries', async (req, res) => {
  try {
    const rows = await dbAll("SELECT DISTINCT country FROM contacts WHERE country IS NOT NULL AND country != ''");
    const dbCountries = rows.map(r => r.country.trim());
    const defaultList = ['Germany', 'UAE', 'Netherlands', 'Australia'];
    const merged = Array.from(new Set([...defaultList, ...dbCountries])).filter(Boolean);
    merged.sort();
    res.json(merged);
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
    const candidateName = name || 'Candidate';

    if (!settings.gemini_api_key) {
      const fallbackTemplate = {
        resume_analysis: `${candidateName} is an experienced professional with specialized technical skills and a proven track record of delivering end-to-end solutions across digital platforms.`,
        target_job_roles: 'Senior Software Engineer, QA / Software Engineer, Software Test Engineer, Automation Testing Engineer, Test Automation Lead',
        cover_letter: `Dear Hiring Manager,\n\nI am writing to express my strong interest in relevant opportunities at your organization. With extensive technical experience and a history of quality delivery, I am confident in my ability to add immediate value to your engineering initiatives.\n\nThank you for considering my application.\n\nBest regards,\n${candidateName}`,
        subject: `Experienced {role} | {role} Application at {company}`,
        body: `Dear {hr_name},\n\nI hope this email finds you well.\n\nI am writing to express my strong interest in potential {role} opportunities at {company}. With extensive hands-on experience in {industry} and a proven track record of engineering scalable automation solutions, I have consistently driven quality releases, reduced testing overhead, and accelerated release readiness across complex digital platforms.\n\nIn my recent roles, I have led the design and implementation of end-to-end test automation frameworks, automated comprehensive regression scenarios, and integrated continuous testing pipelines into CI/CD workflows. My expertise spans test automation, API testing, framework architecture, and cross-functional Agile delivery.\n\nI am particularly impressed by {company}'s ongoing innovation and global engineering impact. I would welcome the opportunity to discuss how my technical expertise, domain knowledge, and passion for software quality can add immediate value to your engineering team and upcoming projects.\n\nThank you for your time and consideration. I look forward to connecting with you soon.\n\nBest regards,\n{client_name}`
      };
      return res.json({ success: true, template: fallbackTemplate, isFallback: true });
    }
    
    const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `
You are an expert career advisor and cold outreach specialist. 
Based on the candidate's resume, generate a complete, highly persuasive outreach package.
CRITICAL REQUIREMENT FOR EMAIL BODY:
The outreach email body MUST be a detailed, comprehensive 4-5 paragraph email (NOT short 1-2 lines). It must highlight candidate technical experience, framework architecture, achievements, and value proposal.

The outreach email body MUST use these exact placeholders:
- {hr_name} for recipient HR name
- {company} for target company name
- {role} for target job position
- {client_name} for candidate name (${candidateName})
- {job_roles} for candidate target job titles
- {industry} for industry sector
- {country} for country

Return a JSON object with EXACTLY these 5 fields:
{
  "resume_analysis": "1-2 sentence concise summary of candidate skills and experience",
  "target_job_roles": "Comma-separated list of 4-6 matching target job roles",
  "cover_letter": "Professional, well-written cover letter text for the candidate",
  "subject": "Experienced {role} | {role} Application at {company}",
  "body": "Dear {hr_name},\\n\\nI hope this email finds you well.\\n\\nI am writing to express my strong interest in potential {role} opportunities at {company}... [4-5 rich, professional paragraphs detailing experience, framework engineering, and value proposition]\\n\\nBest regards,\\n{client_name}"
}
Ensure output is valid JSON.

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

    // Fallback: if name is empty, set to Hiring Manager
    if (!name) {
      name = 'Hiring Manager';
    }

    if (email && email.includes('@')) {
      contacts.push({
        name: name || 'Hiring Manager',
        email,
        company: company || '',
        role: role || '',
        industry: industry || '',
        country: country || ''
      });
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

      contacts.push({
        name: name || 'Hiring Manager',
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

// Core email content generator
async function generateEmailContent(client, contact, settings) {
  const replacePlaceholders = (text) => {
    if (!text) return '';
    let result = text;

    // Determine cleanest target role for the email
    let cleanRole = 'Software Engineer';
    if (contact.role && contact.role.trim().length > 0 && !contact.role.includes('{') && contact.role.toLowerCase() !== 'hiring team') {
      cleanRole = contact.role.trim();
    } else if (client.target_job_roles && client.target_job_roles.trim().length > 0) {
      cleanRole = client.target_job_roles.split(',')[0].trim();
    }

    // Determine cleanest HR recipient name with generic name detection
    let cleanHrName = 'Hiring Manager';
    if (contact.name && contact.name.trim().length > 0 && !contact.name.includes('{') && contact.name.toLowerCase() !== 'hr contact') {
      const nameLower = contact.name.trim().toLowerCase();
      const genericTerms = ['company', 'agency', 'support', 'services', 'store', 'supplier', 'service', 'manufacturer', 'office', 'contact', 'group', 'corporation', 'ltd', 'llc', 'inc', 'firm', 'recruitment', 'team', 'jobs', 'careers', 'manager', 'specialist', 'recruiter'];
      let isGeneric = false;
      for (const term of genericTerms) {
        if (nameLower.includes(term)) {
          isGeneric = true;
          break;
        }
      }
      if (contact.company && nameLower === contact.company.trim().toLowerCase()) {
        isGeneric = true;
      }
      if (!isGeneric) {
        cleanHrName = contact.name.trim();
      }
    }

    // Determine cleanest company name
    let cleanCompany = 'your organization';
    if (contact.company && contact.company.trim().length > 0 && !contact.company.includes('{')) {
      cleanCompany = contact.company.trim();
    }

    // Determine cleanest candidate name
    let cleanClientName = 'Candidate';
    if (client.name && client.name.trim().length > 0 && !client.name.includes('{')) {
      cleanClientName = client.name.trim();
    }

    result = result
      .replace(/{hr_name}/g, cleanHrName)
      .replace(/{contact_name}/g, cleanHrName)
      .replace(/{company}/g, cleanCompany)
      .replace(/{company_name}/g, cleanCompany)
      .replace(/{role}/g, cleanRole)
      .replace(/{job_roles}/g, client.target_job_roles || cleanRole)
      .replace(/{client_name}/g, cleanClientName)
      .replace(/{candidate_name}/g, cleanClientName)
      .replace(/{candidate_email}/g, client.email || '')
      .replace(/{candidate_mobile}/g, client.mobile || '')
      .replace(/{industry}/g, contact.industry || 'Technology & Consulting')
      .replace(/{country}/g, contact.country || '');

    // Cleanup any unreplaced {placeholder} tags so NO email contains raw curly braces
    result = result.replace(/\{[a-zA-Z0-9_]+\}/g, '');

    return result;
  };

  // If Gemini is active, let's call Gemini to generate a COMPLETELY UNIQUE, custom cover letter variant
  // to guarantee different layouts for different contacts!
  if (settings.gemini_api_key) {
    try {
      const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      let baseTemplateBody = "";
      if (client.email_template) {
        try {
          const t = JSON.parse(client.email_template);
          baseTemplateBody = t.body || "";
        } catch(e) {}
      }

      const prompt = `
You are a career cold outreach specialist writing on behalf of a job candidate.
Read the candidate's actual resume content below carefully. Extract specific technical skills, programming languages, automation frameworks, test tools, domain experience, and major project accomplishments.

Craft a highly compelling, professional 4-5 paragraph cold outreach email tailored to the recipient.
The email body MUST be fully personalized using the candidate's real resume details.

CRITICAL: Generate a completely unique email format, opening sentence, and value proposition layout. Do NOT repeat the exact same structure for different recipients. Vary the tone, structure, and highlight different achievements from the resume to keep it highly personalized and varied.

Candidate Details:
- Full Name: ${client.name}
- Email: ${client.email}
- Target Job Roles: ${client.target_job_roles || 'Software Engineer'}
- Resume Text:
${client.resume_text || 'Experienced software professional.'}

Recipient Details:
- Contact Name: ${contact.name || 'Hiring Manager'}
- Target Company: ${contact.company || 'your organization'}
- Target Role: ${contact.role || (client.target_job_roles ? client.target_job_roles.split(',')[0] : 'Software Engineer')}
- Industry: ${contact.industry || 'Technology'}

Reference Template Style (If any, use as a general guide/tone reference, but vary it significantly):
${baseTemplateBody}

Return a JSON object with EXACTLY this structure:
{
  "subject": "Experienced ${contact.role || 'Software Engineer'} | Application at ${contact.company || 'your organization'}",
  "body": "Dear ${contact.name || 'Hiring Manager'},\\n\\nI hope this email finds you well.\\n\\nI am writing to express my strong interest in potential ${contact.role || 'software engineering'} opportunities at ${contact.company || 'your organization'}... [4-5 detailed paragraphs referencing candidate resume skills, frameworks, achievements, and value proposal]\\n\\nBest regards,\\n${client.name}"
}
Ensure output is valid JSON.
`;

      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      
      if (text.startsWith('```json')) {
        text = text.substring(7, text.lastIndexOf('```')).trim();
      } else if (text.startsWith('```')) {
        text = text.substring(3, text.lastIndexOf('```')).trim();
      }

      const parsed = JSON.parse(text);
      return {
        subject: replacePlaceholders(parsed.subject),
        body: replacePlaceholders(parsed.body)
      };
    } catch (geminiErr) {
      console.error("Gemini personalization failed, falling back to rotated templates:", geminiErr);
    }
  }

  // Fallbacks: 3 distinct premium layout styles to rotate through to ensure varied layouts!
  const fallbacks = [
    // Format 1: Standard Professional
    `Dear {hr_name},\n\nI hope this email finds you well.\n\nI am writing to express my strong interest in potential {role} opportunities at {company}. With extensive technical experience in {industry} and a proven track record of engineering scalable solutions, I have consistently driven quality releases, reduced overhead, and accelerated project delivery across complex digital platforms.\n\nIn my recent projects, I have led the design and implementation of core software frameworks, automated regression test suites, and integrated continuous deployment pipelines. My expertise spans technical architecture, API development, test automation, and cross-functional Agile delivery.\n\nI am particularly impressed by {company}'s ongoing innovation and global engineering impact. I would welcome the opportunity to discuss how my technical expertise, domain knowledge, and passion for engineering excellence can add immediate value to your team and upcoming projects.\n\nThank you for your time and consideration. I look forward to connecting with you soon.\n\nBest regards,\n{client_name}`,
    
    // Format 2: Results & Achievements-focused
    `Dear {hr_name},\n\nI trust you are having a productive week.\n\nI am reaching out to discuss potential software development and {role} roles at {company}. As a software professional specializing in {industry}, I specialize in building robust systems, designing automated pipelines, and driving product quality.\n\nOver the course of my engineering projects, I have developed comprehensive test suites, optimized execution times, and deployed solutions that cut down regression testing overhead by over 40%. I thrive on solving complex technical challenges and collaborating with agile engineering teams to hit milestones.\n\nSiemens and {company} have a stellar reputation for engineering excellence, which makes this opportunity highly exciting to me. I would love to explore how my hands-on experience can help your team streamline its release readiness and deliver superior quality features.\n\nMy resume is attached for your review. I look forward to the possibility of a brief conversation.\n\nSincerely,\n{client_name}`,

    // Format 3: Conversational & Value-focused
    `Dear {hr_name},\n\nI hope you are doing well. I have been following {company}'s recent engineering initiatives and wanted to get in touch regarding potential {role} positions on your team.\n\nI bring solid hands-on experience in Technology & Consulting, with a deep focus on designing modular test frameworks, automating REST APIs, and maintaining robust CI/CD integration. I enjoy helping software teams reduce manual testing bottlenecks and achieve continuous deployment goals.\n\nI believe my background in automation framework architecture matches your team's standard of excellence. I am eager to contribute my skills to {company}'s upcoming releases and keep software quality high.\n\nThank you for considering my application. I would welcome the chance to schedule a call to introduce myself further.\n\nWarm regards,\n{client_name}`
  ];

  const index = (contact.id || 0) % fallbacks.length;
  const selectedTemplate = fallbacks[index];

  return {
    subject: replacePlaceholders(`Experienced {role} | {role} Application at {company}`),
    body: replacePlaceholders(selectedTemplate)
  };
}

async function generatePdfBuffer(candidateName, resumeText) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      // PDF Resume Formatting
      doc.fontSize(20).fillColor('#0284c7').text(candidateName.toUpperCase(), { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#64748b').text('CURRICULUM VITAE / PROFESSIONAL RESUME', { align: 'center' });
      doc.moveDown(0.8);

      // Line separator
      doc.moveTo(40, doc.y).lineTo(570, doc.y).strokeColor('#0284c7').lineWidth(1.5).stroke();
      doc.moveDown(1);

      // Body text
      const bodyText = resumeText || `Professional Resume details for ${candidateName}.`;
      doc.fontSize(10).fillColor('#1e293b').text(bodyText, {
        align: 'left',
        lineGap: 4
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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

  // Build clean HTML email body without raw resume text clutter
  const fullHtml = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
      ${htmlBody}
    </div>
  `;

  // Generate binary PDF buffer for attachment
  const safeFilename = `${(client.name || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_')}_Resume.pdf`;
  let pdfAttachmentBuffer = null;
  try {
    pdfAttachmentBuffer = await generatePdfBuffer(client.name || 'Candidate', client.resume_text);
  } catch (pdfErr) {
    console.error("Failed to generate PDF buffer, falling back to text:", pdfErr);
    pdfAttachmentBuffer = Buffer.from(client.resume_text || `Resume for ${client.name}`);
  }

  const mailOptions = {
    from: `"${client.name}" <${client.email}>`,
    to,
    subject,
    html: fullHtml,
    attachments: [
      {
        filename: safeFilename,
        content: pdfAttachmentBuffer,
        contentType: 'application/pdf'
      }
    ]
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
    const candidateLimit = client.daily_limit ? parseInt(client.daily_limit) : (parseInt(settings.daily_limit) || 10);
    
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
      // Robust Country Match
      if (targetCountries.length > 0 && contact.country) {
        const contactCountryLower = contact.country.trim().toLowerCase();
        let countryMatched = false;
        for (const tc of targetCountries) {
          const tcLower = tc.trim().toLowerCase();
          if (contactCountryLower === tcLower || contactCountryLower.includes(tcLower) || tcLower.includes(contactCountryLower)) {
            countryMatched = true;
            break;
          }
        }
        if (!countryMatched) return false;
      }

      // Robust Fuzzy Industry Match
      if (targetIndustries.length > 0 && contact.industry) {
        const contactIndLower = contact.industry.trim().toLowerCase();
        let industryMatched = false;
        for (const ti of targetIndustries) {
          const tiLower = ti.trim().toLowerCase();
          
          if (contactIndLower === tiLower) {
            industryMatched = true;
            break;
          }
          if (tiLower.includes('&')) {
            const parts = tiLower.split('&').map(p => p.trim());
            if (parts.some(p => contactIndLower.includes(p) || p.includes(contactIndLower))) {
              industryMatched = true;
              break;
            }
          }
          if (contactIndLower.includes(tiLower) || tiLower.includes(contactIndLower)) {
            industryMatched = true;
            break;
          }
        }
        if (!industryMatched) return false;
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
    ).slice(0, candidateLimit);

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
