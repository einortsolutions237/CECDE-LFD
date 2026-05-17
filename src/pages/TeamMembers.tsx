import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, or } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Users, Award, Shield, User, TrendingUp } from 'lucide-react';

export default function TeamMembers() {
  const { userData } = useAuth();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teamStats, setTeamStats] = useState({ totalMembers: 0, activeMembers: 0, totalDownline: 0 });

  useEffect(() => {
    let unsubscribe: () => void;

    const fetchTeamMembers = () => {
      if (userData?.roleType !== 'team_leader') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch all users to accurately map the network
        const usersQuery = query(collection(db, 'users'));
        
        unsubscribe = onSnapshot(usersQuery, (snapshot) => {
          const allUsers: any[] = [];
          snapshot.forEach(doc => {
             allUsers.push({ id: doc.id, ...doc.data() });
          });

          // Build adjacency list for exact downline calculation
          const adjList = new Map<string, string[]>();
          allUsers.forEach(u => adjList.set(u.id, []));
          allUsers.forEach(u => {
            if (u.sponsorId && adjList.has(u.sponsorId)) {
               adjList.get(u.sponsorId)!.push(u.id);
            }
          });

          // Determine the team members
          let members: any[] = [];
          if (userData.teamId) {
             members = allUsers.filter(u => u.teamId === userData.teamId || u.sponsorId === userData.uid);
          } else {
             members = allUsers.filter(u => u.sponsorId === userData.uid);
          }

          // De-duplicate in case of overlap
          members = Array.from(new Set(members.map(m => m.id))).map(id => members.find(m => m.id === id));
          
          // Remove the leader themselves
          members = members.filter(m => m.id !== userData.uid);

          let activeCount = 0;
          let calculatedTotalDownline = 0;

          // Compute exact referals dynamically 
          members.forEach(member => {
             const directs = adjList.get(member.id) || [];
             member.calculatedDirectReferrals = directs.length;

             // active check
             if (member.accountStatus === 'active') {
                activeCount++;
             }
          });

          // Sort by computed referrals desc
          members.sort((a, b) => (b.calculatedDirectReferrals || 0) - (a.calculatedDirectReferrals || 0));

          // Calculate total network growth specifically for the leader
          let leaderDownlineCount = 0;
          const stack = [...(adjList.get(userData.uid) || [])];
          while (stack.length > 0) {
            const current = stack.pop()!;
            leaderDownlineCount++;
            const children = adjList.get(current) || [];
            stack.push(...children);
          }

          setTeamMembers(members);
          setTeamStats({
            totalMembers: leaderDownlineCount + 1, // Leader + directs + indirects
            activeMembers: activeCount + (userData.accountStatus === 'active' ? 1 : 0),
            totalDownline: leaderDownlineCount
          });
          setLoading(false);
        }, (err) => {
          console.error("Error fetching team members:", err);
          setError("Failed to load team members.");
          setLoading(false);
        });
      } catch (err: any) {
        console.error("Setup error:", err);
        setError("Failed to setup team members listener.");
        setLoading(false);
      }
    };

    fetchTeamMembers();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (userData?.roleType !== 'team_leader') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Access Denied</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          This page is restricted to Team Leaders. If you believe this is an error, please contact the administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-[900] tracking-[-0.02em] text-foreground">Team Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and view the performance of your assigned team members.</p>
        </div>
      </div>

      {error ? (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl text-sm font-semibold">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Team Members</p>
                <h3 className="text-3xl font-bold tracking-tight text-foreground">{teamStats.totalMembers}</h3>
              </div>
            </div>
            
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Members</p>
                <h3 className="text-3xl font-bold tracking-tight text-foreground">{teamStats.activeMembers}</h3>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Network Growth</p>
                <h3 className="text-3xl font-bold tracking-tight text-foreground">{teamStats.totalDownline}</h3>
              </div>
            </div>
          </div>

          <div className="bg-card shadow-sm rounded-2xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border bg-muted/20">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Team Roster
              </h2>
            </div>
            
            <div className="table-scroll-container">
              {teamMembers.length > 0 ? (
                <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
                  <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border tracking-wider whitespace-nowrap">
                    <tr>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Name & Email</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Referrals</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teamMembers.map(member => (
                      <tr key={member.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                          <div className="font-bold text-foreground">{member.fullName || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                          <div className="text-xs text-muted-foreground mt-1">Ref Code: <span className="font-mono text-primary">{member.referralCode}</span></div>
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-primary whitespace-nowrap">
                          {member.currentRank || 'Unranked'}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                          {member.calculatedDirectReferrals || 0}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${member.accountStatus === 'active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {member.accountStatus || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-foreground mb-1">No Members Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    You don't have any members in your team yet. Users who sign up under your referral link will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
