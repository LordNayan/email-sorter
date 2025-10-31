import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already authenticated
    fetch('/me', { credentials: 'include' })
      .then((res) => {
        if (res.ok) {
          navigate('/dashboard');
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleLogin = () => {
    window.location.href = '/auth/google';
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '10px' }}>Email Sorter</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          AI-powered email management
        </p>
        <button onClick={handleLogin} className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
          Sign in with Google
        </button>
        <p style={{ marginTop: '20px', fontSize: '12px', color: '#999' }}>
          Your emails will be automatically sorted and summarized using AI
        </p>
      </div>
    </div>
  );
}

export default Login;
