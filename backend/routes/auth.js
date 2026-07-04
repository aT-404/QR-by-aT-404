import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Standard login supporting Username and Email.
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both username/email and password.',
      errorCode: 'MISSING_FIELDS'
    });
  }

  try {
    let email = username;

    // Check if input is a username (no '@' character)
    if (!username.includes('@')) {
      // Look up profile to verify account status and get full details
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.toLowerCase().trim())
        .maybeSingle();

      if (profileErr || !profile) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
          errorCode: 'INVALID_CREDENTIALS'
        });
      }

      if (profile.status === 'disabled') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been disabled by an administrator.',
          errorCode: 'ACCOUNT_DISABLED'
        });
      }

      // Generate the mock email format used for authentication
      email = `${profile.username}@event.local`;
    }

    // Authenticate with Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (authErr || !authData.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
        errorCode: 'INVALID_CREDENTIALS'
      });
    }

    // Fetch user profile info
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileErr || !profile) {
      return res.status(403).json({
        success: false,
        message: 'Profile not found.',
        errorCode: 'PROFILE_NOT_FOUND'
      });
    }

    if (profile.status === 'disabled') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled.',
        errorCode: 'ACCOUNT_DISABLED'
      });
    }

    // Update last login time
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', profile.id);

    // Audit log auth event (skip if it's the backend system user or logging system)
    await supabase.from('audit_logs').insert({
      category: 'auth_event',
      actor_id: profile.id,
      actor_name: profile.name,
      action: 'login',
      target_id: profile.username,
      details: { username: profile.username, role: profile.role }
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        user: {
          id: profile.id,
          name: profile.name,
          username: profile.username,
          role: profile.role,
          status: profile.status,
          email: authData.user.email
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during login.',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * POST /api/auth/reauth
 * Verifies admin password for destructive actions.
 */
router.post('/reauth', authenticateToken, async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required for confirmation.',
      errorCode: 'PASSWORD_REQUIRED'
    });
  }

  try {
    // Validate by trying to log in with the current user's email and new password
    const { error } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Password confirmation failed. Incorrect password.',
        errorCode: 'REAUTH_FAILED'
      });
    }

    return res.json({
      success: true,
      message: 'Password verified successfully.',
      data: { verified: true }
    });

  } catch (error) {
    console.error('Re-auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during confirmation.',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
