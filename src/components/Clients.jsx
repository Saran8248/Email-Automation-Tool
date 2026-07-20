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
  const [status, setStatus] = useState('Active');
  const [testingSmtp, setTestingSmtp] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      if (Array.isArray(data)) {
        setClients(data);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
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
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const data = await res.json();
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
      status
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setNotification({
          message: editingClient ? 'Candidate details updated successfully!' : 'Candidate added successfully!',
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
      const res = await fetch('/api/clients/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, app_password: appPassword })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: data.message || 'SMTP Connection succeeded!', type: 'success' });
      } else {
        setNotification({ message: data.error || 'SMTP Connection failed', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleUploadResumeTextFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setResumeText(e.target.result);
      setNotification({ message: 'Resume text loaded from file!', type: 'success' });
    };
    reader.readAsText(file);
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
                    accept=".txt,.md" 
                    style={{ display: 'none' }}
                    onChange={e => handleUploadResumeTextFile(e.target.files[0])}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => document.getElementById('resumeTextInput').click()}>
                    📎 Choose .txt / .md Resume File
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
