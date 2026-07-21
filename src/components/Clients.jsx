import React, { useState, useEffect } from 'react';

const INDUSTRIES_LIST = [
  'E-commerce & Retail',
  'Manufacturing & Automotive',
  'Logistics & Supply Chain',
  'Healthcare & Life Sciences',
  'Telecom',
  'FMCG & Consumer Goods',
  'Energy & Utilities',
  'Construction, Infrastructure & Real Estate',
  'Technology & Consulting'
];

const COUNTRIES_LIST = ['Germany', 'UAE', 'Netherlands', 'Australia'];

async function safeFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.reason || data.message || `Server error (${res.status})`);
    }
    return data;
  } else {
    const text = await res.text();
    const cleanText = text.replace(/<[^>]*>?/gm, '').trim().substring(0, 150);
    if (!res.ok) {
      throw new Error(cleanText || `Server error (${res.status})`);
    }
    try { return JSON.parse(text); } catch { return { success: true, text }; }
  }
}

export default function Clients({ setNotification }) {
  const [clients, setClients] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  
  // Form State variables
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [mobile, setMobile] = useState('');
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [resumeText, setResumeText] = useState('');
  const [emailTemplateSubject, setEmailTemplateSubject] = useState('');
  const [emailTemplateBody, setEmailTemplateBody] = useState('');
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [status, setStatus] = useState('Active');
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Candidate Outreach Template Modal State (Matching Reference Images 2 & 3)
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [templateClient, setTemplateClient] = useState(null);
  const [resumeAnalysis, setResumeAnalysis] = useState('');
  const [targetJobRoles, setTargetJobRoles] = useState('');
  const [coverLetterText, setCoverLetterText] = useState('');
  const [isDocPreviewResume, setIsDocPreviewResume] = useState(false);
  const [isDocPreviewCoverLetter, setIsDocPreviewCoverLetter] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const data = await safeFetchJson('/api/clients');
      if (Array.isArray(data)) {
        setClients(data);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  };

  const handleOpenTemplateModal = async (client) => {
    setTemplateClient(client);
    setResumeAnalysis(client.resume_analysis || '');
    setTargetJobRoles(client.target_job_roles || 'Senior Software Test Engineer, QA / Software Engineer, Software Test Engineer, Automation Testing Engineer, Test Automation Lead');
    setCoverLetterText(client.cover_letter_text || '');

    try {
      const template = JSON.parse(client.email_template);
      setEmailTemplateSubject(template.subject || 'Experienced {role} | {role} Application at {company}');
      setEmailTemplateBody(template.body || 'Dear {hr_name},\n\nI hope you are doing well.\n\nI am writing to express my interest in the {role} position at {company}.\n\nBest regards,\n{client_name}');
    } catch {
      setEmailTemplateSubject('Experienced {role} | {role} Application at {company}');
      setEmailTemplateBody('Dear {hr_name},\n\nI hope you are doing well.\n\nI am writing to express my interest in the {role} position at {company}.\n\nBest regards,\n{client_name}');
    }

    setIsTemplateOpen(true);

    // If candidate has resume text but template/analysis is missing, auto-generate!
    if ((!client.resume_analysis || !client.cover_letter_text) && client.resume_text) {
      handleGenerateTemplateForModal(client.resume_text, client);
    }
  };

  const computeSamplePreview = (text, client, jobRoles) => {
    if (!text) return '';
    return text
      .replace(/{hr_name}/g, 'Sarah Jenkins')
      .replace(/{contact_name}/g, 'Sarah Jenkins')
      .replace(/{company}/g, 'Siemens')
      .replace(/{company_name}/g, 'Siemens')
      .replace(/{role}/g, 'Senior QA Automation Engineer')
      .replace(/{client_name}/g, client ? client.name : 'Candidate')
      .replace(/{candidate_name}/g, client ? client.name : 'Candidate')
      .replace(/{job_roles}/g, jobRoles || 'Senior QA Automation Engineer')
      .replace(/{industry}/g, 'Technology & Consulting')
      .replace(/{country}/g, 'Germany');
  };

  const handleDownloadTextFile = (filename, content) => {
    const element = document.createElement('a');
    const file = new Blob([content || 'No document content available.'], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleGenerateTemplateForModal = async (textToUse, clientObj = null) => {
    const currentClient = clientObj || templateClient;
    if (!textToUse && !currentClient) return;
    setGeneratingTemplate(true);
    try {
      const data = await safeFetchJson('/api/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentClient ? currentClient.name : name, resume_text: textToUse || resumeText })
      });
      if (data.success && data.template) {
        if (data.template.resume_analysis) setResumeAnalysis(data.template.resume_analysis);
        if (data.template.target_job_roles) setTargetJobRoles(data.template.target_job_roles);
        if (data.template.cover_letter) setCoverLetterText(data.template.cover_letter);
        if (data.template.subject) setEmailTemplateSubject(data.template.subject);
        if (data.template.body) setEmailTemplateBody(data.template.body);
        setNotification({ message: 'Outreach template & analysis generated successfully!', type: 'success' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleSaveTemplateModal = async () => {
    if (!templateClient) return;
    const payload = {
      ...templateClient,
      resume_analysis: resumeAnalysis,
      target_job_roles: targetJobRoles,
      cover_letter_text: coverLetterText,
      email_template: JSON.stringify({ subject: emailTemplateSubject, body: emailTemplateBody })
    };

    try {
      const data = await safeFetchJson(`/api/clients/${templateClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        setNotification({ message: 'Outreach template saved successfully!', type: 'success' });
        setIsTemplateOpen(false);
        fetchClients();
      } else {
        setNotification({ message: data.error || 'Failed to save template', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleTestSMTPForTemplate = async () => {
    if (!templateClient || !templateClient.email || !templateClient.app_password) {
      setNotification({ message: 'Please set Gmail App Password for this candidate first.', type: 'error' });
      return;
    }
    try {
      const data = await safeFetchJson('/api/clients/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateClient.name, email: templateClient.email, app_password: templateClient.app_password })
      });
      if (data.success) {
        setNotification({ message: data.message || 'SMTP Connection succeeded!', type: 'success' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleOpenAdd = () => {
    setEditingClient(null);
    setName('');
    setEmail('');
    setAppPassword('');
    setEnrollmentId('');
    setMobile('');
    setSelectedIndustries([]);
    setSelectedCountries([]);
    setResumeText('');
    setEmailTemplateSubject('');
    setEmailTemplateBody('');
    setStatus('Active');
    setIsOpen(true);
  };

  const handleOpenEdit = (client) => {
    setEditingClient(client);
    setName(client.name);
    setEmail(client.email);
    setAppPassword(client.app_password || '');
    setEnrollmentId(client.enrollment_id || '');
    setMobile(client.mobile || '');
    setStatus(client.status || 'Active');
    setResumeText(client.resume_text || '');
    
    try {
      const template = JSON.parse(client.email_template);
      setEmailTemplateSubject(template.subject || '');
      setEmailTemplateBody(template.body || '');
    } catch(e) {
      setEmailTemplateSubject('');
      setEmailTemplateBody('');
    }
    
    try {
      setSelectedIndustries(JSON.parse(client.target_industries) || []);
    } catch (e) {
      setSelectedIndustries([]);
    }
    
    try {
      setSelectedCountries(JSON.parse(client.target_countries) || []);
    } catch (e) {
      setSelectedCountries([]);
    }
    
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this candidate?')) return;
    try {
      const data = await safeFetchJson(`/api/clients/${id}`, { method: 'DELETE' });
      if (data.success) {
        setNotification({ message: 'Candidate deleted successfully', type: 'success' });
        fetchClients();
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
    const method = editingClient ? 'PUT' : 'POST';

    const payload = {
      name,
      email,
      app_password: appPassword,
      enrollment_id: enrollmentId,
      mobile,
      target_industries: JSON.stringify(selectedIndustries),
      target_countries: JSON.stringify(selectedCountries),
      resume_text: resumeText,
      email_template: JSON.stringify({ subject: emailTemplateSubject, body: emailTemplateBody }),
      status,
      resume_analysis: resumeAnalysis,
      target_job_roles: targetJobRoles,
      cover_letter_text: coverLetterText
    };

    try {
      const data = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        setNotification({
          message: editingClient ? 'Candidate details & template updated successfully!' : 'Candidate & outreach template added successfully!',
          type: 'success'
        });
        setIsOpen(false);
        fetchClients();
      } else {
        setNotification({ message: data.error || 'Failed to save candidate', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleIndustryChange = (ind) => {
    if (selectedIndustries.includes(ind)) {
      setSelectedIndustries(selectedIndustries.filter(i => i !== ind));
    } else {
      setSelectedIndustries([...selectedIndustries, ind]);
    }
  };

  const handleCountryChange = (c) => {
    if (selectedCountries.includes(c)) {
      setSelectedCountries(selectedCountries.filter(item => item !== c));
    } else {
      setSelectedCountries([...selectedCountries, c]);
    }
  };

  const handleTestSMTP = async () => {
    if (!email || !appPassword) {
      setNotification({ message: 'Please enter a Gmail email and App Password to test connection.', type: 'error' });
      return;
    }
    setTestingSmtp(true);
    try {
      const data = await safeFetchJson('/api/clients/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, app_password: appPassword })
      });
      if (data.success) {
        setNotification({ message: data.message || 'SMTP Test succeeded!', type: 'success' });
      } else {
        setNotification({ message: data.error || 'SMTP Test failed', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleGenerateTemplate = async (overrideResumeText = null) => {
    const textToUse = overrideResumeText !== null ? overrideResumeText : resumeText;
    if (!textToUse) {
      setNotification({ message: 'Please paste or upload candidate resume details first.', type: 'error' });
      return;
    }
    setGeneratingTemplate(true);
    try {
      const data = await safeFetchJson('/api/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, resume_text: textToUse })
      });
      if (data.success && data.template) {
        if (data.template.subject) setEmailTemplateSubject(data.template.subject);
        if (data.template.body) setEmailTemplateBody(data.template.body);
        if (data.template.resume_analysis) setResumeAnalysis(data.template.resume_analysis);
        if (data.template.target_job_roles) setTargetJobRoles(data.template.target_job_roles);
        if (data.template.cover_letter) setCoverLetterText(data.template.cover_letter);
        setNotification({ message: 'Professional outreach template & resume analysis generated successfully!', type: 'success' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleResumeFileUpload = async (file) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const data = await safeFetchJson('/api/parse-pdf', {
          method: 'POST',
          body: formData
        });
        if (data.text) {
          setResumeText(data.text);
          setNotification({ message: 'Parsed PDF resume successfully!', type: 'success' });
          handleGenerateTemplate(data.text);
        }
      } catch (err) {
        setNotification({ message: 'Failed to parse PDF resume: ' + err.message, type: 'error' });
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        setResumeText(text);
        handleGenerateTemplate(text);
      };
      reader.readAsText(file);
    }
  };


  const loadDemoCandidate = () => {
    setName('Munish Kanna S');
    setEmail('munish.kanna.s@gmail.com');
    setAppPassword('abcd efgh ijkl mnop');
    setEnrollmentId('1922');
    setMobile('9543974755');
    setSelectedIndustries(['Technology & Consulting', 'E-commerce & Retail']);
    setSelectedCountries(['Germany', 'Netherlands']);
    setResumeText(`MUNISH KANNA S
Full Stack Web Developer
Skills: Java, Spring Boot, React, SQL, AWS, Git, REST APIs
Experience: 2+ Years engineering corporate applications and cloud integrations.`);
    setNotification({ message: 'Loaded Munish Kanna S sample profile.', type: 'success' });
  };

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title">{clients.length} Candidates</h3>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn" onClick={loadDemoCandidate}>Load Demo Candidate</button>
          <button className="btn btn-primary" onClick={handleOpenAdd}>+ Add Client</button>
        </div>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Enrollment ID</th>
              <th>Sender Email (Gmail)</th>
              <th>Targets</th>
              <th>Mobile</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                  No candidates added yet. Add a client candidate profile to run personalized outreach.
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                let parsedCountries = [];
                try {
                  parsedCountries = JSON.parse(c.target_countries) || [];
                } catch(e){}
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.enrollment_id || '—'}</td>
                    <td>{c.email}</td>
                    <td>
                      {parsedCountries.length > 0 ? (
                        <span className="badge badge-warning" style={{ background: 'rgba(124, 58, 237, 0.1)', color: 'var(--primary-light)', textTransform: 'none' }}>
                          {parsedCountries.join(', ')}
                        </span>
                      ) : 'All Countries'}
                    </td>
                    <td>{c.mobile || '—'}</td>
                    <td>
                      <span className={`badge ${c.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title="Outreach Template" onClick={() => handleOpenTemplateModal(c)} style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                        </button>
                        <button className="icon-btn" title="Edit Client" onClick={() => handleOpenEdit(c)}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button className="icon-btn delete" title="Delete Client" onClick={() => handleDelete(c.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Candidate Outreach Template Modal (Matching Reference Images 2 & 3) */}
      {isTemplateOpen && templateClient && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%', backgroundColor: '#0b0f19', border: '1px solid #38bdf8', borderRadius: '16px', padding: '2rem' }}>
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h4 className="modal-title" style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ffffff' }}>
                {templateClient.name} &mdash; outreach template
              </h4>
              <button className="icon-btn" onClick={() => setIsTemplateOpen(false)}>&times;</button>
            </div>

            {/* Resume Analysis Banner */}
            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                <strong style={{ color: '#38bdf8' }}>Resume analysis:</strong> {resumeAnalysis || `${templateClient.name} is a skilled professional with proven experience delivering technical solutions across enterprise domains.`}
              </p>
            </div>

            {/* DOCUMENTS Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>DOCUMENTS</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {/* Resume Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.6rem 1rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>📄</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ffffff' }}>Resume</span>
                  <button type="button" className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setIsDocPreviewResume(true)}>👁️ Preview</button>
                  <button type="button" className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDownloadTextFile(`${templateClient.name}_Resume.txt`, templateClient.resume_text || resumeAnalysis)}>⬇️ Download</button>
                </div>
                {/* Cover Letter Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.6rem 1rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>📄</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ffffff' }}>Cover letter</span>
                  <button type="button" className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setIsDocPreviewCoverLetter(true)}>👁️ Preview</button>
                  <button type="button" className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDownloadTextFile(`${templateClient.name}_CoverLetter.txt`, coverLetterText)}>⬇️ Download</button>
                </div>
              </div>
            </div>

            {/* Outreach Log Status */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
              No emails sent yet for this client.
            </div>

            {/* Target Job Roles */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.85rem' }}>Target job roles (comma separated)</label>
              <input 
                type="text" 
                className="form-input" 
                value={targetJobRoles} 
                onChange={e => setTargetJobRoles(e.target.value)} 
                placeholder="Senior Software Test Engineer, QA / Software Engineer, Software Test Engineer, Automation Testing Engineer"
                style={{ fontSize: '0.9rem', fontWeight: '600' }}
              />
            </div>

            {/* Email Subject */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.85rem' }}>Email subject</label>
              <input 
                type="text" 
                className="form-input" 
                value={emailTemplateSubject} 
                onChange={e => setEmailTemplateSubject(e.target.value)} 
                placeholder="Experienced QA Automation Engineer | {role} Application at {company}"
                style={{ fontSize: '0.9rem', fontWeight: '600' }}
              />
            </div>

            {/* Email Body */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.85rem' }}>
                Email body &mdash; placeholders: <code style={{ color: '#38bdf8' }}>{`{hr_name}`}</code> <code style={{ color: '#38bdf8' }}>{`{company}`}</code> <code style={{ color: '#38bdf8' }}>{`{role}`}</code> <code style={{ color: '#38bdf8' }}>{`{client_name}`}</code> <code style={{ color: '#38bdf8' }}>{`{job_roles}`}</code> <code style={{ color: '#38bdf8' }}>{`{industry}`}</code> <code style={{ color: '#38bdf8' }}>{`{country}`}</code>
              </label>
              <textarea 
                className="form-textarea" 
                value={emailTemplateBody} 
                onChange={e => setEmailTemplateBody(e.target.value)} 
                placeholder="Dear {hr_name},&#10;&#10;I hope you are doing well...&#10;&#10;Best regards,&#10;{client_name}"
                style={{ minHeight: '180px', fontSize: '0.9rem', fontFamily: 'var(--font-body)', lineHeight: '1.6' }}
              />
            </div>

            {/* LIVE PREVIEW Section */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>LIVE PREVIEW</label>
              <div className="preview-box" style={{ maxHeight: '220px', overflowY: 'auto', backgroundColor: '#050814', border: '1px solid #1e293b', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#f8fafc', lineHeight: '1.6' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#38bdf8' }}>
                  Subject: {computeSamplePreview(emailTemplateSubject, templateClient, targetJobRoles)}
                </div>
                {computeSamplePreview(emailTemplateBody, templateClient, targetJobRoles)}
              </div>
            </div>

            {/* Action Buttons Footer (Matching Reference Image 3) */}
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn" onClick={() => setNotification({ message: 'No replies received yet for this candidate.', type: 'success' })}>
                  🔄 Check replies
                </button>
                <button type="button" className="btn" onClick={handleTestSMTPForTemplate}>
                  Test Gmail login
                </button>
                <button type="button" className="btn" onClick={() => handleGenerateTemplateForModal(templateClient.resume_text)} disabled={generatingTemplate}>
                  {generatingTemplate ? 'Regenerating...' : '🔄 Regenerate (AI)'}
                </button>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleSaveTemplateModal} style={{ backgroundColor: '#7c3aed', borderColor: '#a78bfa' }}>
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modals */}
      {isDocPreviewResume && templateClient && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h4 className="modal-title">📄 {templateClient.name} — Resume Preview</h4>
              <button className="icon-btn" onClick={() => setIsDocPreviewResume(false)}>&times;</button>
            </div>
            <div className="preview-box" style={{ maxHeight: '450px', overflowY: 'auto', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
              {templateClient.resume_text || 'No resume details available.'}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setIsDocPreviewResume(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {isDocPreviewCoverLetter && templateClient && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h4 className="modal-title">📄 {templateClient.name} — Cover Letter Preview</h4>
              <button className="icon-btn" onClick={() => setIsDocPreviewCoverLetter(false)}>&times;</button>
            </div>
            <div className="preview-box" style={{ maxHeight: '450px', overflowY: 'auto', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
              {coverLetterText || 'No cover letter generated.'}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setIsDocPreviewCoverLetter(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit client Modal */}
      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h4 className="modal-title">{editingClient ? 'Edit client' : 'Add client'}</h4>
              <button className="icon-btn" onClick={() => setIsOpen(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Client name *</label>
                  <input type="text" required className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Munish Kanna S" />
                </div>
                <div className="form-group">
                  <label>Enrollment ID</label>
                  <input type="text" className="form-input" value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)} placeholder="1922" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Sending email (Gmail) *</label>
                  <input type="email" required className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="munish.kanna.s@gmail.com" />
                </div>
                <div className="form-group">
                  <label>Gmail app password (leave blank to keep)</label>
                  <input type="password" className="form-input" value={appPassword} onChange={e => setAppPassword(e.target.value)} placeholder="XXXX XXXX XXXX XXXX" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Mobile number</label>
                  <input type="text" className="form-input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="9543974755" />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>TARGET INDUSTRIES</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '8px', marginTop: '0.35rem' }}>
                  {INDUSTRIES_LIST.map(ind => (
                    <div key={ind} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id={`ind-${ind}`}
                        checked={selectedIndustries.includes(ind)}
                        onChange={() => handleIndustryChange(ind)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor={`ind-${ind}`} style={{ fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                        {ind}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>TARGET COUNTRIES</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.35rem' }}>
                  {COUNTRIES_LIST.map(c => (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', padding: '0.5rem 0.75rem', borderRadius: '8px', backgroundColor: selectedCountries.includes(c) ? 'var(--primary-glow)' : 'transparent' }}>
                      <input 
                        type="checkbox" 
                        id={`c-${c}`}
                        checked={selectedCountries.includes(c)}
                        onChange={() => handleCountryChange(c)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor={`c-${c}`} style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: '500', color: selectedCountries.includes(c) ? 'var(--primary-light)' : 'var(--text-secondary)' }}>
                        {c}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>RESUME DETAILS (PLAIN TEXT)</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <input 
                    type="file" 
                    id="resumeTextInput" 
                    accept=".txt,.md,.pdf" 
                    style={{ display: 'none' }}
                    onClick={e => { e.target.value = null; }}
                    onChange={e => handleResumeFileUpload(e.target.files[0])}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => document.getElementById('resumeTextInput').click()}>
                    📎 Choose .txt / .md / .pdf Resume File
                  </button>
                  <span className="page-subtitle" style={{ fontSize: '0.8rem' }}>or paste details directly below:</span>
                </div>
                <textarea
                  className="form-textarea"
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste work experience, skills, and summary details here..."
                  style={{ minHeight: '150px', fontSize: '0.85rem' }}
                />
              </div>
              <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>AI OUTREACH EMAIL TEMPLATE</label>
                  <button type="button" className="btn btn-sm" onClick={() => handleGenerateTemplate(null)} disabled={generatingTemplate || !resumeText}>
                    {generatingTemplate ? 'Generating template...' : '⚡ Generate template with AI'}
                  </button>
                </div>
                <p className="page-subtitle" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                  Use placeholders to personalize: <code>{`{contact_name}`}</code>, <code>{`{company_name}`}</code>, <code>{`{role}`}</code>, <code>{`{industry}`}</code>, <code>{`{candidate_name}`}</code>, <code>{`{candidate_email}`}</code>
                </p>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.8rem' }}>Subject Template</label>
                  <input
                    type="text"
                    className="form-input"
                    value={emailTemplateSubject}
                    onChange={e => setEmailTemplateSubject(e.target.value)}
                    placeholder="e.g. Application for {role} at {company_name} - {candidate_name}"
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem' }}>Body Template</label>
                  <textarea
                    className="form-textarea"
                    value={emailTemplateBody}
                    onChange={e => setEmailTemplateBody(e.target.value)}
                    placeholder="Hi {contact_name}, ..."
                    style={{ minHeight: '180px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn" onClick={handleTestSMTP} disabled={testingSmtp}>
                  {testingSmtp ? 'Testing Connection...' : 'Test SMTP Credentials'}
                </button>
                <button type="button" className="btn" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
