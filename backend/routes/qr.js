import express from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requireAdmin, requireStaffOrAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/qr/lookup/:token
 * Fetches QR and Event Details by secure token.
 * Open to everyone (public redirects to public info, staff/admin get staff interface).
 */
router.get('/lookup/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // 1. Fetch QR code details
    const { data: qr, error: qrErr } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('secure_token', token)
      .maybeSingle();

    if (qrErr || !qr) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or non-existent QR token.',
        errorCode: 'QR_NOT_FOUND'
      });
    }

    // 2. Fetch associated Event Settings
    const { data: event, error: eventErr } = await supabase
      .from('event_settings')
      .select('*')
      .eq('id', qr.event_id)
      .single();

    if (eventErr || !event) {
      return res.status(404).json({
        success: false,
        message: 'Associated event settings not found.',
        errorCode: 'EVENT_NOT_FOUND'
      });
    }

    // Check if token user is authenticated to return more details
    const authHeader = req.headers['authorization'];
    let profile = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwtToken = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(jwtToken);
      if (user) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (userProfile && userProfile.status === 'active') {
          profile = userProfile;
        }
      }
    }

    // If role is Admin or Staff, return detailed operational data
    if (profile && (profile.role === 'admin' || profile.role === 'staff')) {
      // For Admin, fetch scan log history too
      let scanHistory = [];
      if (profile.role === 'admin') {
        const { data: history } = await supabase
          .from('scan_history')
          .select('*')
          .eq('qr_code_id', qr.id)
          .order('created_at', { ascending: false });
        scanHistory = history || [];
      }

      return res.json({
        success: true,
        message: 'Authorized QR lookup successful.',
        data: {
          role: profile.role,
          qr: {
            id: qr.id,
            qr_id: qr.qr_id,
            secure_token: qr.secure_token,
            current_usage: qr.current_usage,
            max_usage: qr.max_usage,
            status: qr.status,
            description: qr.description,
            created_at: qr.created_at,
            last_scanned_at: qr.last_scanned_at
          },
          event,
          scanHistory
        }
      });
    }

    // Otherwise, return safe public info only
    return res.json({
      success: true,
      message: 'Public QR lookup successful.',
      data: {
        role: 'public',
        qr: {
          qr_id: qr.qr_id,
          current_usage: qr.current_usage,
          max_usage: qr.max_usage,
          status: qr.status,
          description: qr.description
        },
        event: {
          event_name: event.event_name,
          description: event.description,
          venue: event.venue,
          event_date: event.event_date,
          contact_details: event.contact_details,
          logo_url: event.logo_url
        }
      }
    });

  } catch (error) {
    console.error('QR Lookup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error looking up QR details.',
      errorCode: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/qr/scan/:token
 * Increments QR usage atomically via stored PostgreSQL procedure.
 * Staff/Admin only.
 */
router.post('/scan/:token', authenticateToken, requireStaffOrAdmin, async (req, res) => {
  const { token } = req.params;
  const { deviceInfo } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  try {
    // Invoke transactional PostgreSQL function
    const { data, error } = await supabase.rpc('increment_qr_usage', {
      p_token: token,
      p_staff_id: req.user.id,
      p_device_info: deviceInfo || 'Unknown Device',
      p_ip_address: ipAddress
    });

    if (error) throw error;

    if (!data.success) {
      return res.status(400).json({
        success: false,
        message: data.message,
        errorCode: data.errorCode
      });
    }

    return res.json({
      success: true,
      message: data.message,
      data: data.data
    });

  } catch (error) {
    console.error('Scan increment error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while writing the scan check-in.',
      errorCode: 'DATABASE_TRANSACTION_ERROR'
    });
  }
});

/**
 * GET /api/qr/admin/search
 * Global QR search/filter for Admins.
 */
router.get('/admin/search', authenticateToken, requireAdmin, async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;

  try {
    let query = supabase
      .from('qr_codes')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      const cleanSearch = search.trim();
      query = query.or(
        `qr_id.ilike.%${cleanSearch}%,` +
        `description.ilike.%${cleanSearch}%,` +
        `secure_token.eq.${cleanSearch}`
      );
    }

    // Pagination
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    const { data: qrs, count, error } = await query
      .order('qr_id', { ascending: true })
      .range(from, to);

    if (error) throw error;

    return res.json({
      success: true,
      message: 'QR search results retrieved.',
      data: {
        qrs,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('QR search error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search QR codes.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

/**
 * POST /api/qr/admin/bulk
 * Generates QR codes in batches to prevent UI freeze and connection timeouts.
 * Admin only.
 */
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
  const { count, description, maxUsage } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!count || parseInt(count) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'A positive QR count is required.',
      errorCode: 'INVALID_COUNT'
    });
  }

  try {
    // 1. Fetch active event
    const { data: event, error: eventErr } = await supabase
      .from('event_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (eventErr || !event) {
      return res.status(400).json({
        success: false,
        message: 'No active event settings found. Please configure settings first.',
        errorCode: 'EVENT_SETTINGS_MISSING'
      });
    }

    const prefix = event.qr_prefix;
    const defaultMax = maxUsage ? parseInt(maxUsage) : event.default_max_usage;

    // 2. Determine next starting number sequence
    const { data: lastQr, error: lastQrErr } = await supabase
      .from('qr_codes')
      .select('qr_id')
      .eq('event_id', event.id)
      .ilike('qr_id', `${prefix}-%`)
      .order('created_at', { ascending: false })
      .order('qr_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let startNum = event.starting_number;

    if (lastQr) {
      const parts = lastQr.qr_id.split('-');
      const lastNum = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNum)) {
        startNum = lastNum + 1;
      }
    }

    const insertedQrs = [];
    const batchSize = parseInt(count);

    // 3. Generate QR properties
    for (let i = 0; i < batchSize; i++) {
      const seqStr = String(startNum + i).padStart(4, '0');
      const qrId = `${prefix}-${seqStr}`;
      const secureToken = crypto.randomBytes(32).toString('hex');

      insertedQrs.push({
        qr_id: qrId,
        secure_token: secureToken,
        event_id: event.id,
        current_usage: 0,
        max_usage: defaultMax,
        status: 'Unused',
        description: description || `Generated for ${event.event_name}`,
        version: 1
      });
    }

    // 4. Insert batch into database
    const { data: generated, error: insertErr } = await supabase
      .from('qr_codes')
      .insert(insertedQrs)
      .select('qr_id, secure_token, max_usage, status');

    if (insertErr) throw insertErr;

    // 5. Audit log bulk generation
    await supabase.from('audit_logs').insert({
      category: 'admin_edit',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'bulk_generate',
      target_id: prefix,
      details: {
        count: batchSize,
        start_number: startNum,
        end_number: startNum + batchSize - 1,
        description
      },
      ip_address: ipAddress
    });

    return res.json({
      success: true,
      message: `Successfully generated ${batchSize} QR codes.`,
      data: {
        generated
      }
    });

  } catch (error) {
    console.error('Bulk generate error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate QR codes bulk batch.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

/**
 * POST /api/qr/admin/action
 * Performs administrative updates on QR usage or limits.
 * Sensitive adjustments require re-authentication.
 */
router.post('/admin/action', authenticateToken, requireAdmin, async (req, res) => {
  const { qrId, action, paramVal, confirmPassword } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const deviceInfo = req.headers['user-agent'] || 'Unknown Device';

  if (!qrId || !action) {
    return res.status(400).json({
      success: false,
      message: 'QR ID and Action parameters are required.',
      errorCode: 'INVALID_PARAMETERS'
    });
  }

  // Destructive actions requiring explicit password confirmation
  const destructiveActions = ['reset', 'change_max', 'toggle_disable'];

  try {
    if (destructiveActions.includes(action)) {
      if (!confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Password confirmation is required for this destructive action.',
          errorCode: 'PASSWORD_CONFIRMATION_REQUIRED'
        });
      }

      // Verify administrator password
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password: confirmPassword
      });

      if (authErr) {
        return res.status(401).json({
          success: false,
          message: 'Action denied: Password confirmation failed.',
          errorCode: 'REAUTH_FAILED'
        });
      }
    }

    // Call stored procedure to modify the QR atomically
    const { data, error } = await supabase.rpc('admin_modify_qr', {
      p_qr_id: qrId,
      p_actor_id: req.user.id,
      p_action: action,
      p_param_val: paramVal || '',
      p_device_info: deviceInfo,
      p_ip_address: ipAddress
    });

    if (error) throw error;

    if (!data.success) {
      return res.status(400).json({
        success: false,
        message: data.message,
        errorCode: data.errorCode
      });
    }

    return res.json({
      success: true,
      message: data.message,
      data: data.data
    });

  } catch (error) {
    console.error('Admin action execution error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute administrative action.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

export default router;
