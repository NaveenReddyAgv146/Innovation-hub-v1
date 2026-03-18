import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Spinner from './components/ui/Spinner';
import ProtectedRoute from './components/guards/ProtectedRoute';
import RoleRoute from './components/guards/RoleRoute';
import Layout from './components/Layout';
import { isSuperAdmin } from './utils/access';

/* Lazy-loaded pages for code splitting */
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TrackDashboard = lazy(() => import('./pages/TrackDashboard'));
const PocList = lazy(() => import('./pages/PocList'));
const PocDetail = lazy(() => import('./pages/PocDetail'));
const PocForm = lazy(() => import('./pages/PocForm'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const IdeaReviews = lazy(() => import('./pages/IdeaReviews'));
const UserInterests = lazy(() => import('./pages/UserInterests'));
const THEME_STORAGE_KEY = 'poc_theme';

function PageLoader() {
  return <Spinner size="lg" className="mt-24" />;
}

function AppLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function SuperAdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('poc_user') || 'null');
  if (!isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : (systemPrefersDark ? 'dark' : 'light');

    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    if (!savedTheme) localStorage.setItem(THEME_STORAGE_KEY, initialTheme);
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <AppLayout>
                <Dashboard />
              </AppLayout>
            }
          />

          <Route
            path="/dashboard/track"
            element={
              <AppLayout>
                <TrackDashboard />
              </AppLayout>
            }
          />

          <Route
            path="/pocs"
            element={
              <AppLayout>
                <PocList />
              </AppLayout>
            }
          />

          <Route
            path="/pocs/new"
            element={
              <AppLayout>
                <RoleRoute roles={['admin', 'developer']}>
                  <PocForm />
                </RoleRoute>
              </AppLayout>
            }
          />

          <Route
            path="/pocs/:id/edit"
            element={
              <AppLayout>
                <RoleRoute roles={['admin', 'developer']}>
                  <PocForm />
                </RoleRoute>
              </AppLayout>
            }
          />

          <Route
            path="/pocs/:id"
            element={
              <AppLayout>
                <PocDetail />
              </AppLayout>
            }
          />

          <Route
            path="/users"
            element={
              <AppLayout>
                <SuperAdminRoute>
                  <UserManagement />
                </SuperAdminRoute>
              </AppLayout>
            }
          />

          <Route
            path="/admin/idea-reviews"
            element={
              <AppLayout>
                <RoleRoute roles={['admin']}>
                  <IdeaReviews />
                </RoleRoute>
              </AppLayout>
            }
          />

          <Route
            path="/admin/user-interests"
            element={
              <AppLayout>
                <RoleRoute roles={['admin']}>
                  <UserInterests />
                </RoleRoute>
              </AppLayout>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
