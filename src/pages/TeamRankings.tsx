import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, onSnapshot, or } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trophy, Award, Users, Filter, Medal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function TeamRankings({ inTab = false }: { inTab?: boolean }) {
  const { userData } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: () => void;

    const fetchTeamRankings = () => {
      try {
        if (!userData?.teamId && userData?.roleType !== 'team_leader') return;
        
        let q;
        if (userData?.teamId) {
          q = query(
            collection(db, 'users'),
            or(
              where('teamId', '==', userData.teamId),
              where('sponsorId', '==', userData.uid)
            )
          );
        } else {
          q = query(collection(db, 'users'), where('sponsorId', '==', userData.uid));
        }

        unsubscribe = onSnapshot(q, (snapshot) => {
          const data: any[] = [];
          snapshot.forEach(doc => {
            const u = doc.data();
            
            if (u.roleType === 'team_leader') return; // exclude team leaders
            
            // calculate informal points for internal ranking
            const direct = u.directReferralsCount || 0;
            const downline = u.totalDownlineCount || 0;
            const active = u.activityState === 'active' ? 1 : 0;
            
            const contributionScore = (direct * 5) + ((downline - direct) * 2) + (active * 3);
            
            data.push({ id: doc.id, ...u, contributionScore });
          });
          
          data.sort((a, b) => b.contributionScore - a.contributionScore);
          setMembers(data);
          setLoading(false);
        }, (err) => {
          console.error("Error listening to internal rankings", err);
          setLoading(false);
        });
        
      } catch (err) {
        console.error("Error setting up internal rankings listener", err);
        setLoading(false);
      }
    };
    
    fetchTeamRankings();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userData]);

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Team Internal Rankings</h1>
          <p className="text-sm text-muted-foreground mt-1">Ranking of members inside your team.</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
           <h2 className="font-bold flex items-center gap-2">
             <Users className="w-5 h-5 text-primary"/>
             Team Members
           </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-6 py-4 font-semibold">Position</th>
                <th className="px-6 py-4 font-semibold">Member Name</th>
                <th className="px-6 py-4 font-semibold text-center">Rank Badge</th>
                <th className="px-6 py-4 font-semibold text-center">Directs</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Contribution Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member, index) => (
                <tr key={member.id} className={`hover:bg-muted/30 transition-colors ${member.id === userData?.uid ? 'bg-primary/5' : ''}`}>
                  <td className="px-6 py-4">
                    {index === 0 && <Medal className="w-6 h-6 text-yellow-400" />}
                    {index === 1 && <Medal className="w-6 h-6 text-slate-400" />}
                    {index === 2 && <Medal className="w-6 h-6 text-amber-600" />}
                    {index > 2 && <span className="font-bold text-muted-foreground ml-2">#{index + 1}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {(member.fullName || member.email || 'U')[0]}
                      </div>
                      <div>
                        <span className="font-bold text-foreground">
                          {member.fullName} {member.id === userData?.uid ? '(You)' : ''}
                        </span>
                        <p className="text-xs text-muted-foreground">Team Member</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-1 bg-muted rounded-lg text-xs font-semibold uppercase">{member.currentRank || 'Member'}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold">
                    {member.directReferralsCount || 0}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${member.activityState === 'active' ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-500'}`}>
                      {member.activityState === 'active' ? 'Active' : 'Dormant'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-bold">
                      {member.contributionScore || 0} pts
                    </span>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    You are not part of any team.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
