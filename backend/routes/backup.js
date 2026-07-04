import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/backup/export
 * Exports a snapshot of the database tables as a JSON payload.
 * Admin only.
 */
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Fetch all tables
    const { data: eventSettings } = await supabase.from('event_settings').select('*');
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: qrCodes } = await supabase.from('qr_codes').select('*');
    const { data: scanHistory } = await supabase.from('scan_history').select('*');
    const { data: auditLogs } = await supabase.from('audit_logs').select('*');

    const backupPayload = {
      exported_at: new Date().toISOString(),
      exported_by: req.user.username,
      database: {
        event_settings: eventSettings || [],
        profiles: profiles || [],
        qr_codes: qrCodes || [],
        scan_history: scanHistory || [],
        audit_logs: auditLogs || []
      }
    };

    res.setHeader('Content-disposition', `attachment; filename=event_backup_${Date.now()}.json`);
    res.setHeader('Content-type', 'application/json');
    return res.send(JSON.stringify(backupPayload, null, 2));

  } catch (error) {
    console.error('Backup export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate database backup.',
      errorCode: 'BACKUP_FAILED'
    });
  }
});

/**
 * POST /api/backup/import
 * Restores a snapshot of the database from a backup JSON payload.
 * Admin only.
 */
router.post('/import', authenticateToken, requireAdmin, async (req, res) => {
  const { backupData } = req.body;

  if (!backupData || !backupData.database) {
    return res.status(400).json({
      success: false,
      message: 'Invalid backup file or missing database keys.',
      errorCode: 'INVALID_BACKUP_FORMAT'
    });
  }

  const { event_settings, profiles, qr_codes, scan_history, audit_logs } = backupData.database;

  try {
    // 1. Clear database tables in reverse order of foreign key dependency
    await supabase.from('scan_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('qr_codes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear staff profiles but PRESERVE the current administrator profile to prevent lockout
    await supabase.from('profiles').delete().neq('id', req.user.id);
    await supabase.from('event_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Re-insert Event Settings
    if (event_settings && event_settings.length > 0) {
      const { error: err } = await supabase.from('event_settings').insert(event_settings);
      if (err) throw new Error(`Event Settings restore failed: ${err.message}`);
    }

    // 3. Re-insert Profiles (filtering out the active admin profile since we preserved it)
    if (profiles && profiles.length > 0) {
      const otherProfiles = profiles.filter(p => p.id !== req.user.id);
      if (otherProfiles.length > 0) {
        const { error: err } = await supabase.from('profiles').insert(otherProfiles);
        if (err) throw new Error(`Profiles restore failed: ${err.message}`);
      }
    }

    // 4. Re-insert QR codes
    if (qr_codes && qr_codes.length > 0) {
      const { error: err } = await supabase.from('qr_codes').insert(qr_codes);
      if (err) throw new Error(`QR Codes restore failed: ${err.message}`);
    }

    // 5. Re-insert Scan History
    if (scan_history && scan_history.length > 0) {
      const { error: err } = await supabase.from('scan_history').insert(scan_history);
      if (err) throw new Error(`Scan History restore failed: ${err.message}`);
    }

    // 6. Re-insert Audit Logs
    if (audit_logs && audit_logs.length > 0) {
      const { error: err } = await supabase.from('audit_logs').insert(audit_logs);
      if (err) throw new Error(`Audit Logs restore failed: ${err.message}`);
    }

    // Write a fresh audit log entry for the restoration event
    await supabase.from('audit_logs').insert({
      category: 'config_change',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'database_restore',
      target_id: backupData.exported_by || 'unknown',
      details: { restored_at: new Date().toISOString() }
    });

    return res.json({
      success: true,
      message: 'System backup restored successfully. Database state updated.',
      data: {
        records_restored: {
          event_settings: event_settings?.length || 0,
          profiles: profiles?.length || 0,
          qr_codes: qr_codes?.length || 0,
          scan_history: scan_history?.length || 0,
          audit_logs: audit_logs?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('Backup restore error:', error);
    return res.status(500).json({
      success: false,
      message: `Database restoration failed: ${error.message}`,
      errorCode: 'RESTORE_FAILED'
    });
  }
});

export default router;
