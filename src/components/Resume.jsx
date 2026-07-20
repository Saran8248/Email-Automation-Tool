import React, { useState, useEffect } from 'react';

export default function Resume({ setNotification }) {
  const [content, setContent] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [filename, setFilename] = useState('resume.txt');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchResume();
  }, []);

  const fetchResume = async () => {
    try {
      const res = await fetch('/api/resume');
      const data = await res.json();
      if (data) {
        setContent(data.content || '');
        setCustomPrompt(data.custom_prompt || '');
        setFilename(data.filename || 'resume.txt');
      }
    } catch (err) {
      console.error('Failed to load resume details:', err);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, custom_prompt: customPrompt, filename })
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: 'Resume and AI generation profile saved successfully!', type: 'success' });
      } else {
        setNotification({ message: data.error || 'Failed to save', type: 'error' });
      }
    } catch (err) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasteDemoResume = () => {
    setContent(`JOHN DOE
Full Stack Engineer
Email: john.doe@email.com | Phone: +1 555 123 4567 | Web: github.com/johndoe

Summary:
Results-oriented software developer with 4+ years of experience building modern React/Node applications. Specialized in high-performance cloud architectures, database design, and automated CI/CD pipelines.

Skills:
- Frontend: JavaScript (ES6+), TypeScript, React, Next.js, HTML5, CSS Grid/Flexbox
- Backend: Node.js, Express, PostgreSQL, MongoDB, Redis, REST APIs, GraphQL
- Tools: Git, Docker, AWS (S3, EC2, Lambda), Jest, CI/CD Pipelines

Experience:
- Software Engineer | TechCorp Inc. (2024 - Present)
  - Designed and built responsive frontend dashboards in React, improving user retention by 22%.
  - Engineered high-throughput REST APIs handling over 1.5M requests daily using Express and Node.
  - Implemented automated test suites using Jest, raising coverage from 60% to 92%.
- Junior Web Developer | StartupLab (2022 - 2024)
  - Collaborated on developing e-commerce web applications using TypeScript and Next.js.
  - Optimized database query run times in PostgreSQL by 40% through index optimizations.`);
    setNotification({ message: 'Sample resume text pasted. Click Save to store it!', type: 'success' });
  };

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title">AI Resume & Outreach Context Profile</h3>
        <button className="btn" onClick={handlePasteDemoResume}>
          Paste Sample Resume Data
        </button>
      </div>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Profile File Reference Name</label>
          <input 
            type="text" 
            className="form-input" 
            value={filename} 
            onChange={e => setFilename(e.target.value)} 
            placeholder="e.g. John_Doe_Resume_2026.pdf" 
          />
        </div>

        <div className="form-group">
          <label>Your Resume / Work History Details (Plain Text)</label>
          <textarea
            className="form-textarea"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste your plain text resume details, including skills, experiences, and education here. The AI will read this to generate highly personalized outreach emails."
            style={{ minHeight: '300px', fontSize: '0.9rem', lineHeight: '1.5' }}
          />
        </div>

        <div className="form-group">
          <label>Gemini Generative Directives (System Instruction Prompt)</label>
          <textarea
            className="form-textarea"
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Custom instructions for how the AI should customize and draft your cold email outreach messages..."
            style={{ minHeight: '150px', fontSize: '0.9rem' }}
          />
        </div>

        <div className="modal-footer" style={{ marginTop: '1.5rem', justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving Profile...' : 'Save AI Profile & Prompt'}
          </button>
        </div>
      </form>
    </div>
  );
}
