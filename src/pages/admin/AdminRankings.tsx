import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Trophy, Users, TrendingUp } from 'lucide-react';

export default function AdminRankings() {
  const [teamLeaders, setTeamLeaders] = useState<any[]>([]);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingIndividuals, setLoadingIndividuals] = useState(true);

  useEffect(() => {
    const fetchTeamLeaders = async () => {
      try {
        const q = query(collection(db, 'teams'), orderBy('totalMembers', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        const data: any[] = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
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
        const q = query(
          collection(db, 'users'),
          orderBy('totalDownlineCount', 'desc'),
          limit(50)
        );
        const querySnapshot = await getDocs(q);
        
        const allUsers: any[] = [];
        querySnapshot.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
        
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
          <div className="card overflow-hidden">
            <div className="table-scroll-container">
              <table className="w-full text-left min-w-[700px] md:min-w-full">
                <thead>
                  <tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Rank</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Team Leader</th>
                    <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Total Members</th>
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
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground whitespace-nowrap">
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

    </div>
  );
}
