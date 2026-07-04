import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Search, Filter, Plus, Download, Printer, Loader, AlertCircle,
  CheckCircle, ChevronLeft, ChevronRight, Ban, Eye, Settings, FileSpreadsheet,
  XCircle, Sliders
} from 'lucide-react';

export default function AdminQRList() {
  const { getAuthHeaders, API_URL, event } = useAuth();

  // List & Search states
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);

  // Bulk Generation states
  const [showGenModal, setShowGenModal] = useState(false);
  const [genCount, setGenCount] = useState(50);
  const [genDesc, setGenDesc] = useState('');
  const [genMaxUsage, setGenMaxUsage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genResult, setGenResult] = useState(null); // { successCount, error }

  // Printing & Grid Options
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [paperSize, setPaperSize] = useState('a4'); // 'a4' | 'letter'
  const [gridCols, setGridCols] = useState(3); // 2 | 3 | 4 | 5
  const [printItems, setPrintItems] = useState([]); // QR list for printing
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // Zip downloading state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  useEffect(() => {
    fetchQRs();
  }, [search, statusFilter, page]);

  const fetchQRs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/qr/admin/search?search=${encodeURIComponent(search)}&status=${statusFilter}&page=${page}&limit=${limit}`,
        { headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to search QR codes.');
      } else {
        setQrs(json.data.qrs);
        setTotal(json.data.total);
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to the QR registry APIs.');
    } finally {
      setLoading(false);
    }
  };

  // Bulk Generation: Chunked Asynchronous Generator
  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    if (genCount <= 0) return;

    setIsGenerating(true);
    setGenProgress(0);
    setGenResult(null);

    const totalToGenerate = parseInt(genCount);
    // Split into chunks of 100 to prevent request timeouts
    const chunkSize = 100;
    const chunks = Math.ceil(totalToGenerate / chunkSize);
    let successCount = 0;
    let failed = false;

    for (let c = 0; c < chunks; c++) {
      const currentBatchSize = Math.min(chunkSize, totalToGenerate - (c * chunkSize));

      try {
        const res = await fetch(`${API_URL}/qr/admin/bulk`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            count: currentBatchSize,
            description: genDesc,
            maxUsage: genMaxUsage ? parseInt(genMaxUsage) : null
          })
        });

        const json = await res.json();

        if (json.success) {
          successCount += currentBatchSize;
          setGenProgress(Math.round(((c + 1) / chunks) * 100));
        } else {
          failed = true;
          setGenResult({ successCount, error: json.message || 'Error occurred during generation.' });
          break;
        }
      } catch (err) {
        failed = true;
        setGenResult({ successCount, error: 'Network failure during chunk creation.' });
        break;
      }
    }

    setIsGenerating(false);
    if (!failed) {
      setGenResult({ successCount, error: null });
      // Reset list state
      setPage(1);
      fetchQRs();
    }
  };

  // Individual QR Download as PNG
  const downloadSingleQR = (qrId, token) => {
    const qrUrl = `${window.location.origin}/q/${token}`;
    const imgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
    
    // Fetch image and trigger download
    fetch(imgUrl)
      .then(res => res.blob())
      .then(blob => {
        saveAs(blob, `qr_${qrId}.png`);
      })
      .catch(err => {
        alert('Failed to download QR code image.');
      });
  };

  // Bulk ZIP Download containing all QR codes
  const downloadAllQRsAsZip = async () => {
    setIsZipping(true);
    setZipProgress(0);
    const zip = new JSZip();

    try {
      // 1. Fetch all QR codes (bypass pagination to get complete list)
      const res = await fetch(`${API_URL}/qr/admin/search?limit=1000`, { headers: getAuthHeaders() });
      const json = await res.json();

      if (!json.success || !json.data.qrs.length) {
        alert('No QR codes available to export.');
        setIsZipping(false);
        return;
      }

      const allQrs = json.data.qrs;
      const totalCount = allQrs.length;

      // 2. Fetch images in parallel batches
      const batchSize = 10;
      for (let i = 0; i < totalCount; i += batchSize) {
        const batch = allQrs.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (qr) => {
            try {
              const qrUrl = `${window.location.origin}/q/${qr.secure_token}`;
              const imgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
              
              const imgRes = await fetch(imgUrl);
              const blob = await imgRes.blob();
              zip.file(`${qr.qr_id}.png`, blob);
            } catch (err) {
              console.warn(`Failed to add QR image for ${qr.qr_id}`, err);
            }
          })
        );

        setZipProgress(Math.round(((i + batch.length) / totalCount) * 100));
      }

      // 3. Generate ZIP file
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `event_qrs_${Date.now()}.zip`);

    } catch (err) {
      console.error(err);
      alert('An error occurred during ZIP creation.');
    } finally {
      setIsZipping(false);
    }
  };

  // Preparation for Printing Grid
  const preparePrintGrid = async () => {
    setIsPreparingPrint(true);
    try {
      // Fetch all QRs to make printing complete
      const res = await fetch(`${API_URL}/qr/admin/search?limit=1000`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        setPrintItems(json.data.qrs);
        setShowPrintModal(true);
      }
    } catch (err) {
      alert('Could not prepare the print sheets.');
    } finally {
      setIsPreparingPrint(false);
    }
  };

  const handleTriggerPrint = () => {
    // Apply print layouts to the document
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--print-cols', String(gridCols));

    // Wait a brief tick and run print
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 no-print">
        <div>
          <h1 className="text-3xl font-display text-white">QR Code Registry</h1>
          <p className="text-xs text-dark-400">Search, export, print, and bulk-generate secure event passes.</p>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          {/* CSV Export */}
          <a
            href={`${API_URL}/reports/export?type=qr_summary`}
            download
            className="btn-secondary py-2 text-xs"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-400" /> Export CSV
          </a>

          {/* ZIP Export */}
          <button
            onClick={downloadAllQRsAsZip}
            disabled={isZipping}
            className="btn-secondary py-2 text-xs disabled:opacity-50"
          >
            {isZipping ? (
              <>
                <Loader className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Zipping ({zipProgress}%)</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 text-indigo-400" /> ZIP Download All
              </>
            )}
          </button>

          {/* Printable Layouts */}
          <button
            onClick={preparePrintGrid}
            disabled={isPreparingPrint}
            className="btn-secondary py-2 text-xs disabled:opacity-50"
          >
            {isPreparingPrint ? <Loader className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print Sheets
          </button>

          {/* Create bulk passes */}
          <button
            onClick={() => { setShowGenModal(true); setGenResult(null); }}
            className="btn-primary py-2.5 text-xs shadow-lg shadow-primary-500/10"
          >
            <Plus className="h-4 w-4" /> Bulk Generate passes
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3 items-center no-print">
        <div className="relative flex-1 w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-dark-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Search by QR ID (e.g. JUBICON-0005) or Description..."
            className="form-input py-2 pl-10 text-xs"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto shrink-0">
          <div className="relative flex-1 md:flex-none">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-dark-500 pointer-events-none">
              <Filter className="h-3.5 w-3.5" />
            </span>
            <select
              className="form-input py-2 pl-8 pr-10 text-xs appearance-none bg-dark-950"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Statuses</option>
              <option value="Unused">Unused</option>
              <option value="Partially Used">Partially Used</option>
              <option value="Fully Used">Fully Used</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Registry Table */}
      <div className="glass-card overflow-hidden no-print">
        {loading ? (
          <div className="py-24 text-center">
            <Loader className="h-10 w-10 text-primary-500 animate-spin mx-auto mb-3" />
            <p className="text-xs text-dark-400">Filtering registry keys...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto" />
            <p className="text-xs">{error}</p>
          </div>
        ) : qrs.length === 0 ? (
          <div className="py-20 text-center text-dark-500 space-y-2">
            <QrCode className="h-12 w-12 mx-auto text-dark-700" />
            <p className="text-sm font-semibold">No QR codes found</p>
            <p className="text-xs max-w-xs mx-auto text-dark-600">
              Try adjusting your query filters or create new passes using the bulk generator.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-dark-950 border-b border-dark-850/80 text-dark-400 font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">QR ID</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Usage</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Created Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-850/50">
                {qrs.map((qr) => (
                  <tr key={qr.id} className="hover:bg-dark-900/40 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-white text-sm">{qr.qr_id}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        qr.status === 'Unused' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        qr.status === 'Partially Used' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        qr.status === 'Fully Used' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-dark-800 text-dark-500 border-dark-850'
                      }`}>
                        {qr.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-dark-350">
                      <span className="text-white font-bold">{qr.current_usage}</span> / {qr.max_usage}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate text-dark-400" title={qr.description}>
                      {qr.description || '—'}
                    </td>
                    <td className="px-6 py-4 text-dark-500">
                      {new Date(qr.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/q/${qr.secure_token}`}
                          className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white transition-all duration-200"
                          title="View & Edit Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => downloadSingleQR(qr.qr_id, qr.secure_token)}
                          className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white transition-all duration-200"
                          title="Download QR card"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-dark-950/40 border-t border-dark-850/80 flex items-center justify-between text-xs text-dark-400">
            <span>
              Showing <span className="font-semibold text-white">{(page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold text-white">{Math.min(page * limit, total)}</span> of{' '}
              <span className="font-semibold text-white">{total}</span> records
            </span>

            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-2 bg-dark-850 hover:bg-dark-800 rounded-lg text-dark-300 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 font-medium text-white">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-2 bg-dark-850 hover:bg-dark-800 rounded-lg text-dark-300 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          1. Asynchronous Bulk Generation Modal
         ========================================== */}
      {showGenModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="glass-card max-w-md w-full p-6 border-primary-500/10 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-display text-white font-bold">Bulk Pass Generator</h2>
              <button 
                onClick={() => { if (!isGenerating) setShowGenModal(false); }}
                className="text-dark-500 hover:text-dark-200"
                disabled={isGenerating}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {genResult ? (
              <div className="space-y-4 py-4 text-center">
                {genResult.error ? (
                  <>
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                    <h3 className="font-semibold text-white">Generation Interrupted</h3>
                    <p className="text-xs text-dark-400">{genResult.error}</p>
                    <p className="text-xs text-dark-400">Successfully generated {genResult.successCount} QRs before error.</p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto animate-bounce" />
                    <h3 className="font-semibold text-white">Generation Complete</h3>
                    <p className="text-xs text-dark-400">
                      Successfully added <span className="font-bold text-white">{genResult.successCount}</span> passes under event prefix <span className="font-mono text-white font-bold">"{event?.qr_prefix}"</span>.
                    </p>
                  </>
                )}
                <button
                  onClick={() => { setShowGenModal(false); setGenResult(null); }}
                  className="btn-primary w-full py-2.5 mt-4"
                >
                  Close Panel
                </button>
              </div>
            ) : isGenerating ? (
              <div className="space-y-4 py-6 text-center">
                <Loader className="h-10 w-10 text-primary-500 animate-spin mx-auto mb-2" />
                <h3 className="font-semibold text-white">Generating passes...</h3>
                <p className="text-xs text-dark-500">Writing chunk packets to Supabase. Keep tab active.</p>
                
                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-dark-950 h-2 rounded-full overflow-hidden border border-dark-850">
                    <div 
                      className="bg-primary-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${genProgress}%` }}
                    ></div>
                  </div>
                  <span className="text-[10px] text-primary-400 font-mono block">{genProgress}% Complete</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBulkGenerate} className="space-y-4">
                <div>
                  <label className="form-label" htmlFor="gen-count">Pass Count</label>
                  <input
                    id="gen-count"
                    type="number"
                    min="1"
                    max="2000"
                    placeholder="e.g. 500"
                    className="form-input text-sm py-2.5"
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-dark-500 mt-1 block">Splits count into concurrent background updates. Max: 2000.</span>
                </div>

                <div>
                  <label className="form-label" htmlFor="gen-max">Max check-ins per QR (Optional)</label>
                  <input
                    id="gen-max"
                    type="number"
                    min="1"
                    placeholder={`Default: ${event?.default_max_usage || 1} uses`}
                    className="form-input text-sm py-2.5"
                    value={genMaxUsage}
                    onChange={(e) => setGenMaxUsage(e.target.value)}
                  />
                  <span className="text-[10px] text-dark-500 mt-1 block">Overrides the event default.</span>
                </div>

                <div>
                  <label className="form-label" htmlFor="gen-desc">Pass Description / Category (Optional)</label>
                  <input
                    id="gen-desc"
                    type="text"
                    placeholder="e.g. General Admission or VIP Area Pass"
                    className="form-input text-sm py-2.5"
                    value={genDesc}
                    onChange={(e) => setGenDesc(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setShowGenModal(false)}
                    className="btn-secondary py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary py-2.5 text-xs"
                  >
                    Generate Passes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          2. Printable QR Grid Sheet Layout Modal
         ========================================== */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-dark-950/90 flex flex-col p-6 z-50 animate-fade-in no-print overflow-y-auto">
          {/* Top layout settings bar */}
          <div className="w-full max-w-5xl mx-auto bg-dark-900 border border-dark-800 p-5 rounded-2xl flex flex-col md:flex-row gap-5 items-center justify-between shadow-2xl mb-8">
            <div className="space-y-1">
              <h2 className="text-xl font-display text-white font-bold">Print Layout Configurer</h2>
              <p className="text-xs text-dark-400">Configure columns, layouts, and paper bounds before triggering browser print.</p>
            </div>

            {/* Layout parameters controls */}
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="text-[10px] uppercase font-bold text-dark-400 block mb-1">Paper size</label>
                <select 
                  className="form-input py-1.5 px-3 text-xs bg-dark-950 w-28"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                >
                  <option value="a4">A4 Sheets</option>
                  <option value="letter">US Letter</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-dark-400 block mb-1">Columns</label>
                <select 
                  className="form-input py-1.5 px-3 text-xs bg-dark-950 w-20"
                  value={gridCols}
                  onChange={(e) => setGridCols(parseInt(e.target.value) || 3)}
                >
                  <option value="2">2 Cols</option>
                  <option value="3">3 Cols</option>
                  <option value="4">4 Cols</option>
                  <option value="5">5 Cols</option>
                </select>
              </div>

              <div className="flex gap-2 mt-4 md:mt-0">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="btn-secondary py-2 text-xs"
                >
                  Close Preview
                </button>
                <button
                  onClick={handleTriggerPrint}
                  className="btn-primary py-2 px-5 text-xs shadow-lg"
                >
                  Trigger Print Dialog
                </button>
              </div>
            </div>
          </div>

          {/* Grid Sheets Preview */}
          <div className="w-full max-w-5xl mx-auto bg-white p-6 rounded-2xl text-black border border-dark-800 shadow-2xl">
            <div className="text-center border-b border-gray-200 pb-3 mb-6">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Event print sheet preview (A4/Letter grid layout)</span>
            </div>

            <div 
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {printItems.map((qr) => {
                const qrUrl = `${window.location.origin}/q/${qr.secure_token}`;
                return (
                  <div key={qr.id} className="border border-dashed border-gray-300 p-4 rounded flex flex-col items-center justify-center text-center space-y-2 bg-white">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                      alt={qr.qr_id}
                      className="w-28 h-28"
                    />
                    <div>
                      <span className="font-mono text-sm font-bold tracking-wide text-black block">{qr.qr_id}</span>
                      <span className="text-[9px] text-gray-500 block uppercase font-semibold">{event?.event_name}</span>
                      <span className="text-[8px] text-gray-400 block italic truncate max-w-[120px]">{qr.description || 'General Pass'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Hidden Printing grid for CSS Media Query
         ========================================== */}
      {printItems.length > 0 && (
        <div className="hidden print:block print-page">
          <div 
            className="print-grid"
            style={{ '--print-cols': gridCols }}
          >
            {printItems.map((qr) => {
              const qrUrl = `${window.location.origin}/q/${qr.secure_token}`;
              return (
                <div key={qr.id} className="print-card">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`}
                    alt={qr.qr_id}
                    className="w-36 h-36"
                  />
                  <div className="text-center mt-2">
                    <h3 className="font-mono text-lg font-bold text-black leading-none">{qr.qr_id}</h3>
                    <p className="text-[9px] uppercase font-bold text-gray-600 mt-1 tracking-wider">{event?.event_name}</p>
                    <p className="text-[8px] text-gray-500 truncate max-w-[150px] mt-0.5">{qr.description || 'General Pass'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
