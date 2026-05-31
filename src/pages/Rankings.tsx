import React, { useEffect, useState } from 'react';
import { Award, Star, Trophy, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import TeamRankings from './TeamRankings';

const defaultRanks = [
  { name: 'Bronze', color: 'text-amber-700 bg-amber-700/10', requirements: '3 Directs' },
  { name: 'Silver', color: 'text-slate-500 bg-slate-500/10', requirements: '5 Directs' },
  { name: 'Gold', color: 'text-yellow-500 bg-yellow-500/10', requirements: '8 Directs' },
  { name: 'Platinum', color: 'text-cyan-600 bg-cyan-600/10', requirements: '10 Directs' },
  { name: 'Team Leader', color: 'text-purple-600 bg-purple-600/10', requirements: '20 Directs, 50 Total' },
  { name: 'Diamond', color: 'text-blue-500 bg-blue-500/10', requirements: '15 Directs, 500 Total' },
  { name: 'Crown Ambassador', color: 'text-rose-600 bg-rose-600/10', requirements: '20 Directs, 1000 Total' }
];

export default function Rankings() {
  const { userData } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [teamLeadersLeaderboard, setTeamLeadersLeaderboard] = useState<any[]>([]);
  const [ranks, setRanks] = useState<any[]>(defaultRanks);
  const [loading, setLoading] = useState(true);
  const [loadingTeamLeaders, setLoadingTeamLeaders] = useState(true);
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const rankRef = doc(db, 'system_settings', 'ranks');
        const rankSnap = await getDoc(rankRef);
        if (rankSnap.exists() && rankSnap.data().ranks) {
           const dbRanks = rankSnap.data().ranks.reverse().map((r: any) => {
              // mapping backend colors to a default scheme if not present
              let color = 'text-slate-500 bg-slate-500/10';
              if (r.name.includes('Bronze')) color = 'text-amber-700 bg-amber-700/10';
              else if (r.name.includes('Silver')) color = 'text-slate-500 bg-slate-500/10';
              else if (r.name.includes('Gold')) color = 'text-yellow-500 bg-yellow-500/10';
              else if (r.name.includes('Platinum')) color = 'text-cyan-600 bg-cyan-600/10';
              else if (r.name.includes('Team Leader')) color = 'text-purple-600 bg-purple-600/10';
              else if (r.name.includes('Diamond')) color = 'text-blue-500 bg-blue-500/10';
              else if (r.name.includes('Crown')) color = 'text-rose-600 bg-rose-600/10';
              
              const reqs = [];
              if (r.directs > 0) reqs.push(`${r.directs} Directs`);
              if (r.downline > 0) reqs.push(`${r.downline} Total`);
              if (r.activeDownline > 0) reqs.push(`${r.activeDownline} Active`);
              
              return { name: r.name, color, requirements: reqs.join(', ') || 'None' };
           });
           setRanks(dbRanks);
        }

        const q = query(
          collection(db, 'users'),
          orderBy('leaderboardScore', 'desc'),
          limit(10)
        );
        const querySnapshot = await getDocs(q);
        
        const allUsers: any[] = [];
        querySnapshot.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
        
        setLeaderboard(allUsers);
      } catch (err: any) {
        console.error("Error fetching leaderboard:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
           setLeaderboard([{ id: 'error', fullName: 'Permission Error', currentRank: 'Error', directReferralsCount: 0, totalDownlineCount: 0 }]);
        } else {
           handleFirestoreError(err, OperationType.LIST, 'users');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);
  
  useEffect(() => {
    if (activeTab === 'team_leaders' && teamLeadersLeaderboard.length === 0) {
      const fetchTeamLeaders = async () => {
        setLoadingTeamLeaders(true);
        try {
          const q = query(
            collection(db, 'teams'),
            orderBy('totalMembers', 'desc'),
            limit(50)
          );
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
               activeMembers: leader ? (leader.activeDownlineCount || team.activeMembers || 0) : (team.activeMembers || 0)
            };
          });
          
          hydratedData.sort((a, b) => (b.totalMembers || 0) - (a.totalMembers || 0));
          setTeamLeadersLeaderboard(hydratedData);
        } catch (err) {
          console.error("Error fetching team leaders for ranking:", err);
        } finally {
          setLoadingTeamLeaders(false);
        }
      };
      fetchTeamLeaders();
    }
  }, [activeTab]);

  const isTeamLeader = userData?.roleType === 'team_leader';
  const showTeamTab = userData?.teamId || isTeamLeader;

  // If team leader, default to team_leader_overview
  useEffect(() => {
    if (isTeamLeader && activeTab === 'personal') {
      setActiveTab('team_leader_overview');
    }
  }, [isTeamLeader]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 border-b border-border pb-4 w-full">
        <div className="flex items-center gap-2 flex-wrap bg-muted/30 p-1.5 rounded-2xl border border-border">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-5 py-2.5 font-semibold rounded-xl text-sm transition-all duration-200 ${activeTab === 'personal' ? 'bg-card text-foreground shadow-sm ring-1 ring-border border border-border' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Personal Ranking
          </button>
          
          <button
            onClick={() => setActiveTab('team_leaders')}
            className={`px-5 py-2.5 font-semibold rounded-xl text-sm transition-all duration-200 ${activeTab === 'team_leaders' ? 'bg-card text-foreground shadow-sm ring-1 ring-border border border-border' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Team Leaders
          </button>
          
          {isTeamLeader && (
            <button
              onClick={() => setActiveTab('team_leader_overview')}
              className={`px-5 py-2.5 font-semibold rounded-xl text-sm transition-all duration-200 ${activeTab === 'team_leader_overview' ? 'bg-card text-foreground shadow-sm ring-1 ring-border border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Leader Rankings
            </button>
          )}

          {showTeamTab && !isTeamLeader && (
            <button
              onClick={() => setActiveTab('team')}
              className={`px-5 py-2.5 font-semibold rounded-xl text-sm transition-all duration-200 ${activeTab === 'team' ? 'bg-card text-foreground shadow-sm ring-1 ring-border border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              My Team Ranking
            </button>
          )}
        </div>
      </div>

      {activeTab === 'personal' && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Rankings & Leaderboard</h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">Track your progress and see top performers.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 card flex flex-col justify-center items-center text-center p-8">
              <div className="w-24 h-24 rounded-[2rem] bg-primary/10 flex items-center justify-center mb-6 shadow-sm border border-primary/20">
                 <Trophy className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-sm uppercase tracking-widest font-bold text-muted-foreground mb-2">Your Current Rank</h2>
              <div className="text-4xl font-extrabold tracking-tight text-foreground mb-3">{userData?.currentRank || 'Member'}</div>
              <p className="text-sm font-medium text-muted-foreground">Keep building your network to reach the next tier.</p>
            </div>

            <div className="md:col-span-2 card">
              <h3 className="text-2xl font-bold tracking-tight text-foreground mb-6">Rank Requirements</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {ranks.map(r => (
                  <div key={r.name} className="flex flex-col gap-2 p-4 rounded-xl border border-border card-hover">
                    <div className={`w-fit px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${r.color}`}>
                      {r.name}
                    </div>
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mt-2">
                      <Users className="w-3.5 h-3.5" />
                      {r.requirements}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="card p-0 overflow-hidden border border-border mt-2">
              <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
                 <h2 className="text-2xl font-bold tracking-tight text-foreground">Global Individual Leaderboard</h2>
              </div>
              <div className="table-scroll-container">
                 <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
                   <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
                     <tr>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Pos</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">User</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Directs</th>
                       <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Team Size</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">Loading leaderboard...</td>
                        </tr>
                      ) : leaderboard.length > 0 ? leaderboard.map((user, pos) => (
                        <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-muted-foreground whitespace-nowrap">#{pos + 1}</td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-foreground flex items-center gap-3 whitespace-nowrap">
                             <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs shrink-0 font-bold uppercase">
                               {(user.fullName || 'U').charAt(0)}
                             </div>
                             {user.fullName || 'Member'}
                          </td>
                          <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                             <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                               {user.currentRank || 'Member'}
                             </span>
                          </td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-medium whitespace-nowrap">{user.directReferralsCount || 0}</td>
                          <td className="px-4 py-3 md:px-6 md:py-4 font-medium whitespace-nowrap">{user.totalDownlineCount || 0}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                               <Award className="w-12 h-12 text-muted-foreground/30 mb-4" />
                               <p className="text-lg font-bold text-foreground mb-1">No Rankings Available</p>
                               <p className="text-sm text-muted-foreground">The individual leaderboard is currently empty.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                   </tbody>
                 </table>
              </div>
          </div>
        </div>
      )}

      {activeTab === 'team_leaders' && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Team Leaders Ranking</h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">Ranking of all team leaders based on their team's total membership size.</p>
          </div>

          <div className="card p-0 overflow-hidden border border-border mt-2">
            <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
               <h2 className="text-2xl font-bold tracking-tight text-foreground">Team Leader Ranking Table</h2>
               <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div className="table-scroll-container">
               <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
                 <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
                   <tr>
                     <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                     <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Team Leader</th>
                     <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Team Name</th>
                     <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap text-center">Total Team Members</th>
                     <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap text-center">Active Members</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                    {loadingTeamLeaders ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">Loading team leaders ranking...</td>
                      </tr>
                    ) : teamLeadersLeaderboard.length > 0 ? teamLeadersLeaderboard.map((team, pos) => (
                      <tr key={team.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-muted-foreground whitespace-nowrap">
                          {pos + 1 <= 3 ? (
                             <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${pos === 0 ? 'bg-yellow-400' : pos === 1 ? 'bg-gray-400' : 'bg-amber-600'}`}>{pos + 1}</span>
                          ) : (
                             `#${pos + 1}`
                          )}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-foreground flex items-center gap-3 whitespace-nowrap">
                           <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs shrink-0 font-bold uppercase">
                             {(team.teamLeaderName || 'U').charAt(0)}
                           </div>
                           {team.teamLeaderName || 'Leader'}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 text-muted-foreground whitespace-nowrap">
                           {team.name}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-center whitespace-nowrap">
                          <span className="flex items-center justify-center gap-1">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            {team.totalMembers || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 font-bold text-center text-success whitespace-nowrap">
                          <span className="flex items-center justify-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            {team.activeMembers || 0}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                             <Trophy className="w-12 h-12 text-muted-foreground/30 mb-4" />
                             <p className="text-lg font-bold text-foreground mb-1">No Team Leaders Ranked Yet</p>
                             <p className="text-sm text-muted-foreground">Team rankings will appear here once teams are established.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                 </tbody>
               </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && showTeamTab && !isTeamLeader && (
        <div className="w-full">
          <TeamRankings inTab={true} />
        </div>
      )}

      {activeTab === 'team_leader_overview' && isTeamLeader && (
        <div className="flex flex-col gap-10 w-full">
          <div>
             <TeamRankings inTab={true} />
          </div>
        </div>
      )}

    </div>
  );
}
