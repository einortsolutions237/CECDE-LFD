import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, setDoc, updateDoc, serverTimestamp, onSnapshot, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { UsersRound, Plus, X, Search, Trophy, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AdminTeams() {
  const { userData } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<any>(null);

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    setSubmitting(true);
    setError('');
    
    try {
      const teamId = teamToDelete.id;
      
      // Delete the team document directly. The backend Cloud Function
      // will handle cleaning up team leader and member references.
      await updateDoc(doc(db, 'teams', teamId), { status: 'deleted' });
      
      setIsDeleteModalOpen(false);
      setTeamToDelete(null);
    } catch (err: any) {
      console.error("Error deleting team:", err);
      setError(err.message || 'Error deleting team.');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchTeamsAndUsers = async () => {
    try {
      setLoading(true);
      const teamsSnap = await getDocs(query(collection(db, 'teams'), orderBy('createdAt', 'desc')));
      const usersSnap = await getDocs(query(collection(db, 'users')));

      const teamsData: any[] = [];
      teamsSnap.forEach(doc => {
        const data = doc.data();
        if (data.status !== 'deleted') {
          teamsData.push({ id: doc.id, ...data });
        }
      });
      setTeams(teamsData);

      const usersData: any[] = [];
      usersSnap.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching data:", error);
      handleFirestoreError(error, OperationType.LIST, 'teams_and_users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamsAndUsers();
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !selectedLeaderId) {
      setError('Team name and a leader are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    
    try {
      const leader = users.find(u => u.id === selectedLeaderId);
      if (!leader) throw new Error("Leader not found");

      const newTeamRef = doc(collection(db, 'teams'));
      const teamId = newTeamRef.id;

      const teamData = {
        name: newTeamName,
        description: newTeamDesc,
        teamLeaderId: leader.id,
        teamLeaderName: leader.fullName || leader.email || 'Unknown',
        status: 'active',
        totalMembers: 0,
        activeMembers: 0,
        directReferrals: 0,
        indirectReferrals: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Create team document
      await setDoc(newTeamRef, teamData);

      // Update the user to be a team leader and assign teamId
      const userRef = doc(db, 'users', leader.id);
      await updateDoc(userRef, {
        roleType: 'team_leader',
        teamId: teamId
      });

      // Reset form & Refresh
      setNewTeamName('');
      setNewTeamDesc('');
      setSelectedLeaderId('');
      setIsCreateModalOpen(false);
    } catch (err: any) {
       console.error("Error creating team:", err);
       setError(err.message || 'Error creating team.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurgeAllTeams = async () => {
    if (!window.confirm("WARNING: This will permanently delete ALL teams and reset all users who are team leaders back to members with no team affiliation. Are you absolutely sure?")) return;
    setSubmitting(true);
    setError('');
    
    try {
      let batch = writeBatch(db);
      let ops = 0;
      let count = 0;
      let numTeams = 0;
      
      const commitSync = async () => {
         if (ops > 0) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
         }
      };

      // 1. Delete all teams
      const teamsSnap = await getDocs(query(collection(db, 'teams')));
      for (const docSnap of teamsSnap.docs) {
         batch.update(docSnap.ref, { status: 'deleted', totalMembers: 0, activeMembers: 0, leaderDirectReferralsCount: 0 });
         ops++;
         numTeams++;
         if (ops >= 450) await commitSync();
      }
      
      // 2. Clear out team leaders
      const usersSnap = await getDocs(query(collection(db, 'users')));
      for (const docSnap of usersSnap.docs) {
         const uData = docSnap.data();
         if (uData.roleType === 'team_leader' || uData.teamId) {
             batch.update(docSnap.ref, { roleType: 'member', teamId: null });
             count++;
             ops++;
             if (ops >= 450) await commitSync();
         }
      }
      
      await commitSync();
      alert(`Purge successful. Deleted ${numTeams} teams and reset ${count} members.`);
    } catch (err: any) {
      console.error("Error purging teams:", err);
      setError(err.message || 'Error purging teams.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  // Filter candidates who aren't already team leaders
  const leaderCandidates = users.filter(u => u.roleType !== 'team_leader');

  const getLiveTeamStats = (team: any) => {
    let calculatedTotal = 1; // Team leader
    // Find all users in this team
    const teamMembers = users.filter(u => u.teamId === team.id);
    let memberCount = 0;
    
    for (const member of teamMembers) {
       // if member is the leader, skip (already counted)
       if (member.id === team.teamLeaderId) continue;
       // Add member themselves (1) + their indirect downline
       calculatedTotal += 1 + (member.totalDownlineCount || 0);
       memberCount++;
    }
    
    // Fallback if no explicit members assigned by teamId yet, use leader's entire downline tracking
    if (memberCount === 0) {
        const leader = users.find(u => u.id === team.teamLeaderId);
        calculatedTotal = (leader ? (leader.totalDownlineCount || 0) : 0) + (leader ? 1 : 0);
    }

    return {
      totalMembers: calculatedTotal
    };
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Teams Management</h1>
          <p className="text-sm font-medium text-muted-foreground">Create teams and assign team leaders.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePurgeAllTeams}
            disabled={submitting}
            className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-xl font-bold hover:bg-destructive hover:text-white transition-all shadow-sm disabled:opacity-50"
          >
            <AlertTriangle className="w-5 h-5" />
            {submitting ? 'Purging...' : 'Purge All Teams'}
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Create Team
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Teams Grid / List */}
      <div className="card p-0 flex flex-col overflow-hidden border border-border">
        <div className="p-6 border-b border-border bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
           <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
             <Trophy className="w-5 h-5 text-primary"/>
             Active Teams Overview
           </h2>
        </div>
        
        <div className="table-scroll-container">
           <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
             <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border tracking-wider whitespace-nowrap">
               <tr>
                 <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Team Name</th>
                 <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Leader Name</th>
                 <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Total Team Members</th>
                 <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Status</th>
                 <th className="px-4 py-3 md:px-6 md:py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
                {teams.length > 0 ? teams.map((team) => {
                  const liveStats = getLiveTeamStats(team);
                  return (
                  <tr key={team.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                      <div className="font-bold text-foreground">{team.name}</div>
                      <div className="text-xs text-muted-foreground">{team.description || 'No description'}</div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-foreground flex items-center gap-3 whitespace-nowrap">
                       <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold uppercase shrink-0">
                         {(team.teamLeaderName || 'U').charAt(0)}
                       </div>
                       <div className="flex items-center gap-2">
                         <span>{team.teamLeaderName || 'Unknown Leader'}</span>
                         <span className="badge bg-muted text-muted-foreground px-2 py-0.5 rounded">
                           {users.find(u => u.id === team.teamLeaderId)?.currentRank || 'Member'}
                         </span>
                       </div>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                       {liveStats.totalMembers}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center whitespace-nowrap">
                       <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${team.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                         {team.status || 'Active'}
                       </span>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setTeamToDelete(team);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors border border-transparent hover:border-destructive/20"
                        title="Delete Team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )}) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">
                      No teams found. Create your first team!
                    </td>
                  </tr>
                )}
             </tbody>
           </table>
        </div>
      </div>

      {/* Create Team Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <UsersRound className="w-5 h-5 text-primary" />
                Create New Team
              </h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTeam} className="p-6 flex flex-col gap-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-foreground">Team Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. ALPHA Squad"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-foreground">Team Description</label>
                <input 
                  type="text"
                  placeholder="Optional description"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-foreground">Assign Team Leader</label>
                <select
                  required
                  value={selectedLeaderId}
                  onChange={(e) => setSelectedLeaderId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                >
                  <option value="" disabled>Select a user to promote</option>
                  {leaderCandidates.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email} {u.currentRank ? `(${u.currentRank})` : ''}
                    </option>
                  ))}
                  {leaderCandidates.length === 0 && (
                    <option disabled>No valid candidates available</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Only users who are not already a team leader are shown.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-border mt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 text-sm"
                >
                  {submitting ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Team Modal */}
      {isDeleteModalOpen && teamToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl border border-destructive/20 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-destructive/5 text-destructive">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Confirm Team Deletion
              </h3>
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setTeamToDelete(null);
                }}
                className="p-1.5 hover:bg-destructive/10 text-destructive/70 hover:text-destructive rounded-lg transition-colors"
                disabled={submitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-destructive">WARNING: DANGEROUS ACTION</p>
                <p className="text-sm text-foreground">
                  You are about to delete the team <strong>{teamToDelete.name}</strong>.
                </p>
                <p className="text-sm text-foreground">
                  This action will <strong className="text-destructive">permanently delete</strong> the team. The team leader will be demoted, and <strong>all members</strong> will have their team affiliation reset to SYSTEM. They will not be deleted from the system entirely.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setTeamToDelete(null);
                  }}
                  className="px-4 py-2 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors text-sm"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteTeam}
                  disabled={submitting}
                  className="px-6 py-2 bg-destructive text-destructive-foreground font-semibold rounded-xl hover:bg-destructive/90 transition-colors shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {submitting ? 'Deleting...' : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Yes, Delete Team
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
