import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Contacts from './components/Contacts.jsx';
import Clients from './components/Clients.jsx';
import Settings from './components/Settings.jsx';
import Logs from './components/Logs.jsx';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [contacts, setContacts] = useState([]);
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notification, setNotification] = useState(null);
  const [triggerInProgress, setTriggerInProgress] = useState(false);

  useEffect(() => {
    fetchContacts();
    fetchLogs();
    fetchClients();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchContacts = async () => {
    try {
      const data = await safeFetchJson('/api/contacts');
      if (Array.isArray(data)) {
        setContacts(data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  const fetchClients = async () => {
    try {
      const data = await safeFetchJson('/api/clients');
      if (Array.isArray(data)) {
        setClients(data);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const data = await safeFetchJson('/api/logs');
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const triggerCampaign = async () => {
    setTriggerInProgress(true);
    setNotification({ message: 'Starting email outreach campaign for all active candidates...', type: 'success' });
    try {
      const data = await safeFetchJson('/api/campaign/trigger', { method: 'POST' });
      if (data.success) {
        setNotification({
          message: `Campaign complete! Sent: ${data.sent || 0}, Failed: ${data.failed || 0}`,
          type: 'success'
        });
        fetchLogs();
        fetchContacts();
        fetchClients();
      } else {
        setNotification({ message: data.reason || data.error || 'Campaign run incomplete. Check config.', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setTriggerInProgress(false);
    }
  };

  // Calculate dynamic stats
  const activeCount = clients.filter(c => c.status === 'Active').length;
  const sentCount = logs.filter(l => l.status === 'Sent').length;
  const failedCount = logs.filter(l => l.status === 'Failed').length;

  const stats = {
    total: clients.length,
    active: activeCount,
    sent: sentCount,
    failed: failedCount
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" style={{ width: 20, height: 20 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </div>
          <h1 className="logo-text">EMOTO</h1>
        </div>

        <nav>
          <ul className="nav-links">
            <li>
              <a 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                </svg>
                Dashboard
              </a>
            </li>
            <li>
              <a 
                className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`}
                onClick={() => setActiveTab('clients')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                Clients
              </a>
            </li>
            <li>
              <a 
                className={`nav-item ${activeTab === 'contacts' ? 'active' : ''}`}
                onClick={() => setActiveTab('contacts')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A2.25 2.25 0 0 1 12.75 21.5h-1.5a2.25 2.25 0 0 1-2.25-2.263V19.13m4.5-3.07a9.3 9.3 0 0 0-4.5-1.229 9.302 9.302 0 0 0-4.5 1.23M13.5 8.25a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM5.25 8.25a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                HR Contacts
              </a>
            </li>
            <li>
              <a 
                className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Outreach Log
              </a>
            </li>
            <li>
              <a 
                className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Settings
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        {notification && (
          <div className={`notification notification-${notification.type}`}>
            <span>{notification.message}</span>
            <button 
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
              onClick={() => setNotification(null)}
            >
              &times;
            </button>
          </div>
        )}

        <header className="page-header">
          <h2 className="page-title">
            {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'clients' && 'Clients / Candidate Roster'}
            {activeTab === 'contacts' && 'HR Contacts Manager'}
            {activeTab === 'logs' && 'Campaign Logs History'}
            {activeTab === 'settings' && 'Outreach Settings'}
          </h2>
          <p className="page-subtitle">
            {activeTab === 'dashboard' && 'Monitor your daily cold outreach campaigns and target statistics.'}
            {activeTab === 'clients' && 'Search, filter & manage your client roster and resumes.'}
            {activeTab === 'contacts' && 'Add, edit, or import placement and recruiting contacts.'}
            {activeTab === 'logs' && 'Trace the success rate of emails delivered to hiring managers.'}
            {activeTab === 'settings' && 'Configure SMTP, Gemini API Credentials, and active schedulers.'}
          </p>
        </header>

        {activeTab === 'dashboard' && (
          <Dashboard 
            stats={stats} 
            logs={logs} 
            triggerCampaign={triggerCampaign} 
            triggerInProgress={triggerInProgress} 
          />
        )}
        {activeTab === 'clients' && (
          <Clients 
            setNotification={setNotification} 
          />
        )}
        {activeTab === 'contacts' && (
          <Contacts 
            contacts={contacts} 
            fetchContacts={fetchContacts} 
            setNotification={setNotification} 
            clients={clients}
          />
        )}
        {activeTab === 'logs' && (
          <Logs 
            logs={logs} 
            fetchLogs={fetchLogs} 
            setNotification={setNotification} 
          />
        )}
        {activeTab === 'settings' && (
          <Settings 
            setNotification={setNotification} 
          />
        )}
      </main>
    </div>
  );
}
