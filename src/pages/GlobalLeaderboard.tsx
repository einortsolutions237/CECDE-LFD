import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { buildNetworkStats } from '../lib/networkUtils';
import { Trophy, Users, TrendingUp, Award, Medal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router';

export default function GlobalLeaderboard({ inTab = false }: { inTab?: boolean }) {
  const { userData } = useAuth();
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // Assume leaderboards/global stores the ranking documents
        const q = query(collection(db, 'teams'), orderBy('leaderPerformanceScore', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        const data: any[] = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });

        // Also fetch users to precisely calculate team members based on full network tree
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

        setLeaders(data);
      } catch (err: any) {
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setLeaders([{ id: 'error', isError: true, message: 'Missing permissions to fetch leaderboard. If you are using your own Firebase project, please update your firestore.rules to allow read access to the "teams" collection.' }]);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeaderboard();
  }, []);

  if (userData?.roleType !== 'team_leader' && userData?.roleType !== 'admin') {
     // return <Navigate to="/dashboard" />;
  }

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Global Team Rankings</h1>
          <p className="text-sm text-muted-foreground mt-1">Ranking of all team leaders across the platform based on performance score.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold">
          <Trophy className="w-5 h-5" />
          Global Leaderboard
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {leaders.length > 0 && leaders[0].isError ? (
           <div className="bg-destructive/10 text-destructive border border-destructive/20 p-6 rounded-2xl">
             <p className="font-bold">{leaders[0].message}</p>
             <pre className="mt-4 p-4 bg-background/50 rounded-xl text-xs overflow-x-auto text-foreground">
{`match /teams/{teamId} {
  allow read: if isSignedIn();
  allow create: if isSignedIn();
  allow update: if isSignedIn();
}`}
             </pre>
           </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {leaders.slice(0, 3).map((leader, index) => (
            <div key={leader.id} className={`relative bg-card rounded-2xl border p-6 flex flex-col items-center text-center shadow-lg transform hover:-translate-y-2 transition-transform ${
              index === 0 ? 'border-yellow-400' : index === 1 ? 'border-gray-400' : 'border-amber-600'
            }`}>
              <div className={`absolute -top-5 w-12 h-12 rounded-full flex items-center justify-center border-4 border-card text-white font-bold text-xl ${
                index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-400' : 'bg-amber-600'
              }`}>
                {index + 1}
              </div>
              
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center font-bold text-3xl uppercase mt-4 mb-4 text-primary">
                {(leader.teamLeaderName || 'U')[0]}
              </div>
              
              <h3 className="font-bold text-lg text-foreground">{leader.teamLeaderName}'s Team</h3>
              <p className="text-sm text-muted-foreground mb-4">Team Leader</p>
              
              <div className="flex items-center gap-2 mb-2 font-bold text-2xl text-foreground">
                {leader.leaderPerformanceScore || 0} pts
              </div>
              
              <div className="grid grid-cols-2 gap-6 w-full mt-4 border-t border-border pt-4 text-sm">
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-bold flex items-center gap-1"><Users className="w-3 h-3"/> {(leader.calculatedTotalDownline !== undefined ? leader.calculatedTotalDownline : leader.totalDownlineCount || 0) + 1}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-bold flex items-center gap-1 text-success"><TrendingUp className="w-3 h-3"/> {leader.activeDownlineCount || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="table-scroll-container">
            <table className="w-full text-left min-w-[700px] md:min-w-full">
              <thead>
                <tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Rank</th>
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold whitespace-nowrap">Team Leader</th>
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Total Members</th>
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Direct Referrals</th>
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-center whitespace-nowrap">Indirect Referrals</th>
                  <th className="px-4 py-3 md:px-6 md:py-4 font-semibold text-right whitespace-nowrap">Performance Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaders.slice(3).map((leader, index) => (
                  <tr key={leader.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground font-bold">
                        {index + 4}
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
                       {(leader.calculatedTotalDownline !== undefined ? leader.calculatedTotalDownline : leader.totalDownlineCount || 0) + 1}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                       {leader.calculatedDirectReferrals !== undefined ? leader.calculatedDirectReferrals : (leader.directReferralsCount || leader.directReferrals || 0)}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                       {leader.calculatedTotalDownline !== undefined ? Math.max(0, leader.calculatedTotalDownline - (leader.calculatedDirectReferrals || 0)) : (leader.totalDownlineCount ? Math.max(0, leader.totalDownlineCount - (leader.directReferralsCount || leader.directReferrals || 0)) : 0)}
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-right whitespace-nowrap">
                       <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-bold">
                         {leader.leaderPerformanceScore || 0} pts
                       </span>
                    </td>
                  </tr>
                ))}
                {leaders.length <= 3 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground whitespace-nowrap">
                      No more teams found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
