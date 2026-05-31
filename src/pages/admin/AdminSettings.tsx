import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, writeBatch, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useTheme } from '../../components/ThemeProvider';
import { RefreshCw, Save, Settings, Shield, Bell, Palette, Database, CheckCircle, AlertTriangle, Monitor, Moon, Sun, Trophy } from 'lucide-react';

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

  const [ranks, setRanks] = useState<Record<string, any>>({
    'Crown Ambassador': { minDirect: 20, minTeamSize: 1000, minActiveDirect: 0, minActiveTeam: 100 },
    'Diamond': { minDirect: 15, minTeamSize: 500, minActiveDirect: 0, minActiveTeam: 50 },
    'Platinum': { minDirect: 10, minTeamSize: 100, minActiveDirect: 0, minActiveTeam: 25 },
    'Gold': { minDirect: 8, minTeamSize: 50, minActiveDirect: 0, minActiveTeam: 15 },
    'Silver': { minDirect: 5, minTeamSize: 20, minActiveDirect: 5, minActiveTeam: 0 },
    'Bronze': { minDirect: 3, minTeamSize: 5, minActiveDirect: 2, minActiveTeam: 0 }
  });

  const [loading, setLoading] = useState(true);

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
        if (rankSnap.exists() && Object.keys(rankSnap.data()).length > 0) {
           setRanks(rankSnap.data());
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

  const handleRankChange = (rankName: string, key: string, value: any) => {
    setRanks(prev => ({
       ...prev,
       [rankName]: { ...prev[rankName], [key]: parseInt(value) || 0 }
    }));
  };

  const handleSaveSettings = async () => {
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const docRef = doc(db, 'system_settings', 'global');
      await setDoc(docRef, settings, { merge: true });
      
      const rankRef = doc(db, 'system_settings', 'ranks');
      await setDoc(rankRef, ranks);

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

        {/* Rank Configuration Center */}
        <div className="card p-0 overflow-hidden flex flex-col lg:col-span-2 border border-border">
           <div className="p-6 border-b border-border flex items-center gap-3 bg-muted/20">
              <Trophy className="w-6 h-6 text-orange-500" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Rank Configuration Center</h2>
           </div>
           <div className="p-6">
               <p className="text-sm text-foreground mb-6">Dynamically configure the minimum requirements for each rank. The ranking engine uses these values.</p>
               <div className="flex flex-col gap-6">
                   {Object.keys(ranks).map(rank => (
                       <div key={rank} className="bg-background border border-border p-5 rounded-xl">
                           <h3 className="font-bold text-lg mb-4 text-foreground">{rank} Requirements</h3>
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                               <div>
                                   <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Min Directs</label>
                                   <input 
                                      type="number" 
                                      value={ranks[rank].minDirect}
                                      onChange={(e) => handleRankChange(rank, 'minDirect', e.target.value)}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                   />
                               </div>
                               <div>
                                   <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Min Team Size</label>
                                   <input 
                                      type="number" 
                                      value={ranks[rank].minTeamSize}
                                      onChange={(e) => handleRankChange(rank, 'minTeamSize', e.target.value)}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                   />
                               </div>
                               <div>
                                   <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Min Active Directs</label>
                                   <input 
                                      type="number" 
                                      value={ranks[rank].minActiveDirect}
                                      onChange={(e) => handleRankChange(rank, 'minActiveDirect', e.target.value)}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                   />
                               </div>
                               <div>
                                   <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Min Active Team</label>
                                   <input 
                                      type="number" 
                                      value={ranks[rank].minActiveTeam}
                                      onChange={(e) => handleRankChange(rank, 'minActiveTeam', e.target.value)}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                   />
                               </div>
                           </div>
                       </div>
                   ))}
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
                 <h3 className="font-bold text-foreground mb-1">Trigger System Integrity Repair</h3>
                 <p className="text-sm text-muted-foreground mb-4">
                   This pushes all users into a smart repair queue which recalculates total downline sizes and directs. It runs asynchronously in the backend and performs tree reconstruction.
                 </p>
                 <button
                   onClick={async () => {
                       try {
                          setSyncing(true);
                          setSyncResult('Dispatching system integrity repair job...');
                          const { httpsCallable } = await import('firebase/functions');
                          const { functions } = await import('../../lib/firebase');
                          const validator = httpsCallable(functions, 'validateSystemIntegrity');
                          const res: any = await validator();
                          setSyncResult(res.data.message);
                       } catch(e: any) {
                          setSyncResult('Error: ' + e.message);
                       } finally {
                          setSyncing(false);
                       }
                   }}
                   disabled={syncing}
                   className="flex items-center gap-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 px-5 py-2.5 rounded-xl hover:bg-blue-500/20 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                   {syncing ? 'Dispatching...' : 'Run Integrity Validator Queue'}
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
