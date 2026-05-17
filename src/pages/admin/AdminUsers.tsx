import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, ShieldAlert, CheckCircle, XCircle, Trash2, KeyRound, Plus, X } from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, firebaseConfig } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { buildNetworkStats } from '../../lib/networkUtils';

export default function AdminUsers() {
  const { userData } = useAuth();
  const isSuperAdmin = userData?.role === 'super_admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Add User Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'member',
    referralCode: '',
    sponsorReferralCode: ''
  });

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const usersList: any[] = [];
      snap.forEach(doc => {
        usersList.push({ id: doc.id, ...doc.data() });
      });
      const stats = buildNetworkStats(usersList);
      usersList.forEach(u => {
        const uStats = stats.get(u.id);
        if (uStats) {
           u.calculatedDirectReferrals = uStats.directCount;
           u.calculatedTotalDownline = uStats.downlineCount;
        }
      });
      setUsers(usersList);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setUpdateStatus('Creating new user...');
    
    try {
      // 1. Create user in a secondary auth instance to prevent signing out the admin
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);
      
      const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
      const uid = cred.user.uid;
      
      await secondaryAuth.signOut(); // Clean up

      // 2. Generate referral code if not provided
      let refCode = newUser.referralCode;
      if (!refCode) {
         refCode = (newUser.fullName || 'USER').replace(/\s+/g, '').substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
      } else {
         refCode = refCode.toUpperCase();
      }

      // 3. Create Firestore document
      let userRole = 'member';
      let userRoleType = 'team_member';
      
      if (newUser.role === 'admin') {
         userRole = 'admin';
      } else if (newUser.role === 'super_admin') {
         userRole = 'super_admin';
      } else if (newUser.role === 'team_leader') {
         userRoleType = 'team_leader';
      }

      await setDoc(doc(db, 'users', uid), {
        fullName: newUser.fullName,
        email: newUser.email,
        phoneNumber: '',
        referralCode: refCode,
        sponsorReferralCode: newUser.sponsorReferralCode.toUpperCase(),
        role: userRole,
        roleType: userRoleType,
        accountStatus: 'active',
        currentRank: 'Bronze',
        walletBalance: 0,
        directReferralsCount: 0,
        totalDownlineCount: 0,
        createdAt: new Date()
      });

      setUpdateStatus(`Success: Created user ${newUser.email}`);
      alert('User created successfully!');
      setIsModalOpen(false);
      setNewUser({ fullName: '', email: '', password: '', role: 'member', referralCode: '', sponsorReferralCode: '' });
      fetchUsers();
    } catch (err: any) {
      console.error("Failed to create user:", err);
      setUpdateStatus(`Error creating user: ${err.message}`);
      alert(`Error creating user: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateReferralCode = async (userEmail: string, currentId: string) => {
    const newCode = window.prompt(`Enter new referral code for ${userEmail}:`);
    if (!newCode) return;
    
    try {
      setUpdateStatus(`Updating code for ${userEmail}...`);
      await updateDoc(doc(db, 'users', currentId), { referralCode: newCode.toUpperCase() });
      setUpdateStatus(`Success: Referral code for ${userEmail} updated to ${newCode.toUpperCase()}`);
      alert(`Success! Referral code updated to ${newCode.toUpperCase()}`);
      
      // Refresh user list
      const snap = await getDocs(collection(db, 'users'));
      const usersList: any[] = [];
      snap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
      setUsers(usersList);
    } catch (err: any) {
      console.error(err);
      setUpdateStatus(`Error updating code: ${err.message}`);
      alert(`Error updating code: ${err.message}`);
    }
  };

  const handleChangeRole = async (userId: string, newDisplayRole: string) => {
    let userRole = 'member';
    let userRoleType = 'team_member';
    
    if (newDisplayRole === 'admin') {
       userRole = 'admin';
    } else if (newDisplayRole === 'super_admin') {
       userRole = 'super_admin';
    } else if (newDisplayRole === 'team_leader') {
       userRoleType = 'team_leader';
    }
    
    try {
       setUpdateStatus('Updating role...');
       await updateDoc(doc(db, 'users', userId), { role: userRole, roleType: userRoleType });
       setUpdateStatus('Role updated successfully.');
       
       const snap = await getDocs(collection(db, 'users'));
       const usersList: any[] = [];
       snap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
       setUsers(usersList);
    } catch (err: any) {
       console.error(err);
       setUpdateStatus(`Error updating role: ${err.message}`);
       alert(`Error updating role: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!isSuperAdmin) {
       alert("Only Super Admins can delete users.");
       return;
    }
    
    if (userId === userData?.uid) {
       alert("You cannot delete your own account.");
       return;
    }

    if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY delete the user ${userEmail}? This action cannot be undone.`)) {
       return;
    }

    try {
       setUpdateStatus(`Deleting user ${userEmail}...`);
       await deleteDoc(doc(db, 'users', userId));
       setUpdateStatus(`User ${userEmail} deleted successfully.`);
       
       const snap = await getDocs(collection(db, 'users'));
       const usersList: any[] = [];
       snap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
       setUsers(usersList);
    } catch (err: any) {
       console.error("Failed to delete user:", err);
       setUpdateStatus(`Error deleting user: ${err.message}`);
       alert(`Error deleting user: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {updateStatus && (
        <div className="bg-primary/10 text-primary p-4 rounded-xl border border-primary/20 text-sm font-semibold">
          Operation Status: {updateStatus}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all platform members, administrators, and accounts.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 hover:shadow-md transition-all text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New User
          </button>
        </div>
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">Add New User</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-6">
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Full Name *</label>
                <input 
                  required
                  type="text" 
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                  className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Email Address *</label>
                <input 
                  required
                  type="email" 
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Password *</label>
                <input 
                  required
                  minLength={6}
                  type="password" 
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="••••••••"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-foreground mb-1 block">Role</label>
                  <select 
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && (
                       <>
                         <option value="team_leader">Team Leader</option>
                         <option value="super_admin">Super Admin</option>
                       </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground mb-1 block">Custom Ref Code</label>
                  <input 
                    type="text" 
                    value={newUser.referralCode}
                    onChange={(e) => setNewUser({...newUser, referralCode: e.target.value})}
                    className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 mt-2 border-t border-border">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[100px]"
                >
                  {isCreating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border flex flex-col shadow-sm">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between gap-6">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search users by name, email or code..." 
                className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select className="px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none">
              <option value="">All Ranks</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
            </select>
            <select className="px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none">
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
            </select>
            <select className="px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none">
              <option value="">All Roles</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button className="px-3 py-2 bg-card border border-border rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-foreground">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="table-scroll-container">
          <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">User</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Ref Code</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Sponsor</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Role</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Join Date</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                 <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground whitespace-nowrap">Loading users...</td></tr>
              ) : users.filter(u => u.email.includes(searchTerm.toLowerCase()) || u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || (u.referralCode || '').toLowerCase().includes(searchTerm.toLowerCase())).map(user => (
                <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                        {(user.fullName || 'U').charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{user.fullName || 'Unknown User'}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 font-mono text-xs font-bold text-primary whitespace-nowrap">{user.referralCode || 'NONE'}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-muted-foreground font-medium whitespace-nowrap">{user.sponsorReferralCode || user.sponsorId || 'SYSTEM'}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      {user.currentRank || 'Bronze'}
                    </span>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {isSuperAdmin && user.id !== userData?.uid ? (
                      <select 
                         value={
                            user.role === 'super_admin' ? 'super_admin' :
                            user.role === 'admin' ? 'admin' :
                            user.roleType === 'team_leader' ? 'team_leader' : 'member'
                         }
                         onChange={(e) => handleChangeRole(user.id, e.target.value)}
                         className="bg-transparent border border-border rounded px-2 py-1 text-xs"
                      >
                        <option value="member">Member</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    ) : (
                      user.role === 'admin' || user.role === 'super_admin' ? (
                         <span className="flex items-center gap-1 text-xs font-bold text-destructive uppercase tracking-wider">
                           <ShieldAlert className="w-3 h-3" /> {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                         </span>
                      ) : user.roleType === 'team_leader' ? (
                         <span className="text-xs font-bold text-primary uppercase tracking-wider">Team Leader</span>
                      ) : (
                         <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Member</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {user.accountStatus === 'active' || !user.accountStatus ? (
                      <span className="text-success font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                        Active
                      </span>
                    ) : (
                      <span className="text-destructive font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive"></span>
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-muted-foreground whitespace-nowrap">
                    {user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleUpdateReferralCode(user.email, user.id)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" 
                        title="Edit Referral Code"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Edit User">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {user.accountStatus === 'active' || !user.accountStatus ? (
                        <button className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Suspend User">
                          <XCircle className="w-4 h-4" />
                        </button>
                      ) : (
                        <button className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors" title="Activate User">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {isSuperAdmin && user.id !== userData?.uid && (
                        <button onClick={() => handleDeleteUser(user.id, user.email)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete User">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-border flex justify-between items-center bg-muted/10">
          <span className="text-xs text-muted-foreground font-medium">Showing 1 to 5 of 5 entries</span>
          <div className="flex gap-1">
            <button className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold disabled:opacity-50 text-foreground">Prev</button>
            <button className="px-3 py-1.5 bg-primary border text-primary-foreground border-transparent rounded-lg text-xs font-semibold text-white cursor-default">1</button>
            <button className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold disabled:opacity-50 text-foreground">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
