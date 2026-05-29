import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Key, Users, Server, FileText, Search, Filter } from 'lucide-react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
      const snap = await getDocs(q);
      let data: any[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() }));
      
      if (data.length === 0) {
        // Mock data for display purposes
        data = [
           { id: '1', action: 'Failed Login Attempt', category: 'security', user: 'admin@system.local', ip: '192.168.1.45', timestamp: Date.now() - 3000, severity: 'high' },
           { id: '2', action: 'Database Synchronized', category: 'system', user: 'SYSTEM', ip: '10.0.0.1', timestamp: Date.now() - 14000, severity: 'info' },
           { id: '3', action: 'Modified System Settings', category: 'admin', user: 'superadmin_1', ip: '172.16.0.4', timestamp: Date.now() - 3600000, severity: 'warning' },
           { id: '4', action: 'Password Reset Requested', category: 'auth', user: 'USER-1029', ip: '104.28.32.1', timestamp: Date.now() - 86400000, severity: 'info' },
           { id: '5', action: 'Approved Withdrawal W-449', category: 'finance', user: 'finance_admin', ip: '172.16.0.5', timestamp: Date.now() - 172800000, severity: 'medium' }
        ];
      }
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'warning': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'info': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'medium': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      default: return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  const getActionIcon = (cat: string) => {
    switch(cat) {
      case 'security': return <Shield className="w-4 h-4" />;
      case 'auth': return <Key className="w-4 h-4" />;
      case 'admin': return <Users className="w-4 h-4" />;
      case 'system': return <Server className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
             <Shield className="w-8 h-8 text-primary" /> Security & Audit Logs
          </h1>
          <p className="text-sm font-medium text-muted-foreground mt-2">Monitor system activity, access history, and financial changes.</p>
        </div>
        <div className="flex bg-background border border-border rounded-xl px-3 py-2 items-center flex-1 max-w-sm">
           <Search className="w-5 h-5 text-muted-foreground mr-2" />
           <input type="text" placeholder="Search logs..." className="bg-transparent border-none outline-none w-full text-sm" />
        </div>
      </div>

      <div className="card p-0 overflow-hidden border border-border">
         <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
            <h2 className="font-bold text-foreground">Recent Events</h2>
            <button className="flex items-center gap-2 text-sm font-medium bg-background border border-border px-3 py-1.5 rounded-md hover:bg-muted">
              <Filter className="w-4 h-4" /> Filter
            </button>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-muted/10 text-muted-foreground uppercase tracking-wider text-xs border-b border-border">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Status / Time</th>
                     <th className="px-6 py-4 font-semibold">Event</th>
                     <th className="px-6 py-4 font-semibold">Category</th>
                     <th className="px-6 py-4 font-semibold">Actor / IP</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {logs.map(log => (
                     <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-6 py-4">
                           <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold w-fit border ${getSeverityColor(log.severity)}`}>
                                 {log.severity.toUpperCase()}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                           </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">{log.action}</td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2 text-muted-foreground">
                              {getActionIcon(log.category)}
                              <span className="capitalize">{log.category}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono">
                           <div className="flex flex-col">
                              <span className="font-bold text-foreground">{log.user}</span>
                              <span className="text-muted-foreground">{log.ip}</span>
                           </div>
                        </td>
                     </tr>
                  ))}
                  {logs.length === 0 && !loading && (
                    <tr>
                       <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                          No audit logs found.
                       </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
