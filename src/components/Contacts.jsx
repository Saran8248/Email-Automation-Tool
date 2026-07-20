import React, { useState } from 'react';

export default function Contacts({ contacts, fetchContacts, setNotification }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('Active');
  
  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, role, industry, country, status })
      });
      const data = await res.json();
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
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      const data = await res.json();
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
    setImporting(true);
    try {
      const res = await fetch('/api/contacts/bulk-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({
          message: `Imported ${data.imported} contacts successfully. Failed: ${data.failed}`,
          type: 'success'
        });
        setIsBulkOpen(false);
        setCsvText('');
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

  const triggerPreview = async (contact) => {
    setPreviewContact(contact);
    setIsPreviewOpen(true);
    setGeneratingPreview(true);
    setPreviewData({ subject: '', body: '' });

    try {
      const res = await fetch('/api/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id })
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewData({ subject: data.subject || '', body: data.body || '' });
      } else {
        setNotification({ message: data.error || 'Failed to generate preview', type: 'error' });
        setIsPreviewOpen(false);
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
      setIsPreviewOpen(false);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const sendCustomEmail = async () => {
    if (!previewContact) return;
    setSendingEmail(true);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: previewContact.id,
          customSubject: previewData.subject,
          customBody: previewData.body
        })
      });
      const data = await res.json();
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
                  <input type="text" className="form-input" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. FinTech" />
                </div>
                <div className="form-group">
                  <label>Country</label>
                  <input type="text" className="form-input" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Germany" />
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
          <div className="modal-content">
            <div className="modal-header">
              <h4 className="modal-title">Bulk Import CSV</h4>
              <button className="icon-btn" onClick={() => setIsBulkOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleBulkPaste}>
              <div className="form-group">
                <label>Paste CSV Raw Content (Must contain headers 'name' and 'email')</label>
                <textarea
                  required
                  className="form-textarea"
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  placeholder="name,email,company,role,country&#10;Hiring Manager,hiring@stripe.com,Stripe,Senior Engineer,Netherlands&#10;Alex Smith,alex@airbnb.com,Airbnb,Software Developer,Germany"
                  style={{ minHeight: '200px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsBulkOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={importing}>
                  {importing ? 'Importing...' : 'Parse & Import'}
                </button>
              </div>
            </form>
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
