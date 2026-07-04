import express from 'express';
import { stringify } from 'csv-stringify';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/reports/dashboard
 * Aggregates all realtime dashboard analytics.
 * Admin only.
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 1. Fetch QR code counts and status groups
    const { data: qrs, error: qrErr } = await supabase
      .from('qr_codes')
      .select('status, current_usage, max_usage');

    if (qrErr) throw qrErr;

    let totalQrs = qrs.length;
    let unused = 0;
    let partiallyUsed = 0;
    let fullyUsed = 0;
    let disabled = 0;
    let totalPossibleUses = 0;
    let currentTotalUses = 0;

    qrs.forEach(qr => {
      if (qr.status === 'Unused') unused++;
      else if (qr.status === 'Partially Used') partiallyUsed++;
      else if (qr.status === 'Fully Used') fullyUsed++;
      else if (qr.status === 'Disabled') disabled++;

      if (qr.status !== 'Disabled') {
        totalPossibleUses += qr.max_usage;
        currentTotalUses += qr.current_usage;
      }
    });

    // 2. Fetch Scan Count statistics
    const { count: totalScans, error: scanErr } = await supabase
      .from('scan_history')
      .select('*', { count: 'exact', head: true });

    if (scanErr) throw scanErr;

    // 3. Fetch Today's Scans
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count: todayScans, error: todayErr } = await supabase
      .from('scan_history')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfToday.toISOString());

    if (todayErr) throw todayErr;

    // 4. Fetch Active Staff Count
    const { count: activeStaff, error: staffErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'staff')
      .eq('status', 'active');

    if (staffErr) throw staffErr;

    // 5. Fetch Recent Activities (Combines Scan History and Audit Logs)
    const { data: recentScans } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: recentAudits } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const activityFeed = [];

    if (recentScans) {
      recentScans.forEach(scan => {
        activityFeed.push({
          type: 'scan',
          timestamp: scan.created_at,
          actor: scan.staff_name || 'System',
          message: `Scanned and marked QR ${scan.qr_id} (Usage: ${scan.new_usage}/${scan.previous_usage + (scan.new_usage - scan.previous_usage)})`,
          details: { qr_id: scan.qr_id, new_usage: scan.new_usage, device: scan.device_info }
        });
      });
    }

    if (recentAudits) {
      recentAudits.forEach(audit => {
        activityFeed.push({
          type: 'audit',
          timestamp: audit.created_at,
          actor: audit.actor_name || 'Admin',
          message: `Admin modified ${audit.target_id || 'system'}: action '${audit.action}'`,
          details: audit.details
        });
      });
    }

    // Sort combined feed descending by timestamp
    activityFeed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentActivities = activityFeed.slice(0, 15);

    // 6. Fetch Staff Leaderboard (agg. scan count)
    const { data: leaderboardData, error: leaderErr } = await supabase
      .from('profiles')
      .select('name, username, scan_history(count)')
      .eq('role', 'staff');

    if (leaderErr) throw leaderErr;

    const staffLeaderboard = leaderboardData
      .map(member => ({
        name: member.name,
        username: member.username,
        scans: member.scan_history && member.scan_history[0] ? member.scan_history[0].count : 0
      }))
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10);

    // 7. Most frequently scanned QR codes
    const { data: freqQrs, error: freqErr } = await supabase
      .from('qr_codes')
      .select('qr_id, current_usage, max_usage, status')
      .gt('current_usage', 0)
      .order('current_usage', { ascending: false })
      .limit(5);

    if (freqErr) throw freqErr;

    return res.json({
      success: true,
      message: 'Dashboard metrics calculated successfully.',
      data: {
        cards: {
          totalQrs,
          unused,
          partiallyUsed,
          fullyUsed,
          disabled,
          totalScans: totalScans || 0,
          todayScans: todayScans || 0,
          activeStaff: activeStaff || 0
        },
        progress: {
          current: currentTotalUses,
          total: totalPossibleUses,
          percentage: totalPossibleUses > 0 ? Math.round((currentTotalUses / totalPossibleUses) * 100) : 0
        },
        recentActivities,
        staffLeaderboard,
        mostScannedQrs: freqQrs || []
      }
    });

  } catch (error) {
    console.error('Error generating dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard analytics.',
      errorCode: 'ANALYTICS_FAILED'
    });
  }
});

/**
 * GET /api/reports/export
 * Exports various audits or database tables as CSV files.
 * Admin only.
 */
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
  const { type } = req.query; // 'qr_summary', 'scan_history', 'staff_activity', 'audit_logs'

  if (!type || !['qr_summary', 'scan_history', 'staff_activity', 'audit_logs'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'A valid export type is required.',
      errorCode: 'INVALID_EXPORT_TYPE'
    });
  }

  try {
    let headers = [];
    let rows = [];

    if (type === 'qr_summary') {
      const { data: qrs } = await supabase
        .from('qr_codes')
        .select('qr_id, current_usage, max_usage, status, description, created_at, last_scanned_at')
        .order('qr_id', { ascending: true });

      headers = ['QR ID', 'Current Usage', 'Max Usage', 'Status', 'Description', 'Created Date', 'Last Scanned'];
      rows = (qrs || []).map(q => [
        q.qr_id,
        q.current_usage,
        q.max_usage,
        q.status,
        q.description || '',
        q.created_at,
        q.last_scanned_at || 'Never'
      ]);

    } else if (type === 'scan_history') {
      const { data: scans } = await supabase
        .from('scan_history')
        .select('created_at, qr_id, staff_name, previous_usage, new_usage, device_info, ip_address')
        .order('created_at', { ascending: false });

      headers = ['Timestamp', 'QR ID', 'Scanned By (Staff)', 'Previous Usage', 'New Usage', 'Device Info', 'IP Address'];
      rows = (scans || []).map(s => [
        s.created_at,
        s.qr_id,
        s.staff_name || 'System/Admin',
        s.previous_usage,
        s.new_usage,
        s.device_info || 'Unknown',
        s.ip_address || 'Unknown'
      ]);

    } else if (type === 'staff_activity') {
      const { data: staff } = await supabase
        .from('profiles')
        .select('name, username, status, created_at, last_login_at, scan_history(count)')
        .eq('role', 'staff')
        .order('name', { ascending: true });

      headers = ['Staff Name', 'Username', 'Status', 'Created Date', 'Last Login', 'Total Scans'];
      rows = (staff || []).map(s => [
        s.name,
        s.username,
        s.status,
        s.created_at,
        s.last_login_at || 'Never',
        s.scan_history && s.scan_history[0] ? s.scan_history[0].count : 0
      ]);

    } else if (type === 'audit_logs') {
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('created_at, category, actor_name, action, target_id, details, ip_address, device_info')
        .order('created_at', { ascending: false });

      headers = ['Timestamp', 'Category', 'Actor Name', 'Action Executed', 'Target Item', 'Action Details', 'IP Address', 'Device'];
      rows = (logs || []).map(l => [
        l.created_at,
        l.category,
        l.actor_name || 'System',
        l.action,
        l.target_id || '',
        JSON.stringify(l.details || {}),
        l.ip_address || '',
        l.device_info || ''
      ]);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=export_${type}_${Date.now()}.csv`);

    // Stream the CSV back to the client using csv-stringify
    const stringifier = stringify({ header: true, columns: headers });
    stringifier.pipe(res);

    rows.forEach(row => {
      stringifier.write(row);
    });

    stringifier.end();

  } catch (error) {
    console.error('CSV Export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate CSV export.',
      errorCode: 'EXPORT_FAILED'
    });
  }
});

export default router;
