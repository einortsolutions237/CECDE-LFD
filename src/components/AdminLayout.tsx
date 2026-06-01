import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Users, Network, Award, BarChart3, 
  CreditCard, Settings, FileText, Menu, X, LogOut, Bell,
  UsersRound, ShieldAlert
} from 'lucide-react';
import { cn } from '../lib/utils';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from 'react-i18next';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { userData, logout } = useAuth();
  const isSuperAdmin = userData?.role === 'super_admin';
  const { t } = useTranslation();

  const menuItems = [
    { name: t('nav.dashboard'), path: '/admin/dashboard', icon: LayoutDashboard },
    { name: t('admin.users'), path: '/admin/users', icon: Users },
    { name: t('admin.teams'), path: '/admin/teams', icon: UsersRound },
    { name: t('admin.network_management'), path: '/admin/network', icon: Network },
    { name: t('nav.rankings'), path: '/admin/rankings', icon: Award },
    { name: t('admin.reports'), path: '/admin/reports', icon: BarChart3 },
    { name: t('admin.kyc'), path: '/admin/kyc', icon: ShieldAlert },
    { name: t('admin.system_logs'), path: '/admin/logs', icon: FileText },
    { name: t('admin.settings'), path: '/admin/settings', icon: Settings },
  ];
  
  // System Reset functionality removed

  return (
    <div className="h-[100dvh] w-full bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full z-50 flex items-center justify-between bg-card p-4 sm:p-6 border-b border-border shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <img src="https://i.imgur.com/Adh2bcY.png" alt="Logo" className="w-8 h-8 object-contain" />
          <div className="text-xl font-bold text-primary tracking-tight">ADMIN</div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-foreground">
            {sidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Spacer for Mobile Header */}
      <div className="md:hidden h-[73px] sm:h-[81px] w-full shrink-0"></div>

      {/* Sidebar */}
      <div className={cn(
        "fixed md:static inset-y-0 z-40 bg-sidebar border-r border-border w-[260px] flex flex-col transition-transform duration-300 shadow-xl md:shadow-none pt-[73px] sm:pt-[81px] md:pt-0",
        sidebarOpen ? "left-0" : "-left-full"
      )}>
        <div className="p-6 hidden md:flex flex-col items-center gap-6 border-b border-border">
          <img src="https://i.imgur.com/Adh2bcY.png" alt="Logo" className="w-12 h-12 object-contain" />
          <div className="text-xl font-bold tracking-tight text-sidebar-foreground">
            SYSTEM ADMIN
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto mt-4 md:mt-0 py-4">
          <nav className="px-4 space-y-1">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === '/admin/dashboard' && location.pathname === '/admin');
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-primary text-white shadow-sm ring-1 ring-primary/20" 
                      : "text-sidebar-muted hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  {item.name}
                </Link>
              );
            })}
            
            <div className="pt-6 mt-6 border-t border-border px-2">
              <Link
                to="/dashboard"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-sidebar-foreground bg-muted hover:bg-muted/80 transition-all border border-border"
              >
                <LayoutDashboard className="w-[18px] h-[18px]" />
                {t('nav.return_app')}
              </Link>
            </div>
          </nav>
        </div>
        
        <div className="p-5 border-t border-border bg-foreground/[0.02]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-sm border border-primary/20">
              {userData?.fullName?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="font-semibold text-sm text-foreground truncate">{userData?.fullName || 'Administrator'}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{userData?.role?.replace('_', ' ') || 'SYSTEM ADMIN'}</div>
            </div>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/20"
          >
            <LogOut className="w-[18px] h-[18px]" />
            {t('nav.sign_out')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 min-h-0">
        {/* Top Navbar */}
        <header className="hidden md:flex items-center justify-between px-8 bg-card border-b border-border h-[72px] shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Admin</span> <span className="text-border">/</span> <span className="text-foreground font-medium capitalize">{location.pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}</span>
          </div>
          <div className="flex items-center gap-6">
            <LanguageSelector />
            <button className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors focus:outline-none">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-card"></span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-border hover:bg-muted p-1 pr-3 rounded-full transition-colors cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
                 {userData?.fullName?.charAt(0) || 'A'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-sm font-semibold text-foreground leading-none mb-1">{userData?.fullName || 'Admin'}</div>
                <div className="text-[11px] text-muted-foreground font-medium uppercase leading-none">{userData?.role?.replace('_', ' ') || 'Admin'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
