import React, { useState } from 'react';

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
  try {
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
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      throw new Error('Backend server is offline or disconnected. Please ensure "node server.js" is running.');
    }
    throw err;
  }
}

export default function Contacts({ contacts, fetchContacts, setNotification, clients = [] }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [countriesList, setCountriesList] = useState(['Germany', 'UAE', 'Netherlands', 'Australia']);

  React.useEffect(() => {
    fetchCountries();
  }, [contacts]);

  const fetchCountries = async () => {
    try {
      const data = await safeFetchJson('/api/countries');
      if (Array.isArray(data)) {
        setCountriesList(data);
      }
    } catch (err) {
      console.error('Failed to load countries:', err);
    }
  };

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('Active');
  
  // CSV / File Import State
  const [csvText, setCsvText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filename, setFilename] = useState('');
  const [importing, setImporting] = useState(false);

  const handleFileSelect = (file) => {
    if (!file) return;
    setFilename(file.name);
    setSelectedFile(file);
    if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCsvText(e.target.result);
      };
      reader.readAsText(file);
    } else {
      setCsvText(`Binary file loaded (${file.name})`);
    }
  };

  // Preview / Send states
  const [previewContact, setPreviewContact] = useState(null);
  const [previewData, setPreviewData] = useState({ subject: '', body: '' });
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setRole('');
    setIndustry('');
    setCountry('');
    setStatus('Active');
    setEditingContact(null);
  };

  const handleAddOrEdit = async (e) => {
    e.preventDefault();
    const url = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts';
    const method = editingContact ? 'PUT' : 'POST';

    try {
      const data = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, role, industry, country, status })
      });
      if (data.success) {
        setNotification({
          message: editingContact ? 'Contact updated successfully' : 'Contact added successfully',
          type: 'success'
        });
        setIsAddOpen(false);
        resetForm();
        fetchContacts();
      } else {
        setNotification({ message: data.error || 'Failed to save contact', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const startEdit = (contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setEmail(contact.email);
    setCompany(contact.company || '');
    setRole(contact.role || '');
    setIndustry(contact.industry || '');
    setCountry(contact.country || '');
    setStatus(contact.status || 'Active');
    setIsAddOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const data = await safeFetchJson(`/api/contacts/${id}`, { method: 'DELETE' });
      if (data.success) {
        setNotification({ message: 'Contact deleted successfully', type: 'success' });
        fetchContacts();
      } else {
        setNotification({ message: data.error || 'Failed to delete contact', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleBulkPaste = async (e) => {
    e.preventDefault();
    if (!selectedFile && !csvText) return;
    setImporting(true);
    try {
      let data;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        data = await safeFetchJson('/api/contacts/bulk-file', {
          method: 'POST',
          body: formData
        });
      } else {
        data = await safeFetchJson('/api/contacts/bulk-paste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText })
        });
      }
      
      if (data.success) {
        setNotification({
          message: `Imported ${data.imported} contacts successfully. Failed: ${data.failed}`,
          type: 'success'
        });
        setIsBulkOpen(false);
        setCsvText('');
        setSelectedFile(null);
        setFilename('');
        fetchContacts();
      } else {
        setNotification({ message: data.error || 'Failed to import contacts', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const [selectedClientId, setSelectedClientId] = useState('');

  const triggerPreview = async (contact, specificClientId = null) => {
    let activeClientId = specificClientId;
    
    if (!activeClientId) {
      const activeClients = clients.filter(c => c.status === 'Active');
      if (activeClients.length === 0) {
        setNotification({ message: 'No active candidates available. Please add or activate a candidate profile.', type: 'error' });
        return;
      }
      activeClientId = activeClients[0].id;
    }
    
    setSelectedClientId(activeClientId);
    setPreviewContact(contact);
    setIsPreviewOpen(true);
    setGeneratingPreview(true);
    setPreviewData({ subject: '', body: '' });

    try {
      const data = await safeFetchJson('/api/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: activeClientId, contactId: contact.id })
      });
      setPreviewData({ subject: data.subject || '', body: data.body || '' });
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
      setIsPreviewOpen(false);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const sendCustomEmail = async () => {
    if (!previewContact || !selectedClientId) return;
    setSendingEmail(true);

    try {
      const data = await safeFetchJson('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          contactId: previewContact.id,
          customSubject: previewData.subject,
          customBody: previewData.body
        })
      });
      if (data.success) {
        setNotification({ message: 'Email sent successfully!', type: 'success' });
        setIsPreviewOpen(false);
      } else {
        setNotification({ message: data.error || 'Failed to send email', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title">{contacts.length} Contacts</h3>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn" onClick={() => { resetForm(); setIsAddOpen(true); }}>
            + Add Contact
          </button>
          <button className="btn btn-primary" onClick={() => setIsBulkOpen(true)}>
            Bulk Upload CSV
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Target Role</th>
              <th>Country</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                  No contacts found. Please add or import contacts to begin outreach.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.company || '—'}</td>
                  <td>
                    {c.role ? (
                      <span className="badge badge-warning" style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--primary-light)', textTransform: 'none' }}>
                        {c.role}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{c.country || '—'}</td>
                  <td>
                    <span className={`badge ${c.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
                      <button className="icon-btn" title="Generate & Preview Email" onClick={() => triggerPreview(c)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                      <button className="icon-btn" title="Edit Contact" onClick={() => startEdit(c)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      <button className="icon-btn delete" title="Delete Contact" onClick={() => handleDelete(c.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Contact Modal */}
      {isAddOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h4 className="modal-title">{editingContact ? 'Edit Contact' : 'Add New Contact'}</h4>
              <button className="icon-btn" onClick={() => setIsAddOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddOrEdit}>
              <div className="form-group">
                <label>Contact Name *</label>
                <input type="text" required className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah Jenkins" />
              </div>
              <div className="form-group">
                <label>Email Address *</label>
                <input type="email" required className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah.jenkins@company.com" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Company</label>
                  <input type="text" className="form-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Stripe" />
                </div>
                <div className="form-group">
                  <label>Target Role</label>
                  <input type="text" className="form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Software Engineer" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Industry</label>
                  <select className="form-select" value={industry} onChange={e => setIndustry(e.target.value)}>
                    <option value="">-- Select Industry --</option>
                    {INDUSTRIES_LIST.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Country</label>
                  <select className="form-select" value={country} onChange={e => setCountry(e.target.value)}>
                    <option value="">-- Select Country --</option>
                    {countriesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Outreach Status</label>
                <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsAddOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {isBulkOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <h4 className="modal-title" style={{ fontSize: '1.5rem', fontWeight: '700' }}>Upload HR CSV File</h4>
              <button className="icon-btn" onClick={() => setIsBulkOpen(false)}>&times;</button>
            </div>
            
            <div style={{ marginTop: '1.5rem' }}>
              <p className="page-subtitle" style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Select or drop your <strong>.csv</strong> file below. Auto-detected headers:
              </p>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {['name', 'email', 'company', 'title', 'industry', 'country'].map(h => (
                  <span key={h} className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.4rem 0.8rem', fontSize: '0.85rem', textTransform: 'none', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    {h}
                  </span>
                ))}
              </div>

              <div 
                style={{
                  border: '2px dashed #38bdf8',
                  borderRadius: '12px',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  transition: 'border-color 0.2s',
                  marginBottom: '1rem'
                }}
                onClick={() => document.getElementById('csvFileInput').click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelect(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input 
                  type="file" 
                  id="csvFileInput" 
                  accept=".csv,.txt" 
                  style={{ display: 'none' }} 
                  onClick={e => { e.stopPropagation(); e.target.value = null; }}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📊</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: '500' }}>
                  {filename ? `Selected CSV File: ${filename}` : 'Click to select a .csv file (or drag & drop here)'}
                </span>
                {csvText && !csvText.startsWith('Binary file') && (
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--success)', marginTop: '0.5rem', fontWeight: '600' }}>
                    CSV file loaded successfully ({csvText.split('\n').length} lines) &bull; Ready to import
                  </span>
                )}
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>OR PASTE CSV CONTENT DIRECTLY:</label>
                <textarea 
                  className="form-textarea"
                  value={csvText.startsWith('Binary file') ? '' : csvText}
                  onChange={e => {
                    setCsvText(e.target.value);
                    setSelectedFile(null);
                    setFilename('Pasted CSV text');
                  }}
                  placeholder="Name,Email,Company,Role,Industry,Country&#10;Sarah,sarah@corp.com,TechCorp,Recruiter,Technology,Germany"
                  style={{ minHeight: '100px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '2rem' }}>
              <button type="button" className="btn" onClick={() => setIsBulkOpen(false)}>Close</button>
              <button 
                type="button" 
                className="btn btn-primary" 
                disabled={importing || !csvText}
                onClick={handleBulkPaste}
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Preview Modal */}
      {isPreviewOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h4 className="modal-title">AI Personalized Outreach Preview</h4>
              <button className="icon-btn" onClick={() => setIsPreviewOpen(false)}>&times;</button>
            </div>
            {generatingPreview ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                Generating personalized email content using Gemini AI...
              </div>
            ) : (
              <div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Pitching Candidate Profile</label>
                  <select 
                    className="form-select"
                    value={selectedClientId}
                    onChange={e => triggerPreview(previewContact, e.target.value)}
                  >
                    <option value="">-- Choose Candidate --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
                  Target: <strong>{previewContact?.name}</strong> ({previewContact?.email}) at {previewContact?.company || 'Direct'}
                </p>
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    className="form-input"
                    value={previewData.subject}
                    onChange={e => setPreviewData({ ...previewData, subject: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Body</label>
                  <textarea
                    className="form-textarea"
                    value={previewData.body}
                    onChange={e => setPreviewData({ ...previewData, body: e.target.value })}
                    style={{ minHeight: '300px' }}
                  />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn" onClick={() => setIsPreviewOpen(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={sendCustomEmail} disabled={sendingEmail}>
                    {sendingEmail ? 'Sending Email...' : 'Send Personalized Email'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
