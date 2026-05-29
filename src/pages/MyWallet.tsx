import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Wallet, ArrowDownRight, ArrowUpRight, DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function MyWallet() {
  const { user, userData } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWalletData();
    }
  }, [user]);

  const fetchWalletData = async () => {
    setLoading(true);
    try {
      // Get exact balance from wallet ledger or fall back to user data for legacy support
      const walletDoc = await getDoc(doc(db, 'wallets', user!.uid));
      if (walletDoc.exists()) {
         setBalance(walletDoc.data().balance);
      } else if (userData?.walletBalance) {
         setBalance(userData.walletBalance);
      } else {
         setBalance(0);
      }

      const txQuery = query(collection(db, 'transactions'), where('userId', '==', user!.uid), orderBy('timestamp', 'desc'));
      const txSnap = await getDocs(txQuery);
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const wxQuery = query(collection(db, 'withdrawals'), where('userId', '==', user!.uid), orderBy('createdAt', 'desc'));
      const wxSnap = await getDocs(wxQuery);
      setWithdrawals(wxSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const reqAmount = parseFloat(amount);
    
    if (!reqAmount || reqAmount <= 0) {
       alert('Please enter a valid amount.');
       return;
    }
    
    // Naive frontend check, true check is in Firestore Rules/Functions
    if (reqAmount > balance) {
       alert('Insufficient balance.');
       return;
    }

    setRequesting(true);
    try {
      // In a real implementation, you would trigger a Cloud Function or directly request
      const wRef = doc(collection(db, 'withdrawals'));
      await setDoc(wRef, {
         userId: user!.uid,
         amount: reqAmount,
         method: method,
         status: 'pending',
         createdAt: Date.now()
      });
      
      alert('Withdrawal requested successfully. Waiting for admin approval.');
      setAmount('');
      fetchWalletData();
    } catch (err: any) {
      console.error(err);
      alert('Error requesting withdrawal: ' + err.message);
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
     return <div className="p-8 text-center text-muted-foreground min-h-[50vh] flex items-center justify-center">Loading Immutable Ledger...</div>;
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-end mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="w-8 h-8 text-primary" /> My Ledger
          </h1>
          <p className="text-sm font-medium text-muted-foreground mt-2">Enterprise-grade immutable financial records.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="md:col-span-1 flex flex-col gap-6">
            <div className="card flex items-center gap-4 bg-gradient-to-br from-card via-card to-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
                <div className="p-4 bg-primary/20 text-primary rounded-full">
                   <DollarSign className="w-8 h-8" />
                </div>
                <div>
                   <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Available Balance</p>
                   <p className="text-4xl font-extrabold text-foreground">${balance.toFixed(2)}</p>
                </div>
            </div>
            
            <div className="card border border-border flex flex-col">
               <h3 className="text-lg font-bold mb-4">Request Withdrawal</h3>
               <form onSubmit={handleWithdrawalRequest} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1">Amount ($)</label>
                    <input 
                       type="number" min="10" step="0.01" 
                       value={amount} onChange={e => setAmount(e.target.value)} 
                       className="w-full border border-border rounded-lg bg-background px-4 py-2 font-bold text-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none" required 
                     />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1">Method</label>
                    <select 
                       value={method} onChange={e => setMethod(e.target.value)} 
                       className="w-full border border-border rounded-lg bg-background px-4 py-2 font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                     >
                       <option value="bank">Bank Transfer</option>
                       <option value="crypto">Cryptocurrency</option>
                       <option value="paypal">PayPal</option>
                    </select>
                  </div>
                  <button 
                     disabled={requesting}
                     className="mt-2 bg-primary text-white font-bold py-3 rounded-lg shadow-md hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                     {requesting ? 'Processing...' : 'Submit Request'}
                  </button>
               </form>
            </div>
         </div>
         
         <div className="md:col-span-2 flex flex-col gap-6">
            <div className="card p-0 overflow-hidden flex flex-col flex-1 border border-border">
               <div className="p-6 border-b border-border bg-muted/20">
                  <h3 className="text-xl font-bold">Transaction History</h3>
               </div>
               {transactions.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground font-medium">
                     No transactions found.
                  </div>
               ) : (
                  <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs tracking-wider">
                           <tr>
                              <th className="px-6 py-4 font-semibold text-left">Date</th>
                              <th className="px-6 py-4 font-semibold text-left">Type</th>
                              <th className="px-6 py-4 font-semibold text-right">Amount</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                           {transactions.map(tx => (
                               <tr key={tx.id} className="hover:bg-muted/20">
                                  <td className="px-6 py-4">
                                     {new Date(tx.timestamp).toLocaleString()}
                                  </td>
                                  <td className="px-6 py-4 capitalize font-semibold flex items-center gap-2">
                                     {tx.amount > 0 ? <ArrowDownRight className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-blue-500" />}
                                     {tx.type}
                                  </td>
                                  <td className={`px-6 py-4 font-bold text-right ${tx.amount > 0 ? 'text-success' : 'text-foreground'}`}>
                                     {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                                  </td>
                               </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               )}
            </div>
            
            <div className="card p-0 overflow-hidden flex flex-col flex-1 border border-border">
               <div className="p-6 border-b border-border bg-muted/20 flex gap-2 items-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <h3 className="text-xl font-bold">Withdrawal Requests</h3>
               </div>
               {withdrawals.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground font-medium">
                     No requests found.
                  </div>
               ) : (
                  <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs tracking-wider">
                           <tr>
                              <th className="px-6 py-4 font-semibold text-left">Date</th>
                              <th className="px-6 py-4 font-semibold text-left">Method</th>
                              <th className="px-6 py-4 font-semibold text-right">Amount</th>
                              <th className="px-6 py-4 font-semibold text-center">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                           {withdrawals.map(w => (
                               <tr key={w.id} className="hover:bg-muted/20">
                                  <td className="px-6 py-4">
                                     {new Date(w.createdAt).toLocaleString()}
                                  </td>
                                  <td className="px-6 py-4 font-semibold capitalize">
                                     {w.method}
                                  </td>
                                  <td className="px-6 py-4 font-bold text-right">
                                     ${w.amount.toFixed(2)}
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                     {w.status === 'pending' && <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-600 px-3 py-1 rounded-full text-xs font-bold uppercase"><Clock className="w-3 h-3"/> Pending</span>}
                                     {w.status === 'approved' && <span className="inline-flex items-center gap-1 bg-success/10 text-success px-3 py-1 rounded-full text-xs font-bold uppercase"><CheckCircle className="w-3 h-3"/> Approved</span>}
                                     {w.status === 'rejected' && <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive px-3 py-1 rounded-full text-xs font-bold uppercase"><XCircle className="w-3 h-3"/> Rejected</span>}
                                  </td>
                               </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
}
