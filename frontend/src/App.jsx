import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LayoutDashboard, QrCode, Users, Settings, LogOut, Shield } from 'lucide-react';

// Import Pages
import Login from './pages/Login';
import PublicQRInfo from './pages/PublicQRInfo';
import StaffScanner from './pages/StaffScanner';
import AdminDashboard from './pages/AdminDashboard';
import AdminQRList from './pages/AdminQRList';
import AdminStaff from './pages/AdminStaff';
import AdminSettings from './pages/AdminSettings';

/**
 * Route Guard: Require Admin role
 */
const AdminRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * Route Guard: Require Staff or Admin role
 */
const StaffRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'admin' && user.role !== 'staff') {
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * Global Navigation Layout for Logged In Users
 */
const NavigationLayout = ({ children }) => {
  const { user, logout, event } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return children;

  const isAdmin = user.role === 'admin';

  const navItems = isAdmin 
    ? [
        { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/admin/qr', label: 'QR Codes', icon: QrCode },
        { path: '/admin/staff', label: 'Staff', icon: Users },
        { path: '/admin/settings', label: 'Settings', icon: Settings },
      ]
    : [
        { path: '/staff/scanner', label: 'Scan QRs', icon: QrCode }
      ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-dark-950">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-dark-900 border-b md:border-b-0 md:border-r border-dark-800/80 flex flex-col no-print shrink-0">
        {/* Brand Header */}
        <div className="p-6 border-b border-dark-800/60 flex items-center gap-3">
          <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2.5 rounded-xl shadow-lg shadow-primary-500/10">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-display text-lg font-extrabold text-white leading-tight">
              {event?.event_name || 'EVENT Platform'}
            </h2>
            <span className="text-[10px] text-primary-400 tracking-widest uppercase font-bold flex items-center gap-1">
              <Shield className="h-2.5 w-2.5" /> {user.role} Portal
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary-600/90 text-white font-medium shadow-md shadow-primary-500/10' 
                    : 'text-dark-400 hover:bg-dark-800 hover:text-dark-100'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile Summary & Logout */}
        <div className="p-4 border-t border-dark-800/60 bg-dark-950/40">
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div className="truncate">
              <div className="font-semibold text-sm text-white truncate">{user.name}</div>
              <div className="text-xs text-dark-500 truncate">@{user.username}</div>
            </div>
            <button 
              onClick={() => { logout(); navigate('/login'); }}
              className="text-dark-400 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all duration-200 active:scale-95"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

/**
 * Root Redirect Handler based on Role
 */
const RootRedirect = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/staff/scanner" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Login Screen */}
          <Route path="/login" element={<Login />} />

          {/* Unified QR Scanned URL Route */}
          <Route path="/q/:token" element={<PublicQRInfo />} />

          {/* Staff Camera Scanner */}
          <Route 
            path="/staff/scanner" 
            element={
              <StaffRoute>
                <NavigationLayout>
                  <StaffScanner />
                </NavigationLayout>
              </StaffRoute>
            } 
          />

          {/* Admin Routes */}
          <Route 
            path="/admin/dashboard" 
            element={
              <AdminRoute>
                <NavigationLayout>
                  <AdminDashboard />
                </NavigationLayout>
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/qr" 
            element={
              <AdminRoute>
                <NavigationLayout>
                  <AdminQRList />
                </NavigationLayout>
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/staff" 
            element={
              <AdminRoute>
                <NavigationLayout>
                  <AdminStaff />
                </NavigationLayout>
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/settings" 
            element={
              <AdminRoute>
                <NavigationLayout>
                  <AdminSettings />
                </NavigationLayout>
              </AdminRoute>
            } 
          />

          {/* Wildcard Fallback */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
