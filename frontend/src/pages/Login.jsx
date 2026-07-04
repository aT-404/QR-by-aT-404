import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { QrCode, Lock, User, AlertCircle, Loader } from 'lucide-react';

export default function Login() {
  const { login, user, event } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to correct dashboard if already logged in
  React.useEffect(() => {
    if (user) {
      if (user.role === 'admin') navigate('/admin/dashboard', { replace: true });
      else navigate('/staff/scanner', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all credentials.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(username.trim(), password);
      if (!result.success) {
        setError(result.message || 'Login failed. Please check credentials.');
      } else {
        // Redirect back to original route or corresponding home page
        const from = location.state?.from?.pathname;
        if (from) {
          navigate(from, { replace: true });
        } else {
          // Default role redirects
          const savedUser = JSON.parse(localStorage.getItem('qr_platform_user'));
          if (savedUser?.role === 'admin') {
            navigate('/admin/dashboard', { replace: true });
          } else {
            navigate('/staff/scanner', { replace: true });
          }
        }
      }
    } catch (err) {
      setError('Could not connect to the authentication server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      {/* Decorative background gradients */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>

      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex bg-gradient-to-tr from-primary-600 to-primary-400 p-4 rounded-2xl shadow-xl shadow-primary-500/10 mb-4 transform hover:rotate-12 transition-transform duration-300">
            <QrCode className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight bg-gradient-to-r from-white to-dark-300 bg-clip-text text-transparent">
            {event?.event_name || 'Event QR Platform'}
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            {event?.venue ? `${event.venue} — Entry Portal` : 'Event QR Management Platform'}
          </p>
        </div>

        {/* Login Box */}
        <div className="glass-card p-8 shadow-2xl">
          <h2 className="text-xl font-display text-white mb-6">Access Account</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-xl flex items-start gap-2.5 animate-slide-up">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username Input */}
            <div>
              <label className="form-label" htmlFor="username">Username or Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-dark-500">
                  <User className="h-5 w-5" />
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="e.g. john_staff or admin@event.com"
                  className="form-input pl-11"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="form-label mb-0" htmlFor="password">Password</label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-dark-500">
                  <Lock className="h-5 w-5" />
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="form-input pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-3.5 mt-2 font-semibold shadow-lg disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer help note */}
        <div className="text-center mt-8 text-xs text-dark-500">
          Staff credentials are created by event administrators.
        </div>
      </div>
    </div>
  );
}
