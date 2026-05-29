import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, handleFirestoreError, OperationType } from '../../lib/firebase';
import { CreditCard, ArrowDownRight, ArrowUpRight, CheckCircle, XCircle, Search, DollarSign, Filter, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Modals
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusForm, setBonusForm] = useState({ userId: '', amount: '', notes: '' });
  const [bonusLoading, setBonusLoading] = useState(false);

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const txSnap = await getDocs(query(collection(db, 'transactions'), orderBy('timestamp', 'desc')));
      let txs: any[] = [];
      txSnap.forEach(t => txs.push({id: t.id, ...t.data()}));
      
      const wxSnap = await getDocs(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc')));
      let wxs: any[] = [];
      wxSnap.forEach(w => wxs.push({id: w.id, ...w.data()}));
      
      if (txs.length === 0) {
        txs = [
          { id: '1', type: 'commission', amount: 15.00, status: 'completed', timestamp: Date.now() - 3600000, recipient: 'USER-123' },
          { id: '2', type: 'bonus', amount: 50.00, status: 'completed', timestamp: Date.now() - 86400000, recipient: 'USER-456' }
        ];
      }
      
      setTransactions(txs);
      setWithdrawals(wxs.length > 0 ? wxs : [
         { id: 'W1', userId: 'USER-123', amount: 150.00, status: 'pending', method: 'crypto', createdAt: Date.now() - 4000000 }
      ]);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.LIST, 'transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalAction = async (id: string, action: 'approved' | 'rejected') => {
    setProcessingId(id);
    try {
      if (action === 'approved') {
         const approveWithdrawalReq = httpsCallable(functions, 'approveWithdrawalReq');
         await approveWithdrawalReq({ withdrawalId: id });
         alert('Withdrawal Approved successfully.');
      } else {
         const rejectWithdrawalReq = httpsCallable(functions, 'rejectWithdrawalReq');
         await rejectWithdrawalReq({ withdrawalId: id, reason: 'Rejected by admin' });
         alert('Withdrawal Rejected and refunded.');
      }
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: action } : w));
    } catch (err) {
      console.error(err);
      alert('Failed to process withdrawal.');
    } finally {
      setProcessingId(null);
      fetchFinancialData();
    }
  };

  const submitManualBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    setBonusLoading(true);
    try {
      const processManualBonus = httpsCallable(functions, 'processManualBonus');
      await processManualBonus({
         userId: bonusForm.userId,
         amount: parseFloat(bonusForm.amount),
         notes: bonusForm.notes
      });
      alert('Bonus issued successfully.');
      setShowBonusModal(false);
      fetchFinancialData();
    } catch (err: any) {
       console.error(err);
       alert(`Failed to issue bonus: ${err.message}`);
    } finally {
      setBonusLoading(false);
    }
  };

  if (loading) {
     return <div className="p-8 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Financial Center</h1>
          <p className="text-sm font-medium text-muted-foreground">Manage transactions, approve withdrawals, and audit ledgers.</p>
        </div>
        <button 
          onClick={() => setShowBonusModal(true)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl shadow-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90"
        >
          <DollarSign className="w-5 h-5" />
          <span>Manual Payout / Bonus</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="card border-l-4 border-l-primary/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Total System Balance</h3>
            <div className="text-3xl font-bold text-foreground">$124,500.00</div>
         </div>
         <div className="card border-l-4 border-l-success/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Commissions Paid</h3>
            <div className="text-3xl font-bold text-success">$45,230.50</div>
         </div>
         <div className="card border-l-4 border-l-yellow-500/60">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Pending Withdrawals</h3>
            <div className="text-3xl font-bold text-yellow-600">
               {withdrawals.filter(w => w.status === 'pending').length} Requests
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">
           <div className="card p-0 overflow-hidden border border-border">
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
                 <h2 className="text-xl font-bold text-foreground">Recent Transactions System Ledger</h2>
                 <button className="p-2 border border-border rounded-lg bg-background hover:bg-muted"><Filter className="w-4 h-4" /></button>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-xs">
                       <tr>
                          <th className="px-6 py-4 font-semibold">T-ID</th>
                          <th className="px-6 py-4 font-semibold">Type</th>
                          <th className="px-6 py-4 font-semibold">Amount</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                       {transactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-muted/20">
                             <td className="px-6 py-4 font-mono text-xs">{tx.id}</td>
                             <td className="px-6 py-4 capitalize">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 font-medium text-xs">
                                   {tx.type === 'commission' ? <ArrowDownRight className="w-3 h-3 text-success"/> : <ArrowUpRight className="w-3 h-3 text-blue-500"/>}
                                   {tx.type}
                                </span>
                             </td>
                             <td className="px-6 py-4 font-bold">${tx.amount?.toFixed(2)}</td>
                             <td className="px-6 py-4">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold">
                                   <CheckCircle className="w-3 h-3" /> {tx.status}
                                </span>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

        <div className="flex flex-col gap-6">
           <div className="card p-0 overflow-hidden border border-border flex-1">
              <div className="p-6 border-b border-border bg-yellow-500/10">
                 <h2 className="text-xl font-bold text-yellow-700 dark:text-yellow-500 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> 
                    Action Needed: Withdrawals
                 </h2>
              </div>
              <div className="p-4 flex flex-col gap-4">
                 {withdrawals.filter(w => w.status === 'pending').map(w => (
                    <div key={w.id} className="p-4 border border-border rounded-xl bg-card">
                       <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-mono text-muted-foreground">{w.userId}</span>
                          <span className="text-lg font-bold text-foreground">${w.amount?.toFixed(2)}</span>
                       </div>
                       <div className="flex gap-2">
                          <button 
                            disabled={processingId === w.id}
                            onClick={() => handleWithdrawalAction(w.id, 'approved')}
                            className="flex-1 bg-success/10 text-success border border-success/20 py-2 rounded-lg font-bold text-sm hover:bg-success/20 transition-all disabled:opacity-50"
                          >
                             Approve
                          </button>
                          <button 
                             disabled={processingId === w.id}
                             onClick={() => handleWithdrawalAction(w.id, 'rejected')}
                             className="flex-1 bg-destructive/10 text-destructive border border-destructive/20 py-2 rounded-lg font-bold text-sm hover:bg-destructive/20 transition-all disabled:opacity-50"
                          >
                             Reject
                          </button>
                       </div>
                    </div>
                 ))}
                 {withdrawals.filter(w => w.status === 'pending').length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-sm font-medium">
                       All caught up! No pending requests.
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>

      {showBonusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
             <div className="flex items-center justify-between p-6 border-b border-border">
               <h3 className="text-xl font-bold">Manual Bonus Transfer</h3>
               <button onClick={() => setShowBonusModal(false)} className="text-muted-foreground hover:bg-muted p-1 rounded-full"><X className="w-5 h-5"/></button>
             </div>
             <form onSubmit={submitManualBonus} className="p-6 flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">User ID</label>
                  <input required placeholder="E.g. USER-123" value={bonusForm.userId} onChange={e => setBonusForm({...bonusForm, userId: e.target.value})} className="w-full border border-border rounded-lg bg-background px-4 py-2.5 outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Amount ($)</label>
                  <input required type="number" min="0" step="0.01" value={bonusForm.amount} onChange={e => setBonusForm({...bonusForm, amount: e.target.value})} className="w-full border border-border rounded-lg bg-background px-4 py-2.5 outline-none focus:border-primary font-bold text-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Description / Notes</label>
                  <textarea value={bonusForm.notes} onChange={e => setBonusForm({...bonusForm, notes: e.target.value})} className="w-full border border-border rounded-lg bg-background px-4 py-2.5 outline-none focus:border-primary h-24 resize-none" />
                </div>
                <button disabled={bonusLoading} className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-lg mt-2 shadow-md hover:bg-primary/90 flex items-center justify-center gap-2">
                  {bonusLoading && <RefreshCw className="w-4 h-4 animate-spin"/>}
                  Issue Funds
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
