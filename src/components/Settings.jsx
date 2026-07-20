import React, { useState, useEffect } from 'react';

export default function Settings({ setNotification }) {
  const [settings, setSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: '465',
    smtp_user: '',
    smtp_pass: '',
    sender_name: '',
    gemini_api_key: '',
    daily_limit: '10',
    send_hour: '12',
    send_minute: '00',
    is_scheduler_active: 'false',
  });
  
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: 'Settings saved successfully!', type: 'success' });
      } else {
        setNotification({ message: data.error || 'Failed to save settings', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const testSmtpConnection = async () => {
    if (!settings.smtp_user || !settings.smtp_pass) {
      setNotification({ message: 'Please provide SMTP email address and password first', type: 'error' });
      return;
    }
    setTestingSmtp(true);
    try {
      const res = await fetch('/api/settings/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: data.message || 'SMTP Connection Test succeeded!', type: 'success' });
      } else {
        setNotification({ message: data.error || 'SMTP Connection Failed', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title">OutreachSphere Configuration</h3>
        </div>

        <form onSubmit={handleSave}>
          <h4 style={{ color: 'var(--primary-light)', fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            AI Engine - Personalization Settings
          </h4>
          
          <div className="form-group">
            <label>Google Gemini API Key</label>
            <input 
              type="password" 
              className="form-input" 
              value={settings.gemini_api_key} 
              onChange={e => setSettings({ ...settings, gemini_api_key: e.target.value })} 
              placeholder={settings.gemini_api_key ? '••••••••••••••••••••' : 'Enter Gemini AI API Key'}
            />
            <span className="page-subtitle" style={{ fontSize: '0.8rem' }}>
              Your API key is stored safely in your local database. Get a free API key at ai.google.dev.
            </span>
          </div>

          <h4 style={{ color: 'var(--primary-light)', fontSize: '0.9rem', margin: '2rem 0 1rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            SMTP Server Configuration
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>SMTP Host</label>
              <input 
                type="text" 
                className="form-input" 
                value={settings.smtp_host} 
                onChange={e => setSettings({ ...settings, smtp_host: e.target.value })} 
                placeholder="e.g. smtp.gmail.com"
              />
            </div>
            <div className="form-group">
              <label>SMTP Port</label>
              <input 
                type="text" 
                className="form-input" 
                value={settings.smtp_port} 
                onChange={e => setSettings({ ...settings, smtp_port: e.target.value })} 
                placeholder="e.g. 465"
              />
            </div>
          </div>

          <div className="form-group">
            <label>SMTP Username / Sender Email</label>
            <input 
              type="email" 
              className="form-input" 
              value={settings.smtp_user} 
              onChange={e => setSettings({ ...settings, smtp_user: e.target.value })} 
              placeholder="e.g. myname@gmail.com"
            />
          </div>

          <div className="form-group">
            <label>SMTP Password (App-specific Password for Gmail)</label>
            <input 
              type="password" 
              className="form-input" 
              value={settings.smtp_pass} 
              onChange={e => setSettings({ ...settings, smtp_pass: e.target.value })} 
              placeholder={settings.smtp_pass ? '••••••••••••••••••••' : 'Enter Gmail App Password'}
            />
          </div>

          <div className="form-group">
            <label>Sender Full Name</label>
            <input 
              type="text" 
              className="form-input" 
              value={settings.sender_name} 
              onChange={e => setSettings({ ...settings, sender_name: e.target.value })} 
              placeholder="e.g. John Doe (Software Engineer)"
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving Config...' : 'Save Configuration'}
            </button>
            <button type="button" className="btn" onClick={testSmtpConnection} disabled={testingSmtp}>
              {testingSmtp ? 'Testing SMTP...' : 'Send Test Email'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ height: 'fit-content' }}>
        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title">Daily Campaign Scheduler</h3>
        </div>
        
        <div className="form-group">
          <label>Scheduler Status</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="activeCheckbox"
              style={{ width: 18, height: 18, cursor: 'pointer' }}
              checked={settings.is_scheduler_active === 'true'}
              onChange={e => {
                const nextVal = e.target.checked ? 'true' : 'false';
                setSettings({ ...settings, is_scheduler_active: nextVal });
              }}
            />
            <label htmlFor="activeCheckbox" style={{ cursor: 'pointer', fontSize: '0.95rem' }}>
              Enable Automated Outreach Daily
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label>Hour (0-23)</label>
            <input 
              type="number" 
              min="0" 
              max="23"
              className="form-input" 
              value={settings.send_hour} 
              onChange={e => setSettings({ ...settings, send_hour: e.target.value })} 
            />
          </div>
          <div className="form-group">
            <label>Minute (0-59)</label>
            <input 
              type="number" 
              min="0" 
              max="59"
              className="form-input" 
              value={settings.send_minute} 
              onChange={e => setSettings({ ...settings, send_minute: e.target.value })} 
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '0.5rem' }}>
          <label>Daily Limit (Max Emails / Day)</label>
          <input 
            type="number" 
            min="1"
            className="form-input" 
            value={settings.daily_limit} 
            onChange={e => setSettings({ ...settings, daily_limit: e.target.value })} 
          />
        </div>

        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => handleSave(null)}
          >
            Apply Scheduler Settings
          </button>
        </div>
      </div>
    </div>
  );
}
