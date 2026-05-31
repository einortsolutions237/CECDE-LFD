import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Trophy, Users, TrendingUp, X, AlertTriangle } from 'lucide-react';

export default function AdminRankings() {
  const [teamLeaders, setTeamLeaders] = useState<any[]>([]);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingIndividuals, setLoadingIndividuals] = useState(true);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [isWipeIndividualsModalOpen, setIsWipeIndividualsModalOpen] = useState(false);
  const [wipeIndividualsConfirmText, setWipeIndividualsConfirmText] = useState('');
  const [isWipingIndividuals, setIsWipingIndividuals] = useState(false);

  useEffect(() => {
    const fetchTeamLeaders = async () => {
      try {
        const q = query(collection(db, 'teams'), orderBy('totalMembers', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        const data: any[] = [];
        snapshot.forEach(doc => {
          if (doc.data().status !== 'deleted') {
            data.push({ id: doc.id, ...doc.data() });
          }
        });

        const usersSnap = await getDocs(collection(db, 'users'));
        const allUsers: any[] = [];
        usersSnap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));

        const hydratedData = data.map((team) => {
          if (!team.teamLeaderId) return team;
          
          let calculatedTotal = 1; // Team leader
          let memberCount = 0;
          
          const teamMembers = allUsers.filter(u => u.teamId === team.id);
          for (const member of teamMembers) {
             if (member.id === team.teamLeaderId) continue;
             calculatedTotal += 1 + (member.totalDownlineCount || 0);
             memberCount++;
          }
          
          const leader = allUsers.find(u => u.id === team.teamLeaderId);
          
          if (memberCount === 0) {
              calculatedTotal = (leader ? (leader.totalDownlineCount || 0) : 0) + (leader ? 1 : 0);
          }

          return {
             ...team,
             totalMembers: calculatedTotal,
             activeMembers: leader ? (leader.activeDownlineCount || team.activeMembers || 0) : (team.activeMembers || 0),
             leaderDirectReferralsCount: leader ? (leader.directReferralsCount || team.leaderDirectReferralsCount || 0) : (team.leaderDirectReferralsCount || 0)
          };
        });
        
        hydratedData.sort((a, b) => (b.totalMembers || 0) - (a.totalMembers || 0));
        setTeamLeaders(hydratedData);
      } catch (err: any) {
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setTeamLeaders([{ id: 'error', isError: true, message: 'Missing permissions to fetch teams.' }]);
        }
      } finally {
        setLoadingTeams(false);
      }
    };
    
    fetchTeamLeaders();
  }, []);

  useEffect(() => {
    const fetchIndividuals = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          orderBy('totalDownlineCount', 'desc'),
          limit(50)
        );
        const querySnapshot = await getDocs(q);
        
        const allUsers: any[] = [];
        querySnapshot.forEach(doc => {
           const data = doc.data();
           if ((data.totalDownlineCount || 0) > 0 || (data.directReferralsCount || 0) > 0) {
              allUsers.push({ id: doc.id, ...data });
           }
        });
        
        setIndividuals(allUsers);
      } catch (err: any) {
        console.error("Error fetching individuals:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setIndividuals([{ id: 'error', fullName: 'Permission Error', currentRank: 'Error', totalDownlineCount: 0, directReferralsCount: 0 }]);
        } else {
          console.log('You might need an index for totalDownlineCount in users.', err.message);
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      } finally {
        setLoadingIndividuals(false);
      }
    };
    fetchIndividuals();
  }, []);

  const handleWipeTeams = async () => {
    if (wipeConfirmText !== 'CONFIRM') return;
    setIsWiping(true);
    try {
      let batch = writeBatch(db);
      let operationsCount = 0;
      let numTeams = 0;
      let numUsers = 0;

      const commitBatch = async () => {
         if (operationsCount > 0) {
            await batch.commit();
            batch = writeBatch(db);
            operationsCount = 0;
         }
      };

      // 1. Delete all teams
      const teamsSnap = await getDocs(query(collection(db, 'teams')));
      for (const docSnap of teamsSnap.docs) {
         batch.update(docSnap.ref, { status: 'deleted', totalMembers: 0, activeMembers: 0, leaderDirectReferralsCount: 0 });
         operationsCount++;
         numTeams++;
         if (operationsCount >= 450) await commitBatch();
      }

      // 2. Demote team leaders
      const usersSnap = await getDocs(query(collection(db, 'users')));
      for (const docSnap of usersSnap.docs) {
         const uData = docSnap.data();
         if (uData.roleType === 'team_leader' || uData.teamId) {
             batch.update(docSnap.ref, { roleType: 'member', teamId: null });
             operationsCount++;
             numUsers++;
             if (operationsCount >= 450) await commitBatch();
         }
      }
      
      await commitBatch();

      alert(`Successfully deleted ${numTeams} teams and reset ${numUsers} members. The table is now empty.`);
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert('Error wiping teams: ' + err.message);
    } finally {
      setIsWiping(false);
      setIsWipeModalOpen(false);
      setWipeConfirmText('');
    }
  };

  const handleWipeIndividuals = async () => {
    if (wipeIndividualsConfirmText !== 'CONFIRM') return;
    setIsWipingIndividuals(true);
    try {
      let batch = writeBatch(db);
      let operationsCount = 0;
      let numUsers = 0;

      const commitBatch = async () => {
         if (operationsCount > 0) {
            await batch.commit();
            batch = writeBatch(db);
            operationsCount = 0;
         }
      };

      const usersSnap = await getDocs(query(collection(db, 'users')));
      for (const docSnap of usersSnap.docs) {
         batch.update(docSnap.ref, { 
             totalDownlineCount: 0, 
             activeDownlineCount: 0, 
             directReferralsCount: 0 
         });
         operationsCount++;
         numUsers++;
         if (operationsCount >= 450) await commitBatch();
      }
      
      await commitBatch();

      alert(`Successfully reset data for ${numUsers} individual members. The table is now empty.`);
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert('Error wiping individuals: ' + err.message);
    } finally {
      setIsWipingIndividuals(false);
      setIsWipeIndividualsModalOpen(false);
      setWipeIndividualsConfirmText('');
    }
  };

  return (
    <div className="flex flex-col gap-10 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">Global System Rankings</h1>
        <p className="text-muted-foreground">Comprehensive view of top performing Teams, Team Leaders, and Individuals.</p>
      </div>

      {/* Teams / Team Leaders Ranking */}
      <div className="flex flex-col gap-6 mt-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
             <Trophy className="w-6 h-6 text-primary" />
             <h2 className="text-xl font-bold text-foreground">Top Teams & Team Leaders</h2>
          </div>
          <button
            onClick={() => setIsWipeModalOpen(true)}
            className="px-3 py-1 bg-destructive/10 text-destructive text-sm font-bold rounded-lg hover:bg-destructive hover:text-white transition-colors"
          >
            Wipe All Teams Data
          </button>
        </div>
        
        {loadingTeams ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : teamLeaders.length > 0 && teamLeaders[0].isError ? (
           <div className="bg-destructive/10 text-destructive border border-destructive/20 p-6 rounded-2xl">
             <p className="font-bold">{teamLeaders[0].message}</p>
           </div>
        ) : (
          <div className="card overflow-hidden p-0 border border-border">
            <div className="table-scroll-container">
              <table className="w-full text-left min-w-[700px] md:min-w-full">
                <thead>
                  <tr className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Rank</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Team Leader</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Total Team Members</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Direct Referrals</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Indirect Referrals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teamLeaders.map((leader, index) => (
                    <tr key={leader.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground font-bold">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {(leader.teamLeaderName || 'U')[0]}
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{leader.teamLeaderName}'s Team</p>
                            <p className="text-xs text-muted-foreground">Leader ID: {leader.teamLeaderId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                         {leader.totalMembers || 0}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                         {leader.leaderDirectReferralsCount || 0}
                      </td>
                      <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                         {Math.max(0, (leader.totalMembers || 0) - 1 - (leader.leaderDirectReferralsCount || 0))}
                      </td>
                    </tr>
                  ))}
                  {teamLeaders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                           <Trophy className="w-12 h-12 text-muted-foreground/30 mb-4" />
                           <p className="text-lg font-bold text-foreground mb-1">No Team Leaders Found</p>
                           <p className="text-sm text-muted-foreground">Teams must be created to appear in rankings.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Individual Ranking */}
      <div className="flex flex-col gap-6 mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
             <Users className="w-6 h-6 text-blue-500" />
             <h2 className="text-xl font-bold text-foreground">Top Individual Members</h2>
          </div>
          <button
            onClick={() => setIsWipeIndividualsModalOpen(true)}
            className="px-3 py-1 bg-destructive/10 text-destructive text-sm font-bold rounded-lg hover:bg-destructive hover:text-white transition-colors"
          >
            Wipe Individuals Data
          </button>
        </div>
        
        {loadingIndividuals ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="card flex flex-col">
              <div className="table-scroll-container">
                 <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
                   <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
                     <tr>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">User</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Status / Role</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Directs</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Team Size</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border">
                      {individuals.length > 0 ? individuals.map((user, pos) => (
                        <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-muted-foreground whitespace-nowrap">#{pos + 1}</td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-foreground flex items-center gap-3 whitespace-nowrap">
                             <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs shrink-0 font-bold uppercase">
                               {(user.fullName || 'U').charAt(0)}
                             </div>
                             <div>
                               <div className="font-bold">{user.fullName || 'Member'}</div>
                               <div className="text-xs text-muted-foreground">{user.email || 'No email'}</div>
                             </div>
                          </td>
                          <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                             <div className="flex flex-col items-start gap-1">
                               <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                 {user.currentRank || 'Member'}
                               </span>
                               {user.roleType === 'team_leader' && (
                                 <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                                   Team Leader
                                 </span>
                               )}
                             </div>
                          </td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-center whitespace-nowrap">{user.directReferralsCount || user.directReferrals || 0}</td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-center whitespace-nowrap">{user.totalDownlineCount || 0}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">No data available for individual leaderboard.</td>
                        </tr>
                      )}
                   </tbody>
                 </table>
              </div>
          </div>
        )}
      </div>

      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-destructive/20 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-destructive/10 text-destructive">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Wipe All Teams Data
              </h3>
              <button 
                onClick={() => {
                  setIsWipeModalOpen(false);
                  setWipeConfirmText('');
                }}
                className="p-1.5 hover:bg-destructive/20 text-destructive/80 hover:text-destructive rounded-lg transition-colors"
                disabled={isWiping}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex flex-col gap-2">
                <p className="text-sm font-bold text-destructive uppercase tracking-wider">Warning: Irreversible Action</p>
                <p className="text-sm text-foreground">
                  You are about to <strong className="text-destructive">permanently delete all team records</strong> and reset all team leaders back to basic members with no team affiliation.
                </p>
                <p className="text-sm">
                  This action <strong>cannot be undone</strong> and will completely wipe the Top Teams rankings until new teams are created.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-foreground">
                  Type <strong>CONFIRM</strong> below to proceed:
                </label>
                <input
                  type="text"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  placeholder="CONFIRM"
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent transition-all placeholder:text-muted-foreground/30"
                  disabled={isWiping}
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsWipeModalOpen(false);
                    setWipeConfirmText('');
                  }}
                  className="px-5 py-2.5 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors text-sm"
                  disabled={isWiping}
                >
                  Cancel
                </button>
                <button
                  onClick={handleWipeTeams}
                  disabled={isWiping || wipeConfirmText !== 'CONFIRM'}
                  className="px-6 py-2.5 bg-destructive text-destructive-foreground font-bold rounded-xl hover:bg-destructive/90 transition-all shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {isWiping ? 'Wiping Data...' : 'Wipe Teams Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isWipeIndividualsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-destructive/20 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-destructive/10 text-destructive">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Wipe All Individuals Data
              </h3>
              <button 
                onClick={() => {
                  setIsWipeIndividualsModalOpen(false);
                  setWipeIndividualsConfirmText('');
                }}
                className="p-1.5 hover:bg-destructive/20 text-destructive/80 hover:text-destructive rounded-lg transition-colors"
                disabled={isWipingIndividuals}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex flex-col gap-2">
                <p className="text-sm font-bold text-destructive uppercase tracking-wider">Warning: Irreversible Action</p>
                <p className="text-sm text-foreground">
                  You are about to <strong className="text-destructive">permanently erase all tracking data</strong> (direct referrals and team sizes) for every registered individual member.
                </p>
                <p className="text-sm">
                  This action <strong>cannot be undone</strong> and will clear the Top Individuals ranking board. It will <strong>NOT</strong> delete the user accounts themselves, only reset their progress.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-foreground">
                  Type <strong>CONFIRM</strong> below to proceed:
                </label>
                <input
                  type="text"
                  value={wipeIndividualsConfirmText}
                  onChange={(e) => setWipeIndividualsConfirmText(e.target.value)}
                  placeholder="CONFIRM"
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent transition-all placeholder:text-muted-foreground/30"
                  disabled={isWipingIndividuals}
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsWipeIndividualsModalOpen(false);
                    setWipeIndividualsConfirmText('');
                  }}
                  className="px-5 py-2.5 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors text-sm"
                  disabled={isWipingIndividuals}
                >
                  Cancel
                </button>
                <button
                  onClick={handleWipeIndividuals}
                  disabled={isWipingIndividuals || wipeIndividualsConfirmText !== 'CONFIRM'}
                  className="px-6 py-2.5 bg-destructive text-destructive-foreground font-bold rounded-xl hover:bg-destructive/90 transition-all shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {isWipingIndividuals ? 'Wiping Data...' : 'Wipe Individuals Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
