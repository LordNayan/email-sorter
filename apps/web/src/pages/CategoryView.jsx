import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';

function CategoryView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadEmails();
    loadCategory();
  }, [id]);

  const loadCategory = async () => {
    try {
      const res = await fetch('/categories', { credentials: 'include' });
      const categories = await res.json();
      const cat = categories.find((c) => c.id === id);
      setCategory(cat);
    } catch (err) {
      console.error('Error loading category:', err);
    }
  };

  const loadEmails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/emails?categoryId=${id}`, { credentials: 'include' });
      const data = await res.json();
      setEmails(data.items || []);
    } catch (err) {
      console.error('Error loading emails:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEmail = (emailId) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId);
    } else {
      newSelected.add(emailId);
    }
    setSelectedEmails(newSelected);
  };

  const toggleAll = () => {
    if (selectedEmails.size === emails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(emails.map((e) => e.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedEmails.size === 0) return;
    if (!confirm(`Delete ${selectedEmails.size} email(s)?`)) return;

    try {
      const res = await fetch('/emails/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedEmails) }),
      });

      if (res.ok) {
        setMessage(`Deleted ${selectedEmails.size} email(s)`);
        setSelectedEmails(new Set());
        loadEmails();
      }
    } catch (err) {
      console.error('Error deleting emails:', err);
    }
  };

  const handleUnsubscribe = async () => {
    if (selectedEmails.size === 0) return;
    if (!confirm(`Unsubscribe from ${selectedEmails.size} email(s)?`)) return;

    try {
      const res = await fetch('/emails/bulk/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedEmails) }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`Queued ${data.queued} unsubscribe request(s)`);
        setSelectedEmails(new Set());
      }
    } catch (err) {
      console.error('Error unsubscribing:', err);
    }
  };

  const viewEmail = async (email) => {
    try {
      const res = await fetch(`/emails/${email.id}`, { credentials: 'include' });
      const full = await res.json();
      setSelectedEmail(full);
    } catch (err) {
      console.error('Error loading email:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-content">
          <h1>Email Sorter</h1>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary btn-sm">
            Back to Dashboard
          </button>
        </div>
      </nav>

      <div className="container">
        <div className="card">
          <h2>{category?.name || 'Category'}</h2>
          {category?.description && <p style={{ color: '#666' }}>{category.description}</p>}
        </div>

        {message && <div className="success">{message}</div>}

        <div className="card">
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button onClick={toggleAll} className="btn btn-secondary btn-sm">
              {selectedEmails.size === emails.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleDelete}
              className="btn btn-danger btn-sm"
              disabled={selectedEmails.size === 0}
            >
              Delete ({selectedEmails.size})
            </button>
            <button
              onClick={handleUnsubscribe}
              className="btn btn-primary btn-sm"
              disabled={selectedEmails.size === 0}
            >
              Unsubscribe ({selectedEmails.size})
            </button>
          </div>

          {emails.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Received</th>
                  <th>Summary</th>
                  <th>Unsub</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEmails.has(email.id)}
                        onChange={() => toggleEmail(email.id)}
                      />
                    </td>
                    <td><strong>{email.subject}</strong></td>
                    <td>{email.from}</td>
                    <td>{new Date(email.receivedAt).toLocaleDateString()}</td>
                    <td style={{ fontSize: '12px', color: '#666' }}>{email.aiSummary}</td>
                    <td>{email.unsubscribeUrl || email.unsubscribeMailto ? '✓' : '-'}</td>
                    <td>
                      <button onClick={() => viewEmail(email)} className="btn btn-primary btn-sm">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>No emails in this category yet.</p>
          )}
        </div>
      </div>

      {/* Email Drawer */}
      {selectedEmail && (
        <div className="modal-overlay" onClick={() => setSelectedEmail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <h2>{selectedEmail.subject}</h2>
            <p><strong>From:</strong> {selectedEmail.from}</p>
            <p><strong>Date:</strong> {new Date(selectedEmail.receivedAt).toLocaleString()}</p>
            {selectedEmail.aiSummary && (
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
                <strong>AI Summary:</strong> {selectedEmail.aiSummary}
              </div>
            )}
            <div style={{ marginTop: '15px', maxHeight: '400px', overflow: 'auto', border: '1px solid #eee', padding: '15px' }}>
              {selectedEmail.html ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selectedEmail.html),
                  }}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{selectedEmail.text}</pre>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setSelectedEmail(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryView;
