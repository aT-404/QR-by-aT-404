import { supabase } from '../config/supabase.js';

/**
 * Standard Auth Middleware to authenticate request using Supabase JWT
 */
export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access Denied: No authentication token provided.',
        errorCode: 'TOKEN_REQUIRED'
      });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please log in again.',
        errorCode: 'INVALID_TOKEN'
      });
    }

    // Query profiles table to get role and status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Profile not found.',
        errorCode: 'PROFILE_NOT_FOUND'
      });
    }

    if (profile.status === 'disabled') {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Your account has been disabled by an administrator.',
        errorCode: 'ACCOUNT_DISABLED'
      });
    }

    // Attach user profile to request object
    req.user = {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      role: profile.role,
      status: profile.status,
      email: user.email
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
      errorCode: 'INTERNAL_AUTH_ERROR'
    });
  }
}

/**
 * Authorization Middleware: Requires Admin role
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Administrator role required.',
      errorCode: 'ADMIN_REQUIRED'
    });
  }
  next();
}

/**
 * Authorization Middleware: Requires Staff or Admin role
 */
export function requireStaffOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'staff')) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Authorized credentials required.',
      errorCode: 'UNAUTHORIZED_ROLE'
    });
  }
  next();
}
