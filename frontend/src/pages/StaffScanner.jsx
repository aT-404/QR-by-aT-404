import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import confetti from 'canvas-confetti';
import {
  QrCode, Camera, ShieldAlert, Sparkles, Loader, CheckCircle,
  AlertTriangle, Play, Pause, Search, RefreshCw, XCircle, Volume2, VolumeX
} from 'lucide-react';

export default function StaffScanner() {
  const { getAuthHeaders, API_URL } = useAuth();
  const navigate = useNavigate();

  // Scanner States
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Manual lookup input
  const [manualToken, setManualToken] = useState('');
  const [manualSearching, setManualSearching] = useState(false);

  // Active Scanned QR State (for manual confirm mode)
  const [activeQr, setActiveQr] = useState(null); // { qr, event }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text }

  // Cooldown & locking refs to prevent duplicate triggers
  const lastScannedTokenRef = useRef('');
  const scanLockRef = useRef(false);
  const html5QrcodeRef = useRef(null);

  // Sound effects
  const successAudioRef = useRef(null);
  const errorAudioRef = useRef(null);

  useEffect(() => {
    // Instantiate audio buffers (standard Web Audio API synthesized sounds so we don't need external file assets!)
    successAudioRef.current = createSynthAudio(600, 'sine', 0.15);
    errorAudioRef.current = createSynthAudio(200, 'sawtooth', 0.3);

    return () => {
      stopScanner();
    };
  }, []);

  // Synthesize instant alert/beep sounds dynamically in-browser
  const createSynthAudio = (frequency, type, duration) => {
    return () => {
      try {
        if (!soundEnabled) return;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        osc.type = type;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (err) {
        console.warn('Web Audio synthesis failed:', err);
      }
    };
  };

  const playSuccessSound = () => successAudioRef.current && successAudioRef.current();
  const playErrorSound = () => errorAudioRef.current && errorAudioRef.current();

  // Start the html5-qrcode scanner
  const startScanner = async () => {
    setStatusMsg(null);
    setActiveQr(null);
    setScannerActive(true);

    // Wait for the HTML container to render
    setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode('reader-canvas');
        html5QrcodeRef.current = html5Qrcode;

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        await html5Qrcode.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          onScanFailure
        );
        setCameraPermission(true);
      } catch (err) {
        console.error('Camera startup failed:', err);
        setCameraPermission(false);
        setScannerActive(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current = null;
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setScannerActive(false);
  };

  const onScanSuccess = async (decodedText) => {
    // 1. Check if scan lock is active
    if (scanLockRef.current) return;

    // 2. Parse token from URL. Format: .../q/<token>
    let tokenValue = decodedText;
    if (decodedText.includes('/q/')) {
      const parts = decodedText.split('/q/');
      tokenValue = parts[parts.length - 1].split('?')[0]; // strip query parameters if any
    }

    // 3. Apply scan cooldown check (ignore same token scanned twice within 3s)
    if (tokenValue === lastScannedTokenRef.current) {
      return;
    }

    scanLockRef.current = true;
    lastScannedTokenRef.current = tokenValue;
    
    // Set 3-second cooldown to clear the last scanned token ref
    setTimeout(() => {
      lastScannedTokenRef.current = '';
    }, 3000);

    // Stop camera feed to let UI show results
    await stopScanner();

    // Process token
    await processTokenScan(tokenValue);
  };

  const onScanFailure = () => {
    // Verbose camera errors can be ignored safely
  };

  // Main logic for processing a token
  const processTokenScan = async (tokenValue) => {
    setStatusMsg(null);
    setIsSubmitting(true);

    try {
      // 1. Look up the secure token details
      const res = await fetch(`${API_URL}/qr/lookup/${tokenValue}`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();

      if (!json.success) {
        playErrorSound();
        setStatusMsg({ type: 'error', text: json.message || 'Invalid ticket code.' });
        scanLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      const { qr, event } = json.data;

      // Check status checks
      if (qr.status === 'Disabled') {
        playErrorSound();
        setStatusMsg({ type: 'error', text: `Scan Denied: Ticket ${qr.qr_id} is disabled.` });
        scanLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (qr.current_usage >= qr.max_usage) {
        playErrorSound();
        setStatusMsg({ type: 'error', text: `Scan Denied: Limit reached (${qr.current_usage}/${qr.max_usage}).` });
        scanLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // If Auto-Confirm is enabled, immediately write the check-in
      if (autoConfirm) {
        const scanRes = await fetch(`${API_URL}/qr/scan/${tokenValue}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ deviceInfo: 'Camera Scanner (' + navigator.userAgent + ')' })
        });
        const scanJson = await scanRes.json();

        if (scanJson.success) {
          playSuccessSound();
          confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });
          
          setStatusMsg({
            type: 'success',
            text: `Checked-in: ${qr.qr_id} (Usage: ${scanJson.data.new_usage}/${scanJson.data.max_usage})`
          });
          
          // Auto-resume scanner after 2 seconds
          setTimeout(() => {
            scanLockRef.current = false;
            startScanner();
          }, 2000);
        } else {
          playErrorSound();
          setStatusMsg({ type: 'error', text: scanJson.message });
          scanLockRef.current = false;
        }
      } else {
        // Manual verification mode: display info and wait for staff button click
        playSuccessSound();
        setActiveQr({ qr, event, token: tokenValue });
      }

    } catch (err) {
      console.error(err);
      playErrorSound();
      setStatusMsg({ type: 'error', text: 'Network connection failure during lookup.' });
      scanLockRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Staff manual confirm action (for non-autoconfirm mode)
  const handleManualConfirm = async () => {
    if (!activeQr) return;
    setIsSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_URL}/qr/scan/${activeQr.token}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ deviceInfo: 'Camera Scanner (' + navigator.userAgent + ')' })
      });
      const json = await res.json();

      if (!json.success) {
        playErrorSound();
        setStatusMsg({ type: 'error', text: json.message || 'Check-in failed.' });
      } else {
        playSuccessSound();
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
        setStatusMsg({
          type: 'success',
          text: `Check-in recorded: ${activeQr.qr.qr_id} (${json.data.new_usage}/${json.data.max_usage})`
        });
        setActiveQr(null);
      }
    } catch (err) {
      playErrorSound();
      setStatusMsg({ type: 'error', text: 'Connection failed. Please check internet.' });
    } finally {
      setIsSubmitting(false);
      scanLockRef.current = false;
    }
  };

  // Manual alphanumeric token search
  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    await stopScanner();
    setManualSearching(true);
    
    // Lock scans
    scanLockRef.current = true;
    
    await processTokenScan(manualToken.trim());
    
    setManualSearching(false);
    setManualToken('');
  };

  const handleClearStatus = () => {
    setStatusMsg(null);
    scanLockRef.current = false;
    if (!activeQr) {
      startScanner();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Platform Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white">QR Scanning Terminal</h1>
          <p className="text-xs text-dark-400">Validate and record attendee check-ins in real-time.</p>
        </div>
        
        {/* sound / configurations toggle buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all duration-200 ${
              soundEnabled 
                ? 'bg-dark-800 border-dark-700 text-primary-400' 
                : 'bg-dark-900 border-dark-850 text-dark-500'
            }`}
            title={soundEnabled ? 'Mute Bleeps' : 'Unmute Bleeps'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Scanner Canvas */}
      <div className="glass-card p-6 border-primary-500/5 relative overflow-hidden flex flex-col items-center">
        
        {scannerActive ? (
          <div className="w-full space-y-4">
            {/* Scanner Area */}
            <div className="relative rounded-2xl overflow-hidden border border-dark-800 bg-dark-950 aspect-square w-full max-w-[340px] mx-auto">
              <div id="reader-canvas" className="w-full h-full"></div>
              
              {/* Scan box overlay guidelines */}
              <div className="absolute inset-0 border-[35px] border-dark-950/80 pointer-events-none flex items-center justify-center">
                <div className="w-[180px] h-[180px] border-2 border-dashed border-primary-500 rounded-lg animate-pulse-slow"></div>
              </div>
            </div>

            <button
              onClick={stopScanner}
              className="btn-secondary w-full max-w-[340px] mx-auto py-3 bg-red-950/20 hover:bg-red-950/30 border-red-900/30 text-red-400"
            >
              <Pause className="h-4 w-4" /> Stop Camera
            </button>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="bg-dark-950/60 p-5 rounded-full border border-dark-850 text-dark-500">
              <Camera className="h-10 w-10" />
            </div>
            
            <div className="space-y-1">
              <h3 className="font-semibold text-white">Camera is inactive</h3>
              <p className="text-xs text-dark-400 max-w-sm">
                Enable camera scanning to read QR codes instantly using your device's built-in camera.
              </p>
            </div>

            {!cameraPermission && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl flex items-center gap-2 max-w-md">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Camera access denied. Please grant permissions in your browser settings.</span>
              </div>
            )}

            {!activeQr && !statusMsg && (
              <button
                onClick={startScanner}
                className="btn-primary py-3.5 px-6 shadow-lg shadow-primary-500/15"
              >
                <Play className="h-4 w-4" /> Start Camera Scan
              </button>
            )}
          </div>
        )}

        {/* Configurations Banner inside scanner */}
        <div className="w-full border-t border-dark-800/80 mt-6 pt-4 flex justify-between items-center text-xs">
          <span className="text-dark-400 font-medium">Automatic Check-in Mode</span>
          <button
            onClick={() => setAutoConfirm(!autoConfirm)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition-all duration-200 ${
              autoConfirm 
                ? 'bg-primary-950/40 border-primary-800 text-primary-400' 
                : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-dark-200'
            }`}
          >
            {autoConfirm ? 'Instant Auto-Confirm (1-Click)' : 'Manual Lookups First'}
          </button>
        </div>

      </div>

      {/* ==========================================
          Status Result Banner (Errors or Success)
         ========================================== */}
      {statusMsg && (
        <div className={`glass-card p-5 border shadow-lg animate-slide-up flex gap-4 ${
          statusMsg.type === 'success' 
            ? 'border-green-500/20 bg-green-950/10' 
            : 'border-red-500/20 bg-red-950/10'
        }`}>
          <div className={`p-2 rounded-full shrink-0 ${
            statusMsg.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="flex-1 space-y-1">
            <span className={`text-sm font-bold block ${statusMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {statusMsg.type === 'success' ? 'Validation Successful' : 'Validation Failed'}
            </span>
            <p className="text-xs text-dark-300 leading-normal">{statusMsg.text}</p>
          </div>
          <button
            onClick={handleClearStatus}
            className="text-xs font-semibold text-dark-400 hover:text-dark-200 self-center border border-dark-700 px-3 py-1.5 rounded-lg"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ==========================================
          Manual Verify Card (For Manual Confirm Mode)
         ========================================== */}
      {activeQr && (
        <div className="glass-card p-6 border-primary-500/20 shadow-2xl animate-slide-up space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase font-bold text-primary-400 font-mono tracking-widest">Verification Card</span>
              <h3 className="text-lg font-display text-white">{activeQr.event.event_name}</h3>
              <p className="text-xs text-dark-400">{activeQr.qr.description || 'General Entry Ticket'}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-dark-500 font-mono block">Ticket ID</span>
              <span className="text-md font-mono font-bold text-white">{activeQr.qr.qr_id}</span>
            </div>
          </div>

          <div className="bg-dark-950 p-4 rounded-xl border border-dark-850 flex justify-between text-sm">
            <span className="text-dark-400">Scan Status:</span>
            <span className="font-semibold text-white">
              {activeQr.qr.current_usage} uses recorded (Limit: {activeQr.qr.max_usage})
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setActiveQr(null); scanLockRef.current = false; startScanner(); }}
              className="btn-secondary flex-1 py-3"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleManualConfirm}
              className="btn-primary flex-1 py-3 text-sm font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Confirm Check-in
            </button>
          </div>
        </div>
      )}

      {/* Manual lookup fallback */}
      <form onSubmit={handleManualSearch} className="flex gap-2.5 no-print">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-dark-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Manual fallback: Paste secure token here..."
            className="form-input py-2.5 pl-10 text-xs"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            disabled={manualSearching || isSubmitting}
          />
        </div>
        <button
          type="submit"
          disabled={manualSearching || isSubmitting || !manualToken.trim()}
          className="btn-secondary py-2.5 px-4 text-xs font-semibold shrink-0 disabled:opacity-50"
        >
          {manualSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Search Code'}
        </button>
      </form>

    </div>
  );
}
