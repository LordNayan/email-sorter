import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Check auth
      const userRes = await fetch('/me', { credentials: 'include' });
      if (!userRes.ok) {
        navigate('/login');
        return;
      }
      const userData = await userRes.json();
      setUser(userData);

      // Load categories
      const catRes = await fetch('/categories', { credentials: 'include' });
      const catData = await catRes.json();
      setCategories(catData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newCategory),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create category');
      }

      setShowModal(false);
      setNewCategory({ name: '', description: '' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    navigate('/login');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-content">
          <h1>Email Sorter</h1>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">
            Logout
          </button>
        </div>
      </nav>

      <div className="container">
        {/* User Info */}
        <div className="card">
          <h2>Welcome, {user?.name || user?.email}</h2>
          <p style={{ color: '#666' }}>{user?.email}</p>
        </div>

        {/* Connected Accounts */}
        <div className="card">
          <h2>Connected Gmail Accounts</h2>
          {user?.accounts?.length > 0 ? (
            <div>
              {user.accounts.map((account) => (
                <div key={account.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  {account.email}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#666' }}>No accounts connected</p>
          )}
          <button 
            onClick={() => window.location.href = '/auth/google'} 
            className="btn btn-primary btn-sm"
            style={{ marginTop: '10px' }}
          >
            Connect Another Gmail
          </button>
        </div>

        {/* Categories */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>Categories</h2>
            <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
              Add Category
            </button>
          </div>

          {categories.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Emails</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td><strong>{cat.name}</strong></td>
                    <td>{cat.description || '-'}</td>
                    <td>{cat._count?.emails || 0}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/categories/${cat.id}`)}
                        className="btn btn-primary btn-sm"
                      >
                        View Emails
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>No categories yet. Create one to get started!</p>
          )}
        </div>
      </div>

      {/* Add Category Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Category</h2>
            {error && <div className="error">{error}</div>}
            <form onSubmit={handleCreateCategory}>
              <label>
                Name *
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
