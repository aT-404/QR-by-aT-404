import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/staff
 * Lists and searches all staff members with aggregated scan count.
 * Admin only.
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  const { search } = req.query;

  try {
    // Select staff profiles and count of scans from scan_history
    let query = supabase
      .from('profiles')
      .select('*, scan_history(count)')
      .eq('role', 'staff');

    if (search) {
      const cleanSearch = search.trim();
      query = query.or(
        `name.ilike.%${cleanSearch}%,` +
        `username.ilike.%${cleanSearch}%`
      );
    }

    const { data: staff, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Format profiles to flatten scan count
    const formattedStaff = staff.map(member => ({
      id: member.id,
      name: member.name,
      username: member.username,
      role: member.role,
      status: member.status,
      created_at: member.created_at,
      last_login_at: member.last_login_at,
      scan_count: member.scan_history && member.scan_history[0] ? member.scan_history[0].count : 0
    }));

    return res.json({
      success: true,
      message: 'Staff list retrieved successfully.',
      data: formattedStaff
    });

  } catch (error) {
    console.error('Error fetching staff list:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve staff profiles.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

/**
 * POST /api/staff
 * Creates a new staff member account.
 * Admin only.
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { name, username, password } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!name || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'All fields (name, username, password) are required.',
      errorCode: 'MISSING_FIELDS'
    });
  }

  const cleanUsername = username.toLowerCase().trim();
  const mockEmail = `${cleanUsername}@event.local`;

  try {
    // 1. Verify username uniqueness in profiles table
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken.',
        errorCode: 'DUPLICATE_USERNAME'
      });
    }

    // 2. Create the user inside Supabase Auth using the Admin Client
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: mockEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name, username: cleanUsername, role: 'staff' }
    });

    if (authErr || !authData.user) {
      console.error('Supabase auth creation error:', authErr);
      return res.status(400).json({
        success: false,
        message: authErr ? authErr.message : 'Auth registration failed.',
        errorCode: 'AUTH_CREATION_FAILED'
      });
    }

    // 3. Create the profile mapping
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name,
        username: cleanUsername,
        role: 'staff',
        status: 'active'
      })
      .select()
      .single();

    if (profileErr) {
      // Rollback Auth creation if profile write fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileErr;
    }

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      category: 'admin_edit',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'create_staff',
      target_id: cleanUsername,
      details: { name, username: cleanUsername },
      ip_address: ipAddress
    });

    return res.status(201).json({
      success: true,
      message: 'Staff account created successfully.',
      data: {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        role: profile.role,
        status: profile.status,
        created_at: profile.created_at,
        scan_count: 0
      }
    });

  } catch (error) {
    console.error('Staff creation error:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during staff creation.',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * PUT /api/staff/:id
 * Updates name, status (enable/disable), or resets password of staff.
 * Admin only.
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, status, password } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  try {
    // 1. Fetch current profile
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !profile) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found.',
        errorCode: 'PROFILE_NOT_FOUND'
      });
    }

    const previousProfile = { ...profile };
    const updates = {};
    const auditDetails = {};

    if (name) {
      updates.name = name;
      auditDetails.previous_name = previousProfile.name;
      auditDetails.new_name = name;
    }

    if (status) {
      if (status !== 'active' && status !== 'disabled') {
        return res.status(400).json({
          success: false,
          message: 'Invalid status value. Must be active or disabled.',
          errorCode: 'INVALID_STATUS'
        });
      }
      updates.status = status;
      auditDetails.previous_status = previousProfile.status;
      auditDetails.new_status = status;
    }

    // 2. Perform database profile update
    let updatedProfile = profile;
    if (Object.keys(updates).length > 0) {
      const { data, error: updateErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      updatedProfile = data;
    }

    // 3. Reset password in Supabase Auth if provided
    if (password) {
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: password
      });

      if (resetErr) {
        return res.status(400).json({
          success: false,
          message: `Failed to update password: ${resetErr.message}`,
          errorCode: 'PASSWORD_RESET_FAILED'
        });
      }
      auditDetails.password_reset = true;
    }

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      category: 'admin_edit',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'update_staff',
      target_id: profile.username,
      details: auditDetails,
      ip_address: ipAddress
    });

    return res.json({
      success: true,
      message: 'Staff account updated successfully.',
      data: {
        id: updatedProfile.id,
        name: updatedProfile.name,
        username: updatedProfile.username,
        role: updatedProfile.role,
        status: updatedProfile.status,
        created_at: updatedProfile.created_at
      }
    });

  } catch (error) {
    console.error('Staff update error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during staff modification.',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * DELETE /api/staff/:id
 * Deletes a staff member from both Auth and profile systems.
 * Admin only.
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  try {
    // 1. Fetch profile to confirm username for audit logging
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !profile) {
      return res.status(404).json({
        success: false,
        message: 'Staff profile not found.',
        errorCode: 'PROFILE_NOT_FOUND'
      });
    }

    // Protect deletion of administrator profiles
    if (profile.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot delete administrator accounts.',
        errorCode: 'ADMIN_PROTECTED'
      });
    }

    // 2. Delete auth user (will cascade delete the profile record via schema foreign key ON DELETE CASCADE)
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteErr) {
      return res.status(400).json({
        success: false,
        message: `Auth deletion failed: ${deleteErr.message}`,
        errorCode: 'AUTH_DELETION_FAILED'
      });
    }

    // 3. Audit Log
    await supabase.from('audit_logs').insert({
      category: 'admin_edit',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'delete_staff',
      target_id: profile.username,
      details: { deleted_name: profile.name, deleted_username: profile.username },
      ip_address: ipAddress
    });

    return res.json({
      success: true,
      message: 'Staff account deleted successfully.',
      data: { id }
    });

  } catch (error) {
    console.error('Staff deletion error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during staff deletion.',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
