import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Spinner from './components/ui/Spinner';
import ProtectedRoute from './components/guards/ProtectedRoute';
import RoleRoute from './components/guards/RoleRoute';
import Layout from './components/Layout';

/* Lazy-loaded pages for code splitting */
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PocList = lazy(() => import('./pages/PocList'));
const PocDetail = lazy(() => import('./pages/PocDetail'));
const PocForm = lazy(() => import('./pages/PocForm'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const IdeaReviews = lazy(() => import('./pages/IdeaReviews'));

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

export default function App() {
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
                <RoleRoute roles={['admin', 'developer', 'viewer']}>
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
                <RoleRoute roles={['admin']}>
                  <UserManagement />
                </RoleRoute>
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

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
