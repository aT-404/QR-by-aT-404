import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Settings, Save, Download, Upload, AlertCircle, CheckCircle, Loader,
  Database, Calendar, MapPin, ShieldAlert, Sparkles, FileText, RefreshCw
} from 'lucide-react';

export default function AdminSettings() {
  const { event, getAuthHeaders, API_URL, refreshEvent } = useAuth();

  // Settings Form States
  const [eventName, setEventName] = useState(event?.event_name || '');
  const [qrPrefix, setQrPrefix] = useState(event?.qr_prefix || '');
  const [startingNumber, setStartingNumber] = useState(event?.starting_number || 1);
  const [defaultMaxUsage, setDefaultMaxUsage] = useState(event?.default_max_usage || 1);
  const [description, setDescription] = useState(event?.description || '');
  const [venue, setVenue] = useState(event?.venue || '');
  const [eventDate, setEventDate] = useState(event?.event_date ? event.event_date.split('T')[0] : '');
  const [contactDetails, setContactDetails] = useState(event?.contact_details || '');
  const [logoUrl, setLogoUrl] = useState(event?.logo_url || '');

  // Operation States
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Backup files selection
  const [backupFile, setBackupFile] = useState(null);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!eventName || !qrPrefix) {
      setErrorMsg('Event Name and QR Prefix are required.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_URL}/event`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          event_name: eventName,
          qr_prefix: qrPrefix,
          starting_number: parseInt(startingNumber) || 1,
          default_max_usage: parseInt(defaultMaxUsage) || 1,
          description,
          venue,
          event_date: eventDate ? new Date(eventDate).toISOString() : null,
          contact_details: contactDetails,
          logo_url: logoUrl
        })
      });

      const json = await res.json();

      if (!json.success) {
        setErrorMsg(json.message || 'Failed to update event settings.');
      } else {
        setSuccessMsg('Event configurations updated successfully!');
        await refreshEvent(); // refresh globally
      }
    } catch (err) {
      setErrorMsg('Connection error saving event settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Database Export
  const handleExportBackup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      window.open(`${API_URL}/backup/export?token=${localStorage.getItem('qr_platform_token')}`, '_blank');
      setSuccessMsg('Database snapshot backup triggered successfully.');
    } catch (err) {
      setErrorMsg('Failed to download database backup.');
    }
  };

  // Trigger Database Import
  const handleImportBackup = async (e) => {
    e.preventDefault();
    if (!backupFile) {
      setErrorMsg('Please select a valid backup JSON file first.');
      return;
    }

    const confirmAction = window.confirm(
      'WARNING: Restoring a database backup will clear all existing QR codes, scan logs, profiles, and event settings, replacement state with the backup. Do you want to proceed?'
    );
    if (!confirmAction) return;

    setIsRestoring(true);
    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target.result);

        const res = await fetch(`${API_URL}/backup/import`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ backupData })
        });

        const json = await res.json();

        if (!json.success) {
          setErrorMsg(json.message || 'Restoration failed.');
        } else {
          setSuccessMsg('System restored successfully! Database successfully re-seeded.');
          setBackupFile(null);
          await refreshEvent(); // refresh globally
        }
      } catch (err) {
        setErrorMsg('Invalid JSON format or restoration network failure.');
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(backupFile);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Title */}
      <div>
        <h1 className="text-3xl font-display text-white">Platform Settings</h1>
        <p className="text-xs text-dark-400">Configure global event parameters, database schemas, and system backups.</p>
      </div>

      {/* Global Alerts feedback */}
      {successMsg && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-200 text-sm rounded-2xl flex items-center gap-3 animate-slide-up">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-2xl flex items-center gap-3 animate-slide-up">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Event Configurations Form */}
        <div className="glass-card p-6 md:p-8 lg:col-span-2 space-y-6">
          <h2 className="text-xl font-display text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-400" />
            Event Settings
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Event Name */}
              <div>
                <label className="form-label" htmlFor="ev-name">Event Name</label>
                <input
                  id="ev-name"
                  type="text"
                  placeholder="e.g. JUBICON"
                  className="form-input text-sm py-2.5"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>

              {/* QR Prefix */}
              <div>
                <label className="form-label" htmlFor="ev-prefix">QR Code Prefix</label>
                <input
                  id="ev-prefix"
                  type="text"
                  placeholder="e.g. JUBICON"
                  className="form-input text-sm py-2.5 uppercase"
                  value={qrPrefix}
                  onChange={(e) => setQrPrefix(e.target.value)}
                  disabled={isSaving}
                  required
                />
                <span className="text-[9px] text-dark-500 mt-1 block">Prefix applied to new bulk scans (e.g. JUBICON-0001)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Starting Number */}
              <div>
                <label className="form-label" htmlFor="ev-start">Starting Number</label>
                <input
                  id="ev-start"
                  type="number"
                  min="1"
                  className="form-input text-sm py-2.5"
                  value={startingNumber}
                  onChange={(e) => setStartingNumber(e.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>

              {/* Default Max Uses */}
              <div>
                <label className="form-label" htmlFor="ev-max">Default Usage Limit</label>
                <input
                  id="ev-max"
                  type="number"
                  min="1"
                  className="form-input text-sm py-2.5"
                  value={defaultMaxUsage}
                  onChange={(e) => setDefaultMaxUsage(e.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Venue */}
              <div>
                <label className="form-label" htmlFor="ev-venue">Venue / Location</label>
                <input
                  id="ev-venue"
                  type="text"
                  placeholder="e.g. Main Hall"
                  className="form-input text-sm py-2.5"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              {/* Event Date */}
              <div>
                <label className="form-label" htmlFor="ev-date">Event Date</label>
                <input
                  id="ev-date"
                  type="date"
                  className="form-input text-sm py-2.5"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* Event Description */}
            <div>
              <label className="form-label" htmlFor="ev-desc">Event Description</label>
              <textarea
                id="ev-desc"
                placeholder="Details displayed on public lookups..."
                className="form-input text-sm py-2.5 h-24 resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
              />
            </div>

            {/* Contact details */}
            <div>
              <label className="form-label" htmlFor="ev-contact">Support Email / Coordinator Phone</label>
              <input
                id="ev-contact"
                type="text"
                placeholder="e.g. support@event.com"
                className="form-input text-sm py-2.5"
                value={contactDetails}
                onChange={(e) => setContactDetails(e.target.value)}
                disabled={isSaving}
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary py-2.5 px-6 shadow-lg shadow-primary-500/10"
              >
                {isSaving ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Event Settings</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Database Backup Recovery panel */}
        <div className="space-y-6">
          
          {/* Backup panel */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-display text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-400" />
              Backup & Recovery
            </h2>
            
            <p className="text-xs text-dark-400 leading-relaxed">
              Export the current registry database state (passes, checks, and audits) or restore the platform from an existing backup JSON file.
            </p>

            <div className="space-y-3.5 pt-2 border-t border-dark-800">
              
              {/* Export Panel */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-dark-500 block">Export Full System</span>
                <button
                  onClick={handleExportBackup}
                  className="btn-secondary w-full py-2.5 text-xs text-indigo-400 border-indigo-950/20 hover:bg-indigo-950/10"
                >
                  <Download className="h-4 w-4" /> Download Backup JSON
                </button>
              </div>

              {/* Import Panel */}
              <form onSubmit={handleImportBackup} className="space-y-2 pt-2 border-t border-dark-850">
                <span className="text-[10px] uppercase font-bold text-dark-500 block">Restore Database</span>
                
                <input
                  type="file"
                  accept=".json"
                  className="text-xs text-dark-400 block w-full file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-dark-800 file:text-dark-100 hover:file:bg-dark-700 file:cursor-pointer"
                  onChange={(e) => setBackupFile(e.target.files[0])}
                  disabled={isRestoring}
                />

                <button
                  type="submit"
                  disabled={isRestoring || !backupFile}
                  className="btn-primary w-full py-2.5 text-xs bg-red-650 hover:bg-red-500 shadow-md shadow-red-500/5 disabled:opacity-50"
                >
                  {isRestoring ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      <span>Restoring database...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Restore Snapshot</span>
                    </>
                  )}
                </button>
              </form>

            </div>
          </div>

          {/* Quick Stats Summary */}
          <div className="glass-card p-6 border-red-500/10">
            <h3 className="text-sm font-display text-white mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Destructive Controls
            </h3>
            <p className="text-xs text-dark-400 leading-normal mb-4">
              Warning: Modifying starting sequence counters or database profiles alters QR numbering rules.
            </p>
            <div className="text-[10px] text-dark-500 font-mono space-y-1.5">
              <div className="flex justify-between"><span>Registry lock:</span><span className="text-green-400 font-semibold">Active</span></div>
              <div className="flex justify-between"><span>Audit state:</span><span className="text-green-400 font-semibold">Active</span></div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
