import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FileBadge, Search, CheckCircle, XCircle, Clock, Eye, Download, ShieldCheck } from 'lucide-react';

export default function AdminKYC() {
  const [kycRequests, setKycRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKYC();
  }, []);

  const fetchKYC = async () => {
    setLoading(true);
    try {
      // Dummy implementation for UI structure
      setKycRequests([
         { id: 'KYC-001', userId: 'USER-123', email: 'john@example.com', type: 'national_id', status: 'pending', submittedAt: Date.now() - 3600000 },
         { id: 'KYC-002', userId: 'USER-456', email: 'alice@example.com', type: 'passport', status: 'approved', submittedAt: Date.now() - 86400000 },
         { id: 'KYC-003', userId: 'USER-789', email: 'bob@tech.com', type: 'drivers_license', status: 'rejected', submittedAt: Date.now() - 250000000 },
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      // Would update DB here
      setKycRequests(prev => prev.map(k => k.id === id ? { ...k, status: newStatus } : k));
    } catch (error) {
       console.error("KYC update failed", error);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
             <ShieldCheck className="w-8 h-8 text-primary" /> KYC & Compliance Management
          </h1>
          <p className="text-sm font-medium text-muted-foreground mt-2">Verify user identities, approve documents, and maintain platform compliance.</p>
        </div>
        <div className="flex bg-background border border-border rounded-xl px-3 py-2 items-center flex-1 max-w-sm">
           <Search className="w-5 h-5 text-muted-foreground mr-2" />
           <input type="text" placeholder="Search by User ID..." className="bg-transparent border-none outline-none w-full text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="card border-l-4 border-l-blue-500/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Pending KYC</h3>
            <div className="text-3xl font-bold text-blue-600">{kycRequests.filter(k => k.status === 'pending').length}</div>
         </div>
         <div className="card border-l-4 border-l-success/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Approved Users</h3>
            <div className="text-3xl font-bold text-success">{kycRequests.filter(k => k.status === 'approved').length}</div>
         </div>
         <div className="card border-l-4 border-l-destructive/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Rejected</h3>
            <div className="text-3xl font-bold text-destructive">{kycRequests.filter(k => k.status === 'rejected').length}</div>
         </div>
      </div>

      <div className="card p-0 overflow-hidden border border-border">
         <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
            <h2 className="font-bold text-foreground">Verification Requests</h2>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-muted/10 text-muted-foreground uppercase tracking-wider text-xs border-b border-border">
                  <tr>
                     <th className="px-6 py-4 font-semibold">KYC ID / User Info</th>
                     <th className="px-6 py-4 font-semibold">Document Type</th>
                     <th className="px-6 py-4 font-semibold">Submitted</th>
                     <th className="px-6 py-4 font-semibold">Status</th>
                     <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {kycRequests.map(req => (
                     <tr key={req.id} className="hover:bg-muted/20">
                        <td className="px-6 py-4">
                           <div className="flex flex-col gap-1">
                              <span className="font-bold text-foreground text-xs">{req.id}</span>
                              <span className="text-muted-foreground font-mono">{req.userId} • {req.email}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 capitalize font-medium text-foreground">{req.type.replace('_', ' ')}</td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground">{new Date(req.submittedAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                           {req.status === 'pending' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-500 font-bold text-xs"><Clock className="w-3 h-3"/> Pending</span>}
                           {req.status === 'approved' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 text-success font-bold text-xs"><CheckCircle className="w-3 h-3"/> Approved</span>}
                           {req.status === 'rejected' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-destructive/10 text-destructive font-bold text-xs"><XCircle className="w-3 h-3"/> Rejected</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                              {req.status === 'pending' && (
                                <>
                                  <button onClick={() => handleStatusChange(req.id, 'approved')} className="p-1.5 rounded-md text-success hover:bg-success/10 border border-transparent hover:border-success/20 transition-all" title="Approve">
                                     <CheckCircle className="w-5 h-5" />
                                  </button>
                                  <button onClick={() => handleStatusChange(req.id, 'rejected')} className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all" title="Reject">
                                     <XCircle className="w-5 h-5" />
                                  </button>
                                </>
                              )}
                              <button className="p-1.5 rounded-md text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all flex items-center justify-center gap-1">
                                 <Eye className="w-4 h-4"/> <span className="sr-only">View App</span>
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
