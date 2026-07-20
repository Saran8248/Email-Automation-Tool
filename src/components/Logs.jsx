import React, { useState } from 'react';

export default function Logs({ logs, fetchLogs, setNotification }) {
  const [selectedLog, setSelectedLog] = useState(null);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all outreach logs? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      const data = await res.json();
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
              <th>Subject</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                  No emails have been sent out yet. Start a campaign or send a manual email to see logs.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.sent_at).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{log.contact_name}</td>
                  <td>{log.contact_email}</td>
                  <td>{log.company || '—'}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.subject || '—'}
                  </td>
                  <td>
                    <span className={`badge ${log.status === 'Sent' ? 'badge-success' : 'badge-danger'}`}>
                      {log.status}
                    </span>
                    {log.error_message && (
                      <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--danger)' }}>
                        {log.error_message}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => setSelectedLog(log)}>
                      View Body
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h4 className="modal-title">Sent Email Details</h4>
              <button className="icon-btn" onClick={() => setSelectedLog(null)}>&times;</button>
            </div>
            <div>
              <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
                Recipient: <strong>{selectedLog.contact_name}</strong> ({selectedLog.contact_email}) &bull; {selectedLog.company}
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
                    maxHeight: '300px', 
                    overflowY: 'auto', 
                    whiteSpace: 'pre-wrap', 
                    fontFamily: 'var(--font-body)', 
                    fontSize: '0.9rem',
                    lineHeight: '1.6' 
                  }}
                >
                  {selectedLog.body || 'No content logged.'}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setSelectedLog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
