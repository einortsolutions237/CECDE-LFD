import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../components/ThemeProvider';
import { User, Lock, Bell, Link as LinkIcon, Save, Moon, Sun, Monitor, Palette, Loader2 } from 'lucide-react';
import { countries } from '../lib/countries';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Settings() {
  const { userData } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userData?.uid) return;

    const formData = new FormData(e.currentTarget);
    const fullName = formData.get('fullName') as string;
    const phone = formData.get('phone') as string;
    const country = formData.get('country') as string;

    setIsSaving(true);
    setSaveError('');
    setSaveSuccess('');

    try {
      await updateDoc(doc(db, 'users', userData.uid), {
        fullName,
        phone,
        country
      });
      setSaveSuccess('Profile successfully updated.');
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'referral', label: 'Referral Settings', icon: LinkIcon },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      <div className="mb-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm font-medium text-muted-foreground mt-1">Manage your account preferences and configurations.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-col gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${isActive ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm'}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 card p-8 border border-border">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground border-b border-border pb-4 mb-2">Profile Information</h2>
              
              {saveSuccess && (
                <div className="p-3 bg-success/10 text-success rounded-lg text-sm font-medium">
                  {saveSuccess}
                </div>
              )}
              {saveError && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm font-medium">
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-6 mb-2">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold border-2 border-primary/20 shrink-0">
                  {userData?.fullName?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" className="btn-secondary w-fit">
                     Upload Photo
                  </button>
                  <p className="text-xs text-muted-foreground">JPG, GIF or PNG. 1MB max.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-foreground">Full Name</label>
                  <input type="text" name="fullName" defaultValue={userData?.fullName} className="input-field" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-foreground">Email Address</label>
                  <input type="email" defaultValue={userData?.email} disabled className="px-3 py-2 bg-muted border border-border rounded-lg text-sm opacity-70 cursor-not-allowed text-foreground" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-foreground">Phone Number</label>
                  <input type="text" name="phone" defaultValue={userData?.phone || ''} className="input-field" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-foreground">Country</label>
                  <select name="country" className="input-field" defaultValue={userData?.country || ''}>
                    <option value="" disabled>Select your country</option>
                    {countries.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.dialCode} {country.code} - {country.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 pt-6 border-t border-border flex justify-end">
                <button type="submit" disabled={isSaving} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
             <div className="flex flex-col gap-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground border-b border-border pb-4 mb-2">Security & Password</h2>
                <div className="space-y-4 max-w-md">
                   <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-foreground">Current Password</label>
                      <input type="password" placeholder="••••••••" className="input-field" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-foreground">New Password</label>
                      <input type="password" placeholder="••••••••" className="input-field" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-foreground">Confirm New Password</label>
                      <input type="password" placeholder="••••••••" className="input-field" />
                   </div>
                </div>
                <div className="mt-4 pt-6 border-t border-border flex justify-end">
                  <button className="btn-primary">
                    Update Password
                  </button>
                </div>
             </div>
          )}

          {activeTab === 'appearance' && (
            <div className="flex flex-col gap-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground border-b border-border pb-4 mb-2">Appearance</h2>
              <div className="flex flex-col gap-6">
                <p className="text-sm text-foreground">Select your preferred theme for the application.</p>
                
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
          )}

          {activeTab === 'notifications' && (
             <div className="flex flex-col gap-8">
                 <h2 className="text-2xl font-bold tracking-tight text-foreground border-b border-border pb-4 mb-2">Notification Preferences</h2>
                 <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <div>
                          <p className="font-semibold text-foreground text-sm">Email Notifications</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Receive an email when new referrals join your downline.</p>
                       </div>
                       <div className="w-10 h-5 bg-primary rounded-full relative cursor-pointer shadow-inner">
                          <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow"></div>
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div>
                          <p className="font-semibold text-foreground text-sm">Rank Upgrade Alerts</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Get notified immediately upon rank progression.</p>
                       </div>
                       <div className="w-10 h-5 bg-primary rounded-full relative cursor-pointer shadow-inner">
                          <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow"></div>
                       </div>
                    </div>
                    <div className="flex items-center justify-between opacity-60">
                       <div>
                          <p className="font-semibold text-foreground text-sm">Marketing Emails</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Weekly newsletters and marketing materials.</p>
                       </div>
                       <div className="w-10 h-5 bg-muted-foreground/30 rounded-full relative cursor-pointer shadow-inner">
                          <div className="w-4 h-4 bg-white rounded-full absolute left-0.5 top-0.5 shadow"></div>
                       </div>
                    </div>
                 </div>
             </div>
          )}

          {activeTab === 'referral' && (
            <div className="flex flex-col gap-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground border-b border-border pb-4 mb-2">Referral Configuration</h2>
              <div className="space-y-6">
                 <div className="flex flex-col gap-1.5 max-w-md">
                    <label className="text-sm font-semibold text-foreground">Custom Referral Code</label>
                    <div className="flex items-center gap-3">
                      <input type="text" defaultValue={userData?.referralCode} disabled className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground flex-1 opacity-70 cursor-not-allowed" />
                      <button className="btn-secondary whitespace-nowrap">
                        Request Change
                      </button>
                    </div>
                 </div>
                 <p className="text-xs text-muted-foreground max-w-md">Custom referral codes are subject to admin approval to prevent abuse and duplication.</p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
