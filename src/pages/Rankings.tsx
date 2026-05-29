import React, { useEffect, useState } from 'react';
import { Trophy, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import TeamRankings from './TeamRankings';

export default function Rankings() {
  const { userData } = useAuth();
  const [teamLeadersLeaderboard, setTeamLeadersLeaderboard] = useState<any[]>([]);
  const [loadingTeamLeaders, setLoadingTeamLeaders] = useState(true);
  const [activeTab, setActiveTab] = useState('team_leaders');

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

          const hydratedData = data.map((team) => {
            return {
               ...team,
               totalMembers: team.totalMembers || 1,
               activeMembers: team.activeMembers || 0
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

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 border-b border-border pb-4 w-full">
        <div className="flex items-center gap-2 flex-wrap bg-muted/30 p-1.5 rounded-2xl border border-border">
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
              My Team Members
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


          


      {activeTab === 'team_leaders' && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">Team Leaders Ranking</h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">Ranking of all team leaders based on their team's total membership size.</p>
          </div>

          <div className="card p-0 overflow-hidden border border-border mt-2">
            <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
               <h2 className="text-2xl font-bold tracking-tight text-foreground">Global Team Leaders</h2>
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
