import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';
import {
  QrCode, Users, Activity, BarChart2, TrendingUp, Sparkles,
  CheckCircle2, Clock, ShieldAlert, Award, FileText, Download,
  Loader, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function AdminDashboard() {
  const { getAuthHeaders, API_URL } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchDashboardData();

    // Setup Supabase Realtime subscription if variables are available
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project-id.supabase.co') {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey);
        
        // Listen to any scan increments or admin edits
        const channel = client
          .channel('realtime-dashboard')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_history' }, () => {
            fetchDashboardData(false); // quiet refresh
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
            fetchDashboardData(false);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_codes' }, () => {
            fetchDashboardData(false);
          })
          .subscribe();

        return () => {
          client.removeChannel(channel);
        };
      } catch (err) {
        console.warn('Realtime registration error:', err);
      }
    }
  }, []);

  const fetchDashboardData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/reports/dashboard`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to fetch dashboard metrics.');
      } else {
        setData(json.data);
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to the backend reporting APIs.');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const getRelativeTime = (isoString) => {
    try {
      const diff = Date.now() - new Date(isoString).getTime();
      const secs = Math.floor(diff / 1000);
      const mins = Math.floor(secs / 60);
      const hours = Math.floor(mins / 60);

      if (secs < 60) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return new Date(isoString).toLocaleDateString();
    } catch (e) {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center">
        <Loader className="h-10 w-10 text-primary-500 animate-spin mb-4" />
        <p className="text-dark-400 text-sm">Assembling live analytics feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 shrink-0" />
        <div>
          <span className="font-bold block">Dashboard Load Error</span>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const { cards, progress, recentActivities, staffLeaderboard, mostScannedQrs } = data;

  return (
    <div className="space-y-6">
      
      {/* Title & Refreshes */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display text-white">Event Dashboard</h1>
          <p className="text-xs text-dark-400">Live platform metrics and staff check-in activity.</p>
        </div>
        <button
          onClick={() => fetchDashboardData(true)}
          className="btn-secondary py-2 text-xs self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Force Refresh
        </button>
      </div>

      {/* Progress usage Capacity Bar */}
      <div className="glass-card p-6 border-primary-500/10">
        <div className="flex justify-between items-center mb-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-dark-400">Overall Scan Capacity</span>
            <h3 className="text-lg font-display text-white">
              {progress.current} / {progress.total} Total check-ins recorded
            </h3>
          </div>
          <span className="text-2xl font-display font-extrabold text-primary-400">
            {progress.percentage}%
          </span>
        </div>
        
        {/* Progress tracks bar */}
        <div className="w-full bg-dark-950 h-3 rounded-full overflow-hidden border border-dark-850">
          <div 
            className="bg-gradient-to-r from-primary-600 to-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total scans */}
        <div className="glass-card p-5 space-y-2">
          <div className="flex justify-between items-center text-dark-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total scans</span>
            <TrendingUp className="h-5 w-5 text-green-400" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl md:text-3xl font-display font-bold text-white">{cards.totalScans}</div>
            <div className="text-[10px] text-dark-500 font-mono">Cumulative count</div>
          </div>
        </div>

        {/* Today's scans */}
        <div className="glass-card p-5 space-y-2">
          <div className="flex justify-between items-center text-dark-400">
            <span className="text-xs font-medium uppercase tracking-wider">Today's scans</span>
            <Activity className="h-5 w-5 text-primary-400" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl md:text-3xl font-display font-bold text-white">{cards.todayScans}</div>
            <div className="text-[10px] text-dark-500 font-mono">Since 12:00 AM</div>
          </div>
        </div>

        {/* Total QR codes */}
        <div className="glass-card p-5 space-y-2">
          <div className="flex justify-between items-center text-dark-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Passes</span>
            <QrCode className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl md:text-3xl font-display font-bold text-white">{cards.totalQrs}</div>
            <div className="text-[10px] text-dark-500 font-mono">QRs in registry</div>
          </div>
        </div>

        {/* Active Staff */}
        <div className="glass-card p-5 space-y-2">
          <div className="flex justify-between items-center text-dark-400">
            <span className="text-xs font-medium uppercase tracking-wider">Active Staff</span>
            <Users className="h-5 w-5 text-amber-400" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl md:text-3xl font-display font-bold text-white">{cards.activeStaff}</div>
            <div className="text-[10px] text-dark-500 font-mono">Devices connected</div>
          </div>
        </div>
      </div>

      {/* QR Code Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-dark-900/30 rounded-2xl border border-dark-800/40">
        <div className="text-center py-2">
          <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest block mb-1">Unused QRs</span>
          <span className="text-xl font-bold text-white">{cards.unused}</span>
        </div>
        <div className="text-center py-2 border-l border-dark-850">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block mb-1">Partially Used</span>
          <span className="text-xl font-bold text-white">{cards.partiallyUsed}</span>
        </div>
        <div className="text-center py-2 border-l border-dark-850">
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest block mb-1">Fully Used</span>
          <span className="text-xl font-bold text-white">{cards.fullyUsed}</span>
        </div>
        <div className="text-center py-2 border-l border-dark-850">
          <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest block mb-1">Disabled QRs</span>
          <span className="text-xl font-bold text-white">{cards.disabled}</span>
        </div>
      </div>

      {/* Leaderboards, Scans, Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Real-time scan activity feed */}
        <div className="glass-card p-6 flex flex-col max-h-[520px] lg:col-span-2">
          <h2 className="text-lg font-display text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-dark-400" />
            Live Audit & Scan Activity Feed
          </h2>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
            {recentActivities && recentActivities.length > 0 ? (
              recentActivities.map((act, i) => (
                <div 
                  key={i} 
                  className={`p-3.5 rounded-xl border flex gap-3 items-start animate-fade-in ${
                    act.type === 'scan' 
                      ? 'bg-dark-950 border-dark-850' 
                      : 'bg-dark-900 border-primary-500/10'
                  }`}
                >
                  <div className={`p-2 rounded-full shrink-0 ${
                    act.type === 'scan' ? 'bg-primary-500/5 text-primary-400' : 'bg-amber-500/5 text-amber-400'
                  }`}>
                    {act.type === 'scan' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white truncate max-w-[150px]">{act.actor}</span>
                      <span className="text-dark-500 font-mono text-[10px] shrink-0">
                        {getRelativeTime(act.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-dark-300 leading-normal">{act.message}</p>
                    
                    {act.details?.device && (
                      <span className="text-[10px] font-mono text-dark-500 block truncate">
                        OS: {act.details.device.includes('Windows') ? 'Windows' : act.details.device.includes('iPhone') ? 'iOS' : 'Mobile'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-dark-500 py-12">
                <Activity className="h-8 w-8 text-dark-600 mb-2" />
                <p className="text-xs">Waiting for live events...</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar panels (Leaderboard and Most Scanned) */}
        <div className="space-y-6">
          
          {/* Leaderboard panel */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-display text-white mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              Staff Leaderboard
            </h2>

            <div className="space-y-3">
              {staffLeaderboard && staffLeaderboard.length > 0 ? (
                staffLeaderboard.map((member, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-dark-950 rounded-xl border border-dark-850">
                    <div className="truncate pr-3">
                      <span className="text-xs font-semibold text-white block truncate">{member.name}</span>
                      <span className="text-[10px] text-dark-500 font-mono">@{member.username}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-primary-400 font-mono">{member.scans} scans</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-dark-500 text-center py-6">No staff scans recorded.</p>
              )}
            </div>
          </div>

          {/* Frequently Scanned QRs panel */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-display text-white mb-4 flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-indigo-400" />
              Top Scanned Tickets
            </h2>

            <div className="space-y-3">
              {mostScannedQrs && mostScannedQrs.length > 0 ? (
                mostScannedQrs.map((item, i) => (
                  <div key={i} className="p-3 bg-dark-950 rounded-xl border border-dark-850 flex justify-between items-center">
                    <div className="truncate">
                      <span className="text-xs font-mono font-bold text-white block">{item.qr_id}</span>
                      <span className="text-[10px] text-dark-500">{item.status}</span>
                    </div>
                    <div className="text-xs font-semibold text-dark-300">
                      <span className="text-white font-bold">{item.current_usage}</span> / {item.max_usage} uses
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-dark-500 text-center py-6">No check-ins performed yet.</p>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
