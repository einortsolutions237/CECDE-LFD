import React, { useEffect, useState } from 'react';
import { Award, Star, Trophy, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import TeamRankings from './TeamRankings';
import GlobalLeaderboard from './GlobalLeaderboard';

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
        const q = query(
          collection(db, 'users'),
          orderBy('totalDownlineCount', 'desc'),
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
          // If the index is missing, error will contain the url
          console.log('You might need an index for totalDownlineCount', err.message);
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
