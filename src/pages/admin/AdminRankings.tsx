import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { buildNetworkStats } from '../../lib/networkUtils';
import { Trophy, Users, TrendingUp } from 'lucide-react';

export default function AdminRankings() {
  const [teamLeaders, setTeamLeaders] = useState<any[]>([]);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingIndividuals, setLoadingIndividuals] = useState(true);

  useEffect(() => {
    const fetchTeamLeaders = async () => {
      try {
        const q = query(collection(db, 'teams'), orderBy('leaderPerformanceScore', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        const data: any[] = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });

        // Also fetch users to precisely calculate team members
        const uQ = query(collection(db, 'users'));
        const uSnap = await getDocs(uQ);
        const users: any[] = [];
        uSnap.forEach(d => users.push({ id: d.id, ...d.data() }));

        const stats = buildNetworkStats(users);

        data.forEach(team => {
          if (team.teamLeaderId) {
             const usrStats = stats.get(team.teamLeaderId);
             if (usrStats) {
                team.calculatedDirectReferrals = usrStats.directCount;
                team.calculatedTotalDownline = usrStats.downlineCount;
             }
          }
        });

        setTeamLeaders(data);
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
        const fullQ = await getDocs(collection(db, 'users'));
        const allUsers: any[] = [];
        fullQ.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
        
        const stats = buildNetworkStats(allUsers);
        allUsers.forEach(u => {
           const uStats = stats.get(u.id);
           if (uStats) {
             u.calculatedDirectReferrals = uStats.directCount;
             u.calculatedTotalDownline = uStats.downlineCount;
           }
        });
        
        // Sort in memory by downline count to guarantee accuracy
        allUsers.sort((a, b) => (b.calculatedTotalDownline || 0) - (a.calculatedTotalDownline || 0));
        
        setIndividuals(allUsers.slice(0, 50));
      } catch (err: any) {
        console.error("Error fetching individuals:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setIndividuals([{ id: 'error', fullName: 'Permission Error', currentRank: 'Error', calculatedDirectReferrals: 0, calculatedTotalDownline: 0 }]);
        } else {
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      } finally {
        setLoadingIndividuals(false);
      }
    };
    fetchIndividuals();
  }, []);

  return (
    <div className="flex flex-col gap-10 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">Global System Rankings</h1>
        <p className="text-muted-foreground">Comprehensive view of top performing Teams, Team Leaders, and Individuals.</p>
      </div>

      {/* Teams / Team Leaders Ranking */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 mb-2">
           <Trophy className="w-6 h-6 text-primary" />
           <h2 className="text-xl font-bold text-foreground">Top Teams & Team Leaders</h2>
        </div>
        
        {loadingTeams ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : teamLeaders.length > 0 && teamLeaders[0].isError ? (
           <div className="bg-destructive/10 text-destructive border border-destructive/20 p-6 rounded-2xl">
             <p className="font-bold">{teamLeaders[0].message}</p>
           </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-6 py-4 font-semibold">Rank</th>
                    <th className="px-6 py-4 font-semibold">Team Leader</th>
                    <th className="px-6 py-4 font-semibold text-center">Total Members</th>
                    <th className="px-6 py-4 font-semibold text-center">Direct Referrals</th>
                    <th className="px-6 py-4 font-semibold text-center">Indirect Referrals</th>
                    <th className="px-6 py-4 font-semibold text-right">Performance Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teamLeaders.map((leader, index) => (
                    <tr key={leader.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground font-bold">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-center font-bold">
                         {(leader.calculatedTotalDownline !== undefined ? leader.calculatedTotalDownline : leader.totalDownlineCount || 0) + 1}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                         {leader.calculatedDirectReferrals !== undefined ? leader.calculatedDirectReferrals : (leader.directReferralsCount || leader.directReferrals || 0)}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                         {leader.calculatedTotalDownline !== undefined ? Math.max(0, leader.calculatedTotalDownline - (leader.calculatedDirectReferrals || 0)) : (leader.totalDownlineCount ? Math.max(0, leader.totalDownlineCount - (leader.directReferralsCount || leader.directReferrals || 0)) : 0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                         <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-bold">
                           {leader.leaderPerformanceScore || 0} pts
                         </span>
                      </td>
                    </tr>
                  ))}
                  {teamLeaders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                        No team leaders found.
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
        <div className="flex items-center gap-2 mb-2">
           <Users className="w-6 h-6 text-blue-500" />
           <h2 className="text-xl font-bold text-foreground">Top Individual Members</h2>
        </div>
        
        {loadingIndividuals ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="bg-card shadow-sm rounded-2xl border border-border flex flex-col">
              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                     <tr>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Rank</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">User</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Status / Role</th>
                       <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Directs</th>
                       <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Team Size</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border">
                      {individuals.length > 0 ? individuals.map((user, pos) => (
                        <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-muted-foreground">#{pos + 1}</td>
                          <td className="px-6 py-4 font-medium text-foreground flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs shrink-0 font-bold uppercase">
                               {(user.fullName || 'U').charAt(0)}
                             </div>
                             <div>
                               <div className="font-bold">{user.fullName || 'Member'}</div>
                               <div className="text-xs text-muted-foreground">{user.email || 'No email'}</div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
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
                          <td className="px-6 py-4 font-bold text-center">{user.calculatedDirectReferrals || 0}</td>
                          <td className="px-6 py-4 font-bold text-center">{user.calculatedTotalDownline || 0}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No data available for individual leaderboard.</td>
                        </tr>
                      )}
                   </tbody>
                 </table>
              </div>
          </div>
        )}
      </div>

    </div>
  );
}
