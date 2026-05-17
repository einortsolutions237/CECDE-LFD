import React, { useEffect, useState } from 'react';
import { Award, Star, Trophy, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import TeamRankings from './TeamRankings';
import GlobalLeaderboard from './GlobalLeaderboard';
import { buildNetworkStats } from '../lib/networkUtils';

const ranks = [
  { name: 'Bronze', color: 'text-amber-700 bg-amber-700/10', requirements: '5 Directs, $50 Bal' },
  { name: 'Silver', color: 'text-slate-500 bg-slate-500/10', requirements: '20 Total, $100 Bal' },
  { name: 'Gold', color: 'text-yellow-500 bg-yellow-500/10', requirements: '50 Total, $200 Bal' },
  { name: 'Platinum', color: 'text-cyan-600 bg-cyan-600/10', requirements: '100 Total, $500 Bal' },
  { name: 'Diamond', color: 'text-blue-500 bg-blue-500/10', requirements: '500 Total, $1000 Bal' },
  { name: 'Crown Ambassador', color: 'text-purple-600 bg-purple-600/10', requirements: '1000 Total, $5000 Bal' }
];

export default function Rankings() {
  const { userData } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    const fetchLeaderboard = async () => {
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
        
        setLeaderboard(allUsers.slice(0, 10));
      } catch (err: any) {
        console.error("Error fetching leaderboard:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setLeaderboard([{ id: 'error', fullName: 'Permission Error', currentRank: 'Error', calculatedDirectReferrals: 0, calculatedTotalDownline: 0 }]);
        } else {
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);
  
  const isTeamLeader = userData?.roleType === 'team_leader';
  const showTeamTab = userData?.teamId || isTeamLeader;
  const showGlobalTab = isTeamLeader || userData?.role === 'admin' || userData?.role === 'super_admin';

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
          {showGlobalTab && !isTeamLeader && (
            <button
              onClick={() => setActiveTab('global')}
              className={`px-5 py-2.5 font-semibold rounded-xl text-sm transition-all duration-200 ${activeTab === 'global' ? 'bg-card text-foreground shadow-sm ring-1 ring-border border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Global Ranking
            </button>
          )}
        </div>
      </div>

      {activeTab === 'personal' && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Rankings & Leaderboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Track your progress and see top performers.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                 <Trophy className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-sm uppercase tracking-wider font-bold text-muted-foreground mb-1">Your Current Rank</h2>
              <div className="text-3xl font-bold tracking-tight text-foreground mb-2">{userData?.currentRank || 'Member'}</div>
              <p className="text-xs text-muted-foreground">Keep building your network to reach the next tier.</p>
            </div>

            <div className="md:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm overflow-x-auto">
              <h3 className="text-xl font-semibold tracking-tight text-foreground mb-4">Rank Requirements</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {ranks.map(r => (
                  <div key={r.name} className="flex flex-col gap-2 p-4 rounded-xl border border-border hover:-translate-y-1 transition-all duration-300">
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
          
          <div className="bg-card shadow-sm rounded-2xl border border-border flex flex-col">
              <div className="p-6 border-b border-border flex items-center justify-between">
                 <h2 className="text-xl font-semibold tracking-tight text-foreground">Global Individual Leaderboard</h2>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                     <tr>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Pos</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">User</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Rank</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Directs</th>
                       <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Team Size</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Loading leaderboard...</td>
                        </tr>
                      ) : leaderboard.length > 0 ? leaderboard.map((user, pos) => (
                        <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-muted-foreground">#{pos + 1}</td>
                          <td className="px-6 py-4 font-medium text-foreground flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs shrink-0 font-bold uppercase">
                               {(user.fullName || 'U').charAt(0)}
                             </div>
                             {user.fullName || 'Member'}
                          </td>
                          <td className="px-6 py-4">
                             <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                               {user.currentRank || 'Member'}
                             </span>
                          </td>
                          <td className="px-6 py-4 font-medium">{user.calculatedDirectReferrals || 0}</td>
                          <td className="px-6 py-4 font-medium">{user.calculatedTotalDownline || 0}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No data available for leaderboard.</td>
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

      {activeTab === 'global' && showGlobalTab && !isTeamLeader && (
        <div className="w-full">
          <GlobalLeaderboard inTab={true} />
        </div>
      )}

      {activeTab === 'team_leader_overview' && isTeamLeader && (
        <div className="flex flex-col gap-10 w-full">
          <div>
             <TeamRankings inTab={true} />
          </div>
          <div>
             <GlobalLeaderboard inTab={true} />
          </div>
        </div>
      )}

    </div>
  );
}
