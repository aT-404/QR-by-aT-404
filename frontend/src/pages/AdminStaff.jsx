import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Users, UserPlus, Search, UserCheck, UserX, Trash2, Key, Edit2,
  Loader, AlertCircle, CheckCircle, XCircle, Award, Eye, FileSpreadsheet
} from 'lucide-react';

export default function AdminStaff() {
  const { getAuthHeaders, API_URL } = useAuth();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Forms
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('active');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchStaff();
  }, [search]);

  const fetchStaff = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/staff?search=${encodeURIComponent(search)}`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to retrieve staff list.');
      } else {
        setStaff(json.data);
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to the staff management APIs.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!name || !username || !password) {
      setActionError('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    setActionError('');

    try {
      const res = await fetch(`${API_URL}/staff`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, username, password })
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Failed to create staff member.');
      } else {
        setShowCreateModal(false);
        clearForm();
        fetchStaff();
      }
    } catch (err) {
      setActionError('Connection error creating user profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    if (!selectedStaff) return;

    setIsSubmitting(true);
    setActionError('');

    try {
      const res = await fetch(`${API_URL}/staff/${selectedStaff.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, status })
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Failed to update staff member.');
      } else {
        setShowEditModal(false);
        clearForm();
        fetchStaff();
      }
    } catch (err) {
      setActionError('Connection error updating user profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedStaff || !password) {
      setActionError('Password is required.');
      return;
    }

    setIsSubmitting(true);
    setActionError('');

    try {
      const res = await fetch(`${API_URL}/staff/${selectedStaff.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password })
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Failed to reset password.');
      } else {
        setShowPasswordModal(false);
        clearForm();
        alert('Password updated successfully.');
        fetchStaff();
      }
    } catch (err) {
      setActionError('Connection error updating auth credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!selectedStaff) return;

    setIsSubmitting(true);
    setActionError('');

    try {
      const res = await fetch(`${API_URL}/staff/${selectedStaff.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();

      if (!json.success) {
        setActionError(json.message || 'Failed to delete staff member.');
      } else {
        setShowDeleteModal(false);
        clearForm();
        fetchStaff();
      }
    } catch (err) {
      setActionError('Connection error deleting user profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (member) => {
    setSelectedStaff(member);
    setName(member.name);
    setStatus(member.status);
    setActionError('');
    setShowEditModal(true);
  };

  const openPasswordModal = (member) => {
    setSelectedStaff(member);
    setPassword('');
    setActionError('');
    setShowPasswordModal(true);
  };

  const openDeleteModal = (member) => {
    setSelectedStaff(member);
    setActionError('');
    setShowDeleteModal(true);
  };

  const clearForm = () => {
    setName('');
    setUsername('');
    setPassword('');
    setStatus('active');
    setSelectedStaff(null);
    setActionError('');
  };

  return (
    <div className="space-y-6">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display text-white">Staff Management</h1>
          <p className="text-xs text-dark-400">Add, configure, and monitor check-in staff account performance.</p>
        </div>
        <div className="flex gap-2">
          {/* CSV Export */}
          <a
            href={`${API_URL}/reports/export?type=staff_activity`}
            download
            className="btn-secondary py-2 text-xs"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-400" /> Export CSV
          </a>

          {/* Add Staff Button */}
          <button
            onClick={() => { clearForm(); setShowCreateModal(true); }}
            className="btn-primary py-2.5 text-xs shadow-lg shadow-primary-500/10"
          >
            <UserPlus className="h-4 w-4" /> Add Staff Member
          </button>
        </div>
      </div>

      {/* Search Input bar */}
      <div className="glass-card p-4">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-dark-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Search staff registry by Name or Username..."
            className="form-input py-2 pl-10 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Staff Grid Cards */}
      {loading ? (
        <div className="py-24 text-center">
          <Loader className="h-10 w-10 text-primary-500 animate-spin mx-auto mb-3" />
          <p className="text-xs text-dark-400">Loading staff registry details...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 space-y-2">
          <AlertCircle className="h-8 w-8 mx-auto" />
          <p className="text-xs">{error}</p>
        </div>
      ) : staff.length === 0 ? (
        <div className="py-20 text-center text-dark-500 space-y-2">
          <Users className="h-12 w-12 mx-auto text-dark-700" />
          <p className="text-sm font-semibold">No staff profiles registered</p>
          <p className="text-xs max-w-xs mx-auto text-dark-600">
            Create staff accounts to allow members to authenticate and scan QR codes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((member) => (
            <div 
              key={member.id} 
              className={`glass-card p-6 flex flex-col justify-between space-y-4 ${
                member.status === 'disabled' ? 'border-red-950/20 bg-dark-900/40 opacity-75' : ''
              }`}
            >
              
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-display text-base text-white">{member.name}</h3>
                  <span className="text-xs text-dark-450 font-mono">@{member.username}</span>
                </div>
                
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border tracking-wider ${
                  member.status === 'active' 
                    ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {member.status === 'active' ? 'Active' : 'Disabled'}
                </span>
              </div>

              {/* Staff Telemetry Stats */}
              <div className="bg-dark-950/80 p-3.5 rounded-xl border border-dark-850 flex justify-between text-xs font-mono">
                <div>
                  <span className="text-[10px] text-dark-500 uppercase block mb-0.5">Check-ins</span>
                  <span className="text-white font-bold">{member.scan_count} Scans</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-dark-500 uppercase block mb-0.5">Last login</span>
                  <span className="text-white">
                    {member.last_login_at ? new Date(member.last_login_at).toLocaleDateString() : 'Never'}
                  </span>
                </div>
              </div>

              {/* Actions controls */}
              <div className="flex gap-2 justify-end border-t border-dark-800/60 pt-4">
                <button
                  onClick={() => openEditModal(member)}
                  className="p-2 bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white rounded-lg transition-all duration-200"
                  title="Edit Account Details"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openPasswordModal(member)}
                  className="p-2 bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white rounded-lg transition-all duration-200"
                  title="Reset Password"
                >
                  <Key className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openDeleteModal(member)}
                  className="p-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-400 rounded-lg transition-all duration-200"
                  title="Delete Account"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ==========================================
          1. CREATE STAFF MODAL
         ========================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 border-primary-500/10 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-display text-white font-bold">Register Staff Account</h2>
              <button onClick={() => { if (!isSubmitting) setShowCreateModal(false); }} className="text-dark-500 hover:text-dark-200">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="staff-name">Staff Name</label>
                <input
                  id="staff-name"
                  type="text"
                  placeholder="e.g. John Doe"
                  className="form-input text-sm py-2.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="staff-user">Username</label>
                <input
                  id="staff-user"
                  type="text"
                  placeholder="e.g. john_doe"
                  className="form-input text-sm py-2.5"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <span className="text-[9px] text-dark-500 mt-1 block">Staff logs in with username only. System maps email internally.</span>
              </div>

              <div>
                <label className="form-label" htmlFor="staff-pass">Account Password</label>
                <input
                  id="staff-pass"
                  type="password"
                  placeholder="••••••••"
                  className="form-input text-sm py-2.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary py-2 text-xs"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2.5 text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Registering...' : 'Register Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          2. EDIT STAFF MODAL
         ========================================== */}
      {showEditModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 border-primary-500/10 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-display text-white font-bold">Edit Account Details</h2>
              <button onClick={() => { if (!isSubmitting) setShowEditModal(false); }} className="text-dark-500 hover:text-dark-200">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateStaff} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="edit-name">Staff Name</label>
                <input
                  id="edit-name"
                  type="text"
                  className="form-input text-sm py-2.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="edit-status">Account Status</label>
                <select
                  id="edit-status"
                  className="form-input text-sm py-2.5 bg-dark-950"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="disabled">Disabled (Access Blocked)</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary py-2 text-xs"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2.5 text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          3. RESET PASSWORD MODAL
         ========================================== */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 border-primary-500/10 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-display text-white font-bold">Reset Password</h2>
              <button onClick={() => { if (!isSubmitting) setShowPasswordModal(false); }} className="text-dark-500 hover:text-dark-200">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-dark-400 mb-4">
              Update password credentials for <span className="font-semibold text-white">@{selectedStaff?.username}</span>.
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="reset-pass">New Password</label>
                <input
                  id="reset-pass"
                  type="password"
                  placeholder="••••••••"
                  className="form-input text-sm py-2.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn-secondary py-2 text-xs"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2.5 text-xs bg-amber-600 hover:bg-amber-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          4. DELETE CONFIRMATION MODAL
         ========================================== */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-card max-w-sm w-full p-6 border-red-500/10 shadow-2xl">
            <h3 className="text-lg font-display text-white mb-2 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Remove Staff Member?
            </h3>
            
            <p className="text-xs text-dark-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete staff member <span className="font-semibold text-white">@{selectedStaff?.username}</span>? 
              This will disable their credentials and cancel future check-in access. This operation is irreversible.
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary py-2 text-xs"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStaff}
                className="btn-primary py-2.5 text-xs bg-red-600 hover:bg-red-500"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
