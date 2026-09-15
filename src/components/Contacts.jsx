import React, { useState } from 'react';

const INDUSTRIES_LIST = ['Technology & Consulting'];



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
  const [CitiesList, setCitiesList] = useState([]);

  React.useEffect(() => {
    fetchCities();
  }, [contacts]);

  const fetchCities = async () => {
    try {
      const data = await safeFetchJson('/api/countries');
      if (Array.isArray(data)) {
        setCitiesList(data);
      }
    } catch (err) {
      console.error('Failed to load Cities:', err);
    }
  };

  // Filter states
  const [filterCity, setFilterCity] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [City, setCity] = useState('');
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
    setCity('');
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
        body: JSON.stringify({ name, email, company, role, industry, country: City, status })
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
    setCity(contact.country || '');
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

  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = contacts.filter(c => {
    if (filterCity && filterCity !== 'All' && c.country !== filterCity) return false;
    if (filterIndustry && filterIndustry !== 'All' && c.industry !== filterIndustry) return false;
    if (filterStatus && filterStatus !== 'All' && c.status !== filterStatus) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = c.name && c.name.toLowerCase().includes(q);
      const matchesEmail = c.email && c.email.toLowerCase().includes(q);
      if (!matchesName && !matchesEmail) return false;
    }
    
    return true;
  });

  return (
    <div className="split-layout-65-35">
      {/* LEFT PANEL */}
      <div>
        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title">{filteredContacts.length} of {contacts.length} Contacts</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn" onClick={() => { resetForm(); setIsAddOpen(true); setIsBulkOpen(false); }}>
              + Add Contact
            </button>
            <button className="btn" onClick={() => { setIsBulkOpen(true); setIsAddOpen(false); }}>
              Bulk Upload CSV
            </button>
          </div>
        </div>

        {/* Filter Dropdowns & Search */}
        <div className="table-toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>City:</span>
              <select className="form-select" value={filterCity} onChange={e => setFilterCity(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="">All Cities</option>
                {CitiesList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Industry:</span>
              <select className="form-select" value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="">All Industries</option>
                {INDUSTRIES_LIST.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</span>
              <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Paused">Paused</option>
              </select>
            </div>
          </div>
          <div style={{ flex: '0 1 250px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search by name or email..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.75rem' }}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Industry</th>
                <th>City</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                    No contacts match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.company || '—'}</td>
                    <td>
                      {c.industry ? (
                        <span className="badge badge-neutral">
                          {c.industry}
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
                        <button className="icon-btn" title="Edit Contact" onClick={() => { startEdit(c); setIsAddOpen(true); setIsBulkOpen(false); }}>
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
      </div>

      {/* RIGHT PANEL */}
      <div>
        {isAddOpen && (
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">{editingContact ? 'Edit Contact' : 'Add New Contact'}</h4>
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
              <div className="form-group">
                <label>Company</label>
                <input type="text" className="form-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Stripe" />
              </div>
              <div className="form-group">
                <label>Target Role</label>
                <input type="text" className="form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Software Engineer" />
              </div>
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
                <label>City</label>
                <select className="form-select" value={City} onChange={e => setCity(e.target.value)}>
                  <option value="">-- Select City --</option>
                  {CitiesList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Outreach Status</label>
                <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>
              <div className="flex-row-between" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn" onClick={() => setIsAddOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Contact</button>
              </div>
            </form>
          </div>
        )}

        {isBulkOpen && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: '1rem' }}>
              <h4 className="card-title">Upload HR CSV File</h4>
              <button className="icon-btn" onClick={() => setIsBulkOpen(false)}>&times;</button>
            </div>
            
            <div>
              <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
                Select or drop your <strong>.csv</strong> file below. Auto-detected headers:
              </p>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {['name', 'email', 'company', 'title', 'industry', 'City'].map(h => (
                  <span key={h} className="badge badge-neutral">
                    {h}
                  </span>
                ))}
              </div>

              <div 
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-main)',
                  transition: 'border-color 0.2s',
                  marginBottom: '1.5rem'
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
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📊</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500' }}>
                  {filename ? `Selected: ${filename}` : 'Click or drop .csv here'}
                </span>
                {csvText && !csvText.startsWith('Binary file') && (
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.5rem', fontWeight: '500' }}>
                    CSV loaded ({csvText.split('\n').length} lines)
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>OR PASTE CSV CONTENT DIRECTLY:</label>
                <textarea 
                  className="form-textarea"
                  value={csvText.startsWith('Binary file') ? '' : csvText}
                  onChange={e => {
                    setCsvText(e.target.value);
                    setSelectedFile(null);
                    setFilename('Pasted CSV text');
                  }}
                  placeholder="Name,Email,Company,Role,Industry,City&#10;Sarah,sarah@corp.com,TechCorp,Recruiter,Technology,Germany"
                />
              </div>
            </div>

            <div className="flex-row-between" style={{ marginTop: '1.5rem' }}>
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
        )}

        {!isAddOpen && !isBulkOpen && (
          <div className="card empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A2.25 2.25 0 0 1 12.75 21.5h-1.5a2.25 2.25 0 0 1-2.25-2.263V19.13m4.5-3.07a9.3 9.3 0 0 0-4.5-1.229 9.302 9.302 0 0 0-4.5 1.23M13.5 8.25a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM5.25 8.25a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <p>Select an action to manage contacts.</p>
          </div>
        )}
      </div>

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




