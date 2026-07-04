import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  // Read environment variables
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    // 1. Restore session from localStorage
    const savedToken = localStorage.getItem('qr_platform_token');
    const savedUser = localStorage.getItem('qr_platform_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }

    // 2. Fetch event configuration
    fetchEvent();
  }, []);

  const fetchEvent = async () => {
    try {
      const res = await fetch(`${API_URL}/event`);
      const json = await res.json();
      if (json.success) {
        setEvent(json.data);
      }
    } catch (err) {
      console.error('Error fetching event config:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();

      if (!json.success) {
        return { success: false, message: json.message };
      }

      // Save to state and storage
      const { token: jwt, user: userData } = json.data;
      setToken(jwt);
      setUser(userData);

      localStorage.setItem('qr_platform_token', jwt);
      localStorage.setItem('qr_platform_user', JSON.stringify(userData));

      return { success: true };
    } catch (err) {
      console.error('Login action failed:', err);
      return { success: false, message: 'Could not connect to the authentication server.' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('qr_platform_token');
    localStorage.removeItem('qr_platform_user');
  };

  const reauth = async (password) => {
    if (!token) return { success: false, message: 'Not authenticated.' };

    try {
      const res = await fetch(`${API_URL}/auth/reauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password }),
      });

      const json = await res.json();
      return json;
    } catch (err) {
      console.error('Reauth action failed:', err);
      return { success: false, message: 'Could not complete authentication check.' };
    }
  };

  const refreshEvent = async () => {
    await fetchEvent();
  };

  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const value = {
    user,
    token,
    event,
    loading,
    login,
    logout,
    reauth,
    refreshEvent,
    getAuthHeaders,
    API_URL
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
