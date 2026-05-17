import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { UsersRound, Plus, X, Search, Trophy } from 'lucide-react';
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

  useEffect(() => {
    // Set up real-time listener for Teams
    const teamsQuery = query(collection(db, 'teams'), orderBy('createdAt', 'desc'));
    const unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
      const teamsData: any[] = [];
      snapshot.forEach(doc => {
        teamsData.push({ id: doc.id, ...doc.data() });
      });
      setTeams(teamsData);
    }, (error) => {
      console.error("Error listening to teams:", error);
      handleFirestoreError(error, OperationType.LIST, 'teams');
    });

    // Set up real-time listener for Users
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData: any[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to users:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeTeams();
      unsubscribeUsers();
    };
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
        leaderPerformanceScore: 0,
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

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  // Filter candidates who aren't already team leaders
  const leaderCandidates = users.filter(u => u.roleType !== 'team_leader');

  const getLiveTeamStats = (team: any) => {
    // A user is a team member if their explicitly assigned teamId matches, 
    // or if they are a legacy downline (sponsorId == teamLeaderId).
    // (We also include the team leader themselves to be thorough, but we might only want downlines).
    // Let's filter to get members belonging to this team.
    const members = users.filter(u => u.teamId === team.id || u.sponsorId === team.teamLeaderId);
    
    // We can also traverse deeply if needed, but direct sponsorId/teamId should catch most members locally.
    // For large MLM structures, relying on teamId provides the exact group.
    
    // De-duplicate members in case of overlapping criteria
    const uniqueMembers = Array.from(new Set(members.map(u => u.id)))
      .map(id => members.find(u => u.id === id)!);
      
    let computedScore = 0;
    uniqueMembers.forEach(u => {
      // Internal informal score logic: (direct * 5) + ((downline - direct) * 2) + (active * 3)
      // BUT for "global leader rank", the DB aggregates `leaderPerformanceScore`,
      // we can simulate it closely or just use direct aggregation if the DB is unpopulated
      const direct = u.directReferralsCount || 0;
      const downline = u.totalDownlineCount || 0;
      const active = u.activityState === 'active' ? 1 : 0;
      const score = (direct * 5) + ((downline - direct) * 2) + (active * 3);
      computedScore += score;
    });

    return {
      totalMembers: (team.totalDownlineCount || 0) + 1,
      score: team.leaderPerformanceScore || 0
    };
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 border-b border-border pb-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Teams Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Create teams, assign team leaders, and monitor their global rankings.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Create Team
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Teams Grid / List */}
      <div className="bg-card shadow-sm rounded-2xl border border-border flex flex-col">
        <div className="p-6 border-b border-border bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
           <h2 className="font-bold flex items-center gap-2">
             <Trophy className="w-5 h-5 text-primary"/>
             Active Teams Overview
           </h2>
        </div>
        
        <div className="overflow-x-auto">
           <table className="w-full text-sm text-left">
             <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border tracking-wider">
               <tr>
                 <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Team Name</th>
                 <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Leader Name</th>
                 <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Score</th>
                 <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Members</th>
                 <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Status</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
                {teams.length > 0 ? teams.map((team) => {
                  const liveStats = getLiveTeamStats(team);
                  return (
                  <tr key={team.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground">{team.name}</div>
                      <div className="text-xs text-muted-foreground">{team.description || 'No description'}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold uppercase shrink-0">
                         {(team.teamLeaderName || 'U').charAt(0)}
                       </div>
                       {team.teamLeaderName || 'Unknown Leader'}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-primary">
                       {liveStats.score}
                    </td>
                    <td className="px-6 py-4 text-center font-bold">
                       {liveStats.totalMembers}
                    </td>
                    <td className="px-6 py-4 text-center">
                       <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${team.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                         {team.status || 'Active'}
                       </span>
                    </td>
                  </tr>
                )}) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
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
    </div>
  );
}
