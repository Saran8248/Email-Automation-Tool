import React, { useState } from 'react';

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

export default function Logs({ logs, fetchLogs, setNotification }) {
  const [selectedLog, setSelectedLog] = useState(null);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all outreach logs? This cannot be undone.')) return;
    try {
      const data = await safeFetchJson('/api/logs/clear', { method: 'POST' });
      if (data.success) {
        setNotification({ message: 'Outreach history cleared successfully!', type: 'success' });
        fetchLogs();
      } else {
        setNotification({ message: data.error || 'Failed to clear logs', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="split-layout-65-35">
      <div>
        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title">Outreach Log History</h3>
          {logs.length > 0 && (
            <button className="btn btn-danger" onClick={handleClearLogs}>
              Clear History Logs
            </button>
          )}
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Sent Date</th>
                <th>Recipient Name</th>
                <th>Email Address</th>
                <th>Company</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                    No emails have been sent out yet. Start a campaign or send a manual email to see logs.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.sent_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 500 }}>{log.contact_name}</td>
                    <td>{log.contact_email}</td>
                    <td>{log.company || '—'}</td>
                    <td>
                      <span className={`badge ${log.status === 'Sent' ? 'badge-success' : 'badge-danger'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm" onClick={() => setSelectedLog(log)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        {selectedLog ? (
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Sent Email Details</h4>
              <button className="icon-btn" onClick={() => setSelectedLog(null)}>&times;</button>
            </div>
            <div>
              <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
                Recipient: <strong>{selectedLog.contact_name}</strong> ({selectedLog.contact_email})
              </p>
              <div className="form-group">
                <label>Subject Line</label>
                <div className="form-input" style={{ backgroundColor: 'var(--bg-main)' }}>{selectedLog.subject}</div>
              </div>
              <div className="form-group">
                <label>Email Body</label>
                <div 
                  className="preview-box" 
                  style={{ 
                    maxHeight: '400px', 
                    overflowY: 'auto', 
                    whiteSpace: 'pre-wrap', 
                    fontSize: '0.9rem',
                    lineHeight: '1.6' 
                  }}
                >
                  {selectedLog.body || 'No content logged.'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            <p>Select a log entry to view full email details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
