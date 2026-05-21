import React, { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { 
  Menu, X, Home, Users, Trello, Award, FileText, Settings, LogOut, ShieldAlert
} from 'lucide-react';
import { cn } from '../lib/utils';

export const Layout = () => {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: Home, show: true },
    { name: 'Network', path: '/network', icon: Users, show: true },
    { name: 'Rankings', path: '/rankings', icon: Award, show: true },
    { name: 'Team Dashboard', path: '/team-members', icon: Trello, show: userData?.roleType === 'team_leader' },
    { name: 'Reports', path: '/reports', icon: FileText, show: true },
    { name: 'Settings', path: '/settings', icon: Settings, show: true },
    { name: 'Admin Panel', path: '/admin', icon: ShieldAlert, show: userData?.role === 'admin' || userData?.role === 'super_admin' },
  ];

  return (
    <div className="h-[100dvh] w-full bg-background flex flex-col md:flex-row overflow-hidden">
      <div className="md:hidden fixed top-0 w-full z-50 flex items-center justify-between bg-card p-4 sm:p-6 border-b border-border shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <img src="https://i.imgur.com/Adh2bcY.png" alt="Logo" className="w-8 h-8 object-contain" />
          <div className="text-xl font-bold text-primary">Lfdcecde</div>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Spacer for Mobile Header */}
      <div className="md:hidden h-[73px] sm:h-[81px] w-full shrink-0"></div>

      <aside className={cn(
        "fixed md:static inset-y-0 z-40 bg-sidebar border-r border-border w-[260px] flex flex-col text-sidebar-foreground transition-transform duration-300 shadow-xl md:shadow-none pt-[73px] sm:pt-[81px] md:pt-0",
        sidebarOpen ? "left-0" : "-left-full"
      )}>
        <div className="p-6 hidden md:flex flex-col items-center gap-6 border-b border-border">
          <img src="https://i.imgur.com/Adh2bcY.png" alt="Logo" className="w-12 h-12 object-contain" />
          <div className="text-xl font-bold tracking-tight text-sidebar-foreground">
            <span className="text-primary">Lfdcecde</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="flex flex-col px-4 gap-1">
            {navItems.filter(item => item.show).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-primary text-white shadow-sm ring-1 ring-primary/20" 
                      : "text-sidebar-muted hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="mt-auto p-5 border-t border-border bg-foreground/[0.02]">
          <div className="text-xs font-semibold text-muted-foreground mb-2">SYSTEM STATUS</div>
          <div className="flex items-center gap-2 text-xs text-foreground mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
            </span>
            AI Engine Active
          </div>
          
          <div className="flex items-center gap-3 mb-4 mt-4 pt-4 border-t border-border">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 border border-primary/20">
              {userData?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-foreground truncate">{userData?.fullName || 'User'}</div>
              <div className="text-xs font-medium text-muted-foreground truncate uppercase tracking-wider mt-0.5">{userData?.currentRank || 'Unranked'}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 text-sm text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 w-full px-4 py-2.5 rounded-xl transition-colors font-semibold"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 min-h-0">
        <header className="hidden md:flex h-[72px] bg-card border-b border-border items-center justify-between px-8 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <span>Pages</span> / <span className="text-foreground font-medium capitalize">{location.pathname.split('/')[1] || 'Dashboard'}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="bg-muted px-3 py-1.5 rounded-md text-[12px] text-muted-foreground border border-border/50">
              Ref: <strong className="text-foreground">{userData?.referralCode || 'SYSTEM-1'}</strong>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 bg-background">
          <Outlet />
        </div>
      </main>
      
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};
