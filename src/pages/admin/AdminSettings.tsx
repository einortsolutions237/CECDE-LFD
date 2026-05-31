import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, writeBatch, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useTheme } from '../../components/ThemeProvider';
import { RefreshCw, Save, Settings, Shield, Bell, Palette, Database, CheckCircle, AlertTriangle, Monitor, Moon, Sun, DollarSign, Award } from 'lucide-react';

export default function AdminSettings() {
  const { theme, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  const [settings, setSettings] = useState({
    platformName: 'AI Studio Builders',
    contactEmail: 'admin@example.com',
    allowRegistrations: true,
    maintenanceMode: false,
    
    // Legacy ranking settings
    pointsPerDirectRef: 5,
    pointsPerIndirectRef: 2,
    pointsPerActiveMember: 3,
    
    // Security & Compliance
    maxLoginAttempts: 5,
  });

  const [loading, setLoading] = useState(true);
  const [ranks, setRanks] = useState<any[]>([
    { name: 'Crown Ambassador', directs: 20, downline: 1000, activeDownline: 100 },
    { name: 'Diamond', directs: 15, downline: 500, activeDownline: 50 },
    { name: 'Team Leader', directs: 20, downline: 50, activeDownline: 0 },
    { name: 'Platinum', directs: 10, downline: 100, activeDownline: 25 },
    { name: 'Gold', directs: 8, downline: 50, activeDownline: 15 },
    { name: 'Silver', directs: 5, downline: 20, activeDownline: 5 },
    { name: 'Bronze', directs: 3, downline: 5, activeDownline: 2 }
  ]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'system_settings', 'global');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSettings(prev => ({ ...prev, ...snap.data() }));
        }

        const rankRef = doc(db, 'system_settings', 'ranks');
        const rankSnap = await getDoc(rankRef);
        if (rankSnap.exists() && rankSnap.data().ranks) {
          setRanks(rankSnap.data().ranks);
        }
      } catch (err: any) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleRankChange = (index: number, key: string, value: number) => {
    const newRanks = [...ranks];
    newRanks[index] = { ...newRanks[index], [key]: value };
    setRanks(newRanks);
  };

  const handleSaveSettings = async () => {
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const docRef = doc(db, 'system_settings', 'global');
      await setDoc(docRef, settings, { merge: true });

      const rankRef = doc(db, 'system_settings', 'ranks');
      await setDoc(rankRef, { ranks }, { merge: true });

      setConfigMessage({ type: 'success', text: 'System settings updated successfully.' });
      setTimeout(() => setConfigMessage(null), 3000);
    } catch (err: any) {
      console.error(err);
      setConfigMessage({ type: 'error', text: 'Failed to update system settings.' });
      handleFirestoreError(err, OperationType.WRITE, 'system_settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSyncDownlines = async () => {
    setSyncing(true);
    setSyncResult('Fetching users...');
    try {
      const q = collection(db, 'users');
      const snap = await getDocs(q);
      const users: Record<string, any> = {};
      const downlineCounts: Record<string, number> = {};
      
      snap.forEach(d => {
        users[d.id] = d.data();
        downlineCounts[d.id] = 0;
      });

      setSyncResult('Calculating exact downlines...');
      
      // Calculate true downlines for everyone
      Object.keys(users).forEach(uid => {
         let currentSponsor = users[uid].sponsorId;
         let levels = 0;
         while (currentSponsor && users[currentSponsor] && levels < 100) {
            downlineCounts[currentSponsor] += 1;
            currentSponsor = users[currentSponsor].sponsorId;
            levels++;
         }
      });

      setSyncResult('Updating database...');
      
      // Batch update
      let batch = writeBatch(db);
      let count = 0;
      let totalUpdated = 0;

      for (const uid of Object.keys(users)) {
         const uRef = doc(db, 'users', uid);
         const nRef = doc(db, 'network', uid);
         batch.update(uRef, { totalDownlineCount: downlineCounts[uid] });
         batch.update(nRef, { totalDownlineCount: downlineCounts[uid] });
         count++;
         totalUpdated++;
         
         if (count === 200) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
         }
      }
      if (count > 0) {
         await batch.commit();
      }
      setSyncResult(`Success! Synchronized downline counts for ${totalUpdated} users.`);

    } catch (err: any) {
      console.error(err);
      setSyncResult('Error: ' + err.message);
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="p-10 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Top-Level Settings</h1>
          <p className="text-sm font-medium text-muted-foreground">Configure global parameters and system behaviors.</p>
        </div>
        <button
          onClick={handleSaveSettings}
          disabled={savingConfig}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl shadow-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingConfig ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span>Save All Settings</span>
        </button>
      </div>

      {configMessage && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${configMessage.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
           {configMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
           <span className="font-medium">{configMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appearance Settings */}
        <div className="card p-0 overflow-hidden flex flex-col lg:col-span-2 border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Palette className="w-6 h-6 text-indigo-500" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Appearance</h2>
           </div>
           <div className="p-6">
              <p className="text-sm text-foreground mb-4">Select your preferred theme for the admin dashboard.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-card'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-900">
                       <Sun className="w-6 h-6" />
                    </div>
                    <span className="font-semibold text-foreground">Light Mode</span>
                  </button>

                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-card'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-slate-100">
                       <Moon className="w-6 h-6" />
                    </div>
                    <span className="font-semibold text-foreground">Dark Mode</span>
                  </button>

                  <button
                    onClick={() => setTheme('system')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'system' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-card'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-800 flex items-center justify-center text-white">
                       <Monitor className="w-6 h-6 drop-shadow-md" />
                    </div>
                    <span className="font-semibold text-foreground">System Default</span>
                  </button>
              </div>
           </div>
        </div>

        {/* Core Settings */}
        <div className="card p-0 overflow-hidden flex flex-col border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Settings className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">General Configuration</h2>
           </div>
           <div className="p-6 flex flex-col gap-5 flex-1">
              <div>
                 <label className="block text-sm font-medium text-muted-foreground mb-1">Platform Name</label>
                 <input 
                   type="text" 
                   value={settings.platformName}
                   onChange={(e) => handleSettingChange('platformName', e.target.value)}
                   className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                 />
              </div>
              <div>
                 <label className="block text-sm font-medium text-muted-foreground mb-1">Support Contact Email</label>
                 <input 
                   type="email" 
                   value={settings.contactEmail}
                   onChange={(e) => handleSettingChange('contactEmail', e.target.value)}
                   className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                 />
              </div>
           </div>
        </div>

        {/* Security & Access */}
        <div className="card p-0 overflow-hidden flex flex-col border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Shield className="w-6 h-6 text-destructive" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Access & Security</h2>
           </div>
           <div className="p-6 flex flex-col gap-6 flex-1">
              <label className="flex items-center justify-between cursor-pointer group">
                 <div>
                    <h3 className="font-bold group-hover:text-primary transition-colors">Allow New Registrations</h3>
                    <p className="text-sm text-muted-foreground">Enable or disable new user signups.</p>
                 </div>
                 <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.allowRegistrations} onChange={(e) => handleSettingChange('allowRegistrations', e.target.checked)} />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                 </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                 <div>
                    <h3 className="font-bold group-hover:text-destructive transition-colors">Maintenance Mode</h3>
                    <p className="text-sm text-muted-foreground">Restrict access to super admins only.</p>
                 </div>
                 <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.maintenanceMode} onChange={(e) => handleSettingChange('maintenanceMode', e.target.checked)} />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-destructive"></div>
                 </div>
              </label>
           </div>
        </div>

        <div className="card p-0 overflow-hidden flex flex-col border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Award className="w-6 h-6 text-purple-500" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Rank Configuration Center</h2>
           </div>
           <div className="p-6 flex flex-col gap-6 flex-1">
              <p className="text-sm text-muted-foreground mb-2">Configure requirements for progression ranks. Users achieving these ranks automatically receive email notifications and UI badges.</p>
              
              <div className="space-y-4">
                 {ranks.map((rank, idx) => (
                   <div key={rank.name} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-muted/30 p-3 rounded-lg border border-border">
                      <div className="font-bold flex items-center gap-2">
                        <span>{rank.name}</span>
                        {rank.name === 'Team Leader' && <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-500/10 text-purple-600 px-2 py-1 rounded">Email Enabled</span>}
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-muted-foreground mb-1">Min Directs</label>
                         <input 
                           type="number" 
                           value={rank.directs} 
                           onChange={(e) => handleRankChange(idx, 'directs', parseInt(e.target.value) || 0)}
                           className="w-full bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" 
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-muted-foreground mb-1">Min Total Downline</label>
                         <input 
                           type="number" 
                           value={rank.downline} 
                           onChange={(e) => handleRankChange(idx, 'downline', parseInt(e.target.value) || 0)}
                           className="w-full bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" 
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-medium text-muted-foreground mb-1">Min Active Downline</label>
                         <input 
                           type="number" 
                           value={rank.activeDownline} 
                           onChange={(e) => handleRankChange(idx, 'activeDownline', parseInt(e.target.value) || 0)}
                           className="w-full bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" 
                         />
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Gamification & Points */}
        <div className="card p-0 overflow-hidden flex flex-col lg:col-span-2 border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Palette className="w-6 h-6 text-yellow-500" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Points & Gamification Drivers</h2>
           </div>
           <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                 <label className="block text-sm font-medium text-muted-foreground mb-1">Pts per Direct Referral</label>
                 <input 
                   type="number" 
                   value={settings.pointsPerDirectRef}
                   onChange={(e) => handleSettingChange('pointsPerDirectRef', parseInt(e.target.value) || 0)}
                   className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-lg"
                 />
              </div>
              <div>
                 <label className="block text-sm font-medium text-muted-foreground mb-1">Pts per Indirect Referral</label>
                 <input 
                   type="number" 
                   value={settings.pointsPerIndirectRef}
                   onChange={(e) => handleSettingChange('pointsPerIndirectRef', parseInt(e.target.value) || 0)}
                   className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-lg"
                 />
              </div>
               <div>
                 <label className="block text-sm font-medium text-muted-foreground mb-1">Pts per Active Member</label>
                 <input 
                   type="number" 
                   value={settings.pointsPerActiveMember}
                   onChange={(e) => handleSettingChange('pointsPerActiveMember', parseInt(e.target.value) || 0)}
                   className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-lg"
                 />
              </div>
           </div>
        </div>

        {/* Database & Sync Tools */}
        <div className="card p-0 overflow-hidden flex flex-col lg:col-span-2 border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Database className="w-6 h-6 text-blue-500" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Database Tools & Utilities</h2>
           </div>
           <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-6">
              <div className="flex-1">
                 <h3 className="font-bold text-foreground mb-1">Sync Network Downline Counts</h3>
                 <p className="text-sm text-muted-foreground mb-4">
                   This heavy operation traverses the entire user tree and recalculates the exact <code>totalDownlineCount</code> for all users. Do not run this frequently. Use this only if the numbers become structurally out of sync due to missing transactions.
                 </p>
                 <button
                   onClick={handleSyncDownlines}
                   disabled={syncing}
                   className="flex items-center gap-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 px-5 py-2.5 rounded-xl hover:bg-blue-500/20 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                   {syncing ? 'Re-calculating Tree Data...' : 'Run Tree Recalculation Task'}
                 </button>
                 {syncResult && (
                    <div className="mt-4 p-4 rounded-xl bg-muted text-xs font-mono border border-border max-h-[150px] overflow-y-auto">
                      {syncResult}
                    </div>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
