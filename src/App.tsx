/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './components/ThemeProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { AdminLayout } from './components/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingFallback } from './components/LoadingFallback';
import { Toaster } from 'react-hot-toast';

// Lazy loaded pages to optimize bundle size
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NetworkTree = lazy(() => import('./pages/NetworkTree'));
const Rankings = lazy(() => import('./pages/Rankings'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const TeamMembers = lazy(() => import('./pages/TeamMembers'));
const MyWallet = lazy(() => import('./pages/MyWallet'));

// Lazy loaded Admin Pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminTeams = lazy(() => import('./pages/admin/AdminTeams'));
const AdminNetwork = lazy(() => import('./pages/admin/AdminNetwork'));
const AdminRankings = lazy(() => import('./pages/admin/AdminRankings'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminKYC = lazy(() => import('./pages/admin/AdminKYC'));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <Toaster position="top-right" />
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                
                {/* Member Layout */}
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/network" element={<NetworkTree />} />
                  <Route path="/team-members" element={<TeamMembers />} />
                  <Route path="/wallet" element={<MyWallet />} />
                  <Route path="/rankings" element={<Rankings />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>

                {/* Admin Layout */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin={true}>
                    <AdminLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="teams" element={<AdminTeams />} />
                  <Route path="network" element={<AdminNetwork />} />
                  <Route path="rankings" element={<AdminRankings />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="transactions" element={<AdminTransactions />} />
                  <Route path="kyc" element={<AdminKYC />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="logs" element={<AdminLogs />} />
                </Route>
                
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

