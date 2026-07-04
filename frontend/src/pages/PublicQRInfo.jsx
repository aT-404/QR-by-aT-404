import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';
import {
  QrCode, Calendar, MapPin, Phone, AlertTriangle, AlertOctagon, Info,
  CheckCircle, Plus, Minus, RotateCcw, Ban, Edit2, ShieldAlert,
  Loader, ExternalLink, ArrowLeft, Clock, Clock3, AlertCircle, FileText
} from 'lucide-react';

export default function PublicQRInfo() {
  const { token } = useParams();
  const { user, getAuthHeaders, API_URL } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // Contains qr, event, role, scanHistory
  
  // UI Modification states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { action, paramVal }
  const [actionError, setActionError] = useState('');

  // Description edit state
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [newDesc, setNewDesc] = useState('');

  // Max usage edit state
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [newMax, setNewMax] = useState(1);

  // Client-side cooldown (2-3 seconds)
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    fetchQRDetails();
  }, [token]);

  const fetchQRDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = {};
      const savedToken = localStorage.getItem('qr_platform_token');
      if (savedToken) {
        headers['Authorization'] = `Bearer ${savedToken}`;
      }

      const res = await fetch(`${API_URL}/qr/lookup/${token}`, { headers });
      const json = await res.json();

      if (!json.success) {
        setError(json.message || 'Failed to retrieve QR details.');
      } else {
        setData(json.data);
        setNewDesc(json.data.qr.description || '');
        setNewMax(json.data.qr.max_usage || 1);
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to the lookup server.');
    } finally {
      setLoading(false);
    }
  };

  // Staff Action: Mark Used
  const handleMarkUsed = async () => {
    if (cooldown) return;
    setCooldown(true);
    setIsSubmitting(true);
    setActionError('');

    // Start 3-second cooldown to avoid jitter double-taps
    setTimeout(() => setCooldown(false), 3000);

    try {
      const res = await fetch(`${API_URL}/qr/scan/${token}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ deviceInfo: navigator.userAgent })
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Failed to increment usage.');
      } else {
        // Trigger celebratory confetti
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Refresh details
        await fetchQRDetails();
      }
    } catch (err) {
      setActionError('Network error. Check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin Actions
  const triggerAdminAction = (action, paramVal = '') => {
    const destructiveActions = ['reset', 'change_max', 'toggle_disable'];
    
    if (destructiveActions.includes(action)) {
      setPendingAction({ action, paramVal });
      setReauthPassword('');
      setActionError('');
      setShowPasswordModal(true);
    } else {
      executeAdminAction(action, paramVal);
    }
  };

  const executeAdminAction = async (action, paramVal = '', confirmPassword = '') => {
    setIsSubmitting(true);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/qr/admin/action`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          qrId: data.qr.qr_id,
          action,
          paramVal: String(paramVal),
          confirmPassword
        })
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Admin action failed.');
      } else {
        setIsEditingDesc(false);
        setIsEditingMax(false);
        setShowPasswordModal(false);
        setPendingAction(null);
        await fetchQRDetails();
      }
    } catch (err) {
      setActionError('Network error executing admin command.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordConfirm = (e) => {
    e.preventDefault();
    if (!reauthPassword) {
      setActionError('Password is required.');
      return;
    }
    executeAdminAction(pendingAction.action, pendingAction.paramVal, reauthPassword);
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    const configs = {
      'Unused': 'bg-green-500/10 text-green-400 border-green-500/20',
      'Partially Used': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'Fully Used': 'bg-red-500/10 text-red-400 border-red-500/20',
      'Disabled': 'bg-dark-700/30 text-dark-500 border-dark-800'
    };
    return (
      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${configs[status] || configs['Disabled']}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-dark-950 p-4">
        <Loader className="h-10 w-10 text-primary-500 animate-spin mb-4" />
        <p className="text-dark-400 text-sm">Querying secure QR database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
        <div className="max-w-md w-full glass-card p-8 border-red-500/10 text-center">
          <div className="inline-flex bg-red-500/10 p-3 rounded-full text-red-500 mb-4">
            <AlertOctagon className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-display text-white mb-2">Invalid Lookup</h2>
          <p className="text-dark-400 text-sm mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')} 
            className="btn-secondary w-full"
          >
            <ArrowLeft className="h-5 w-5" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { qr, event, role, scanHistory } = data;
  const isStaff = role === 'staff';
  const isAdmin = role === 'admin';
  const isPublic = role === 'public';

  const isLimitReached = qr.current_usage >= qr.max_usage;

  return (
    <div className="min-h-screen bg-dark-950 py-8 px-4 flex flex-col items-center relative">
      {/* Dynamic Background */}
      <div className="absolute top-0 inset-x-0 h-80 bg-gradient-to-b from-primary-600/5 to-transparent pointer-events-none -z-10"></div>

      <div className="w-full max-w-4xl space-y-6">
        
        {/* Navigation back when logged in */}
        {!isPublic && (
          <div className="flex justify-between items-center no-print">
            <button 
              onClick={() => navigate(isAdmin ? '/admin/qr' : '/staff/scanner')}
              className="flex items-center gap-2 text-dark-400 hover:text-dark-200 transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back to {isAdmin ? 'QR List' : 'Scanner'}
            </button>
            <span className="text-xs text-dark-500 font-mono">Secure Token Verified</span>
          </div>
        )}

        {/* Global Error Banner */}
        {actionError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-2xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Operation Error</span>
              <p>{actionError}</p>
            </div>
          </div>
        )}

        {/* ==========================================
            1. Unified Header Banner (All Roles)
           ========================================== */}
        <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-widest text-primary-400 font-bold bg-primary-950/40 border border-primary-800/40 px-2.5 py-1 rounded">
                Event Pass
              </span>
              {getStatusBadge(qr.status)}
            </div>
            
            <h1 className="text-2xl md:text-3xl font-display text-white">{event.event_name}</h1>
            
            {/* Event Meta Grid */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-dark-400">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-dark-500" /> {new Date(event.event_date).toLocaleDateString()}</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-dark-500" /> {event.venue}</span>
            </div>
          </div>

          <div className="text-right w-full md:w-auto border-t md:border-t-0 border-dark-800 pt-4 md:pt-0">
            <div className="text-xs text-dark-500 font-mono uppercase">Ticket Ref</div>
            <div className="text-2xl font-mono font-bold text-white tracking-tight">{qr.qr_id}</div>
            <div className="text-sm font-semibold text-dark-300 mt-1">
              Usage: <span className="text-white font-bold">{qr.current_usage}</span> / {qr.max_usage}
            </div>
          </div>
        </div>

        {/* ==========================================
            2. Operational Card: Staff Actions
           ========================================== */}
        {isStaff && (
          <div className="glass-card p-8 border-primary-500/10 text-center space-y-6">
            <div className="max-w-md mx-auto space-y-4">
              <div className="inline-flex bg-primary-600/10 p-4 rounded-full text-primary-500 animate-pulse-slow">
                <QrCode className="h-12 w-12" />
              </div>
              <h2 className="text-2xl font-display text-white">Staff Verification Portal</h2>
              <p className="text-dark-400 text-sm">
                Press the check-in button to increment usage by exactly one. Verify the attendee matches the ticket configuration.
              </p>
            </div>

            {/* Check-in Progress Tracker */}
            <div className="max-w-md mx-auto bg-dark-950 p-4 rounded-xl border border-dark-800 flex justify-around">
              <div>
                <span className="text-[10px] uppercase font-bold text-dark-500 tracking-wider block">Current Usage</span>
                <span className="text-2xl font-bold text-white">{qr.current_usage}</span>
              </div>
              <div className="border-r border-dark-800"></div>
              <div>
                <span className="text-[10px] uppercase font-bold text-dark-500 tracking-wider block">Remaining Uses</span>
                <span className={`text-2xl font-bold ${isLimitReached ? 'text-red-400' : 'text-green-400'}`}>
                  {Math.max(0, qr.max_usage - qr.current_usage)}
                </span>
              </div>
              <div className="border-r border-dark-800"></div>
              <div>
                <span className="text-[10px] uppercase font-bold text-dark-500 tracking-wider block">Maximum Allowed</span>
                <span className="text-2xl font-bold text-white">{qr.max_usage}</span>
              </div>
            </div>

            <div className="max-w-md mx-auto">
              {isLimitReached || qr.status === 'Disabled' ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 font-bold rounded-2xl flex items-center justify-center gap-2">
                  <Ban className="h-5 w-5" />
                  {qr.status === 'Disabled' ? 'Ticket is Disabled' : 'Usage Limit Reached'}
                </div>
              ) : (
                <button
                  onClick={handleMarkUsed}
                  disabled={isSubmitting || cooldown}
                  className={`btn-primary w-full py-4 text-lg font-bold shadow-lg shadow-primary-500/20 ${cooldown ? 'opacity-80' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      <span>Recording check-in...</span>
                    </>
                  ) : cooldown ? (
                    'Cooldown Lock...'
                  ) : (
                    'Confirm check-in / Mark Used'
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            3. Operational Grid: Admin Dashboard
           ========================================== */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Quick Adjustments panel */}
            <div className="glass-card p-6 space-y-6 lg:col-span-2">
              <h2 className="text-xl font-display text-white flex items-center gap-2">
                Admin Controls
              </h2>

              {/* Grid of operational buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Increase usage (Non-destructive) */}
                <div className="p-4 bg-dark-950 rounded-xl border border-dark-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">Manual Add scan</span>
                    <p className="text-xs text-dark-500">Increments current usage +1. Does not require password confirmation.</p>
                  </div>
                  <button
                    onClick={() => triggerAdminAction('increase')}
                    disabled={isSubmitting || isLimitReached || qr.status === 'Disabled'}
                    className="btn-primary w-full py-2 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Increment +1
                  </button>
                </div>

                {/* Decrease usage (Non-destructive) */}
                <div className="p-4 bg-dark-950 rounded-xl border border-dark-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">Decrement scan</span>
                    <p className="text-xs text-dark-500">Decrements usage by 1. Allowed only for administrators.</p>
                  </div>
                  <button
                    onClick={() => triggerAdminAction('decrease')}
                    disabled={isSubmitting || qr.current_usage <= 0}
                    className="btn-secondary w-full py-2 text-xs"
                  >
                    <Minus className="h-3.5 w-3.5" /> Decrement -1
                  </button>
                </div>

                {/* Reset usage (Destructive) */}
                <div className="p-4 bg-dark-950 rounded-xl border border-dark-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="text-sm font-semibold text-red-400">Reset Usage Count</span>
                    <p className="text-xs text-dark-500">Completely clears usage back to 0. Requires password validation.</p>
                  </div>
                  <button
                    onClick={() => triggerAdminAction('reset')}
                    disabled={isSubmitting || qr.current_usage === 0}
                    className="btn-danger w-full py-2 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset to 0
                  </button>
                </div>

                {/* Disable / Enable (Destructive) */}
                <div className="p-4 bg-dark-950 rounded-xl border border-dark-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">Toggle Disable State</span>
                    <p className="text-xs text-dark-500">Block scanner checks. Re-enabling recalculates status.</p>
                  </div>
                  <button
                    onClick={() => triggerAdminAction('toggle_disable')}
                    disabled={isSubmitting}
                    className={`w-full py-2 text-xs rounded-xl font-medium flex items-center justify-center gap-2 border transition-all duration-250 ${
                      qr.status === 'Disabled'
                        ? 'bg-green-600/20 text-green-400 border-green-500/20 hover:bg-green-600/30'
                        : 'bg-red-600/20 text-red-400 border-red-500/20 hover:bg-red-600/30'
                    }`}
                  >
                    <Ban className="h-3.5 w-3.5" /> {qr.status === 'Disabled' ? 'Re-Enable QR' : 'Disable QR'}
                  </button>
                </div>
              </div>

              {/* Set Max Limit & Edit Description Fields */}
              <div className="border-t border-dark-800 pt-6 space-y-4">
                
                {/* Max Usage Adjust */}
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                  <div className="flex-1">
                    <label className="form-label">Update maximum limit</label>
                    <input
                      type="number"
                      min={qr.current_usage}
                      className="form-input py-2 text-sm"
                      value={newMax}
                      onChange={(e) => setNewMax(parseInt(e.target.value) || 0)}
                      disabled={isSubmitting || !isEditingMax}
                    />
                  </div>
                  {isEditingMax ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => triggerAdminAction('change_max', newMax)}
                        className="btn-primary py-2 text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setIsEditingMax(false); setNewMax(qr.max_usage); }}
                        className="btn-secondary py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingMax(true)}
                      className="btn-secondary py-2 text-xs shrink-0"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Change Limit
                    </button>
                  )}
                </div>

                {/* Description Adjust */}
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                  <div className="flex-1">
                    <label className="form-label">Ticket / QR Description</label>
                    <input
                      type="text"
                      className="form-input py-2 text-sm"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      disabled={isSubmitting || !isEditingDesc}
                    />
                  </div>
                  {isEditingDesc ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => triggerAdminAction('edit_desc', newDesc)}
                        className="btn-primary py-2 text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setIsEditingDesc(false); setNewDesc(qr.description || ''); }}
                        className="btn-secondary py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="btn-secondary py-2 text-xs shrink-0"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit Description
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Logs Sidebar */}
            <div className="glass-card p-6 flex flex-col max-h-[500px]">
              <h2 className="text-xl font-display text-white mb-4 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-dark-400" />
                Scan History
              </h2>
              
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
                {scanHistory && scanHistory.length > 0 ? (
                  scanHistory.map((log) => (
                    <div key={log.id} className="p-3 bg-dark-950 rounded-xl border border-dark-800/80 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-primary-400 truncate max-w-[120px]">
                          {log.staff_name || 'System'}
                        </span>
                        <span className="text-dark-500 font-mono">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-dark-300">
                        Usage update: <span className="font-bold text-white">{log.previous_usage}</span> &rarr; <span className="font-bold text-white">{log.new_usage}</span>
                      </p>
                      <div className="text-[10px] text-dark-500 flex items-center justify-between font-mono">
                        <span className="truncate max-w-[110px]" title={log.device_info}>
                          {log.device_info?.includes('Windows') ? 'Windows' : log.device_info?.includes('Android') ? 'Android' : log.device_info?.includes('iPhone') ? 'iOS' : 'Web Device'}
                        </span>
                        <span>IP: {log.ip_address}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-dark-500 py-12">
                    <Clock className="h-8 w-8 text-dark-600 mb-2" />
                    <p className="text-xs">No scan history recorded yet.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            4. Public Information Dashboard & Widgets
           ========================================== */}
        {isPublic && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="glass-card p-6 md:p-8 md:col-span-2 space-y-6">
              <div>
                <h2 className="text-xl font-display text-white mb-2 flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary-400" />
                  Ticket Details
                </h2>
                <div className="bg-dark-950 p-4 rounded-2xl border border-dark-800 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Reference:</span>
                    <span className="font-mono text-white font-bold">{qr.qr_id}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-dark-900 pt-2">
                    <span className="text-dark-400">Current Usage:</span>
                    <span className="text-white font-bold">{qr.current_usage} uses</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-dark-900 pt-2">
                    <span className="text-dark-400">Max Usage Limit:</span>
                    <span className="text-white font-bold">{qr.max_usage} uses max</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-dark-900 pt-2">
                    <span className="text-dark-400">Ticket Status:</span>
                    {getStatusBadge(qr.status)}
                  </div>
                </div>
              </div>

              {qr.description && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-dark-400 mb-2">Description / Notes</h3>
                  <p className="text-sm text-dark-200 bg-dark-950 p-4 rounded-xl border border-dark-800 leading-relaxed">
                    {qr.description}
                  </p>
                </div>
              )}

              {/* Placeholder customizable widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-dark-800 pt-6">
                {/* Schedule Widget */}
                <div className="p-4 bg-dark-900/40 rounded-xl border border-dark-800 space-y-2">
                  <span className="text-xs font-bold uppercase text-primary-400 tracking-wider">Schedule</span>
                  <div className="text-xs space-y-1 text-dark-300">
                    <div className="flex justify-between"><span>09:00 AM</span><span className="text-white">Gates Open</span></div>
                    <div className="flex justify-between"><span>10:30 AM</span><span className="text-white">Opening Keynote</span></div>
                    <div className="flex justify-between"><span>01:00 PM</span><span className="text-white">Lunch & Networking</span></div>
                  </div>
                </div>

                {/* Canteen / Sponsors Widget */}
                <div className="p-4 bg-dark-900/40 rounded-xl border border-dark-800 space-y-2">
                  <span className="text-xs font-bold uppercase text-primary-400 tracking-wider">Announcements</span>
                  <p className="text-xs text-dark-300 leading-normal">
                    📢 Food counters are active at Floor 1. Please keep your QR codes open for scans.
                  </p>
                </div>
              </div>
            </div>

            {/* Sidebar Contact & Map widgets */}
            <div className="space-y-6">
              
              {/* Emergency info widget */}
              <div className="glass-card p-6 border-red-500/10 space-y-4">
                <h3 className="text-sm font-display text-white flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
                  Emergency & Support
                </h3>
                <p className="text-xs text-dark-400 leading-normal">
                  Need assistance or experiencing scanning errors? Visit the central helpdesk or call coordinators.
                </p>
                <div className="space-y-2">
                  <a href={`tel:${event.contact_details}`} className="flex items-center gap-2 text-xs text-primary-400 hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {event.contact_details}
                  </a>
                </div>
              </div>

              {/* Map/Location Widget */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-display text-white flex items-center gap-2">
                  <MapPin className="h-4.5 w-4.5 text-primary-400" />
                  Venue Information
                </h3>
                <div className="h-32 bg-dark-950 border border-dark-850 rounded-xl flex items-center justify-center text-center p-4">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-white block">{event.venue}</span>
                    <span className="text-[10px] text-dark-500 block">Interactive Map Coming Soon</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          5. Administrator Re-Auth Pass Modal
         ========================================== */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="glass-card max-w-md w-full p-6 border-primary-500/20 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <ShieldAlert className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-display text-white font-bold">Identity Re-verification</h3>
            </div>
            
            <p className="text-sm text-dark-400 mb-6">
              You are performing a sensitive modification (<span className="text-white font-semibold font-mono">{pendingAction?.action}</span>). 
              Please re-enter your administrator password to proceed.
            </p>

            <form onSubmit={handlePasswordConfirm} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="reauth-pass">Admin Password</label>
                <input
                  id="reauth-pass"
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setShowPasswordModal(false); setPendingAction(null); }}
                  className="btn-secondary py-2 text-xs"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2 text-xs bg-red-600 hover:bg-red-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Confirming...' : 'Verify Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
