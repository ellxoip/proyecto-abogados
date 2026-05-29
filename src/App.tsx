/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import AdminLayout from './components/admin/AdminLayout';
import ClientLayout from './components/client/ClientLayout';
import RequireAdmin from './components/auth/RequireAdmin';
import RequireClientSession from './components/auth/RequireClientSession';
import AdminLogin from './pages/admin/AdminLogin';
import Dashboard from './pages/admin/Dashboard';
import Clients from './pages/admin/Clients';
import Integrations from './pages/admin/Integrations';
import AdminSettings from './pages/admin/Settings';
import Profile from './pages/admin/Profile';
import SupportInbox from './pages/admin/SupportInbox';
import AutoLogin from './pages/client/AutoLogin';
import ClientLogin from './pages/client/ClientLogin';
import Portal from './pages/client/Portal';
import Payment from './pages/client/Payment';
import Support from './pages/client/Support';
import ClientSettings from './pages/client/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Client entry points: manual login and secure auto-login links. */}
        <Route path="/" element={<Navigate to="/client/portal" replace />} />

        {/* Client public routes */}
        <Route path="/client/login" element={<ClientLogin />} />
        <Route path="/client/auto-login" element={<AutoLogin />} />
        <Route path="/client/support" element={<ClientLayout />}>
          <Route index element={<Support />} />
        </Route>

        {/* Client protected routes */}
        <Route
          path="/client"
          element={
            <RequireClientSession>
              <ClientLayout />
            </RequireClientSession>
          }
        >
          <Route index element={<Navigate to="/client/portal" replace />} />
          <Route path="portal" element={<Portal />} />
          <Route path="payment" element={<Payment />} />
          <Route path="settings" element={<ClientSettings />} />
        </Route>

        {/* Admin public route */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin protected routes */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="support" element={<SupportInbox />} />
        </Route>

        <Route path="*" element={<Navigate to="/client/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
