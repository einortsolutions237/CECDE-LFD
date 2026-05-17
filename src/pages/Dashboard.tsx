import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Users, UserPlus, Award, DollarSign, TrendingUp, Copy, Check } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const { userData } = useAuth();
  const [networkStats, setNetworkStats] = useState<any>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [actualDirectCount, setActualDirectCount] = useState<number>(0);
  const [actualDownlineCount, setActualDownlineCount] = useState<number>(0);
  const [activeMembers, setActiveMembers] = useState<number>(0);
  const [dormantMembers, setDormantMembers] = useState<number>(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localReferralCode, setLocalReferralCode] = useState<string>('');
  
  // New Team State
  const [teamData, setTeamData] = useState<any>(null);
  const [teamRank, setTeamRank] = useState<number | null>(null);
  const [globalRank, setGlobalRank] = useState<number | null>(null);

  useEffect(() => {
    const fetchTeamInfo = async () => {
       if (!userData?.teamId && userData?.roleType !== 'team_leader') return;
       try {
         let members: any[] = [];
         
         if (userData?.teamId) {
           const tDoc = await getDoc(doc(db, 'teams', userData.teamId));
           if (tDoc.exists()) {
             const data = tDoc.data();
             data.calculatedTotalMembers = (data.totalDownlineCount || 0) + 1;
             setTeamData(data);
           }
  
           // find internal team rank
           const teamMembersRef = collection(db, 'users');
           const q = query(teamMembersRef, where('teamId', '==', userData.teamId));
           const snap = await getDocs(q);
           snap.forEach(d => {
              const u = d.data();
              const dCount = u.directReferralsCount || 0;
              const downlineCount = u.totalDownlineCount || 0;
              const active = u.activityState === 'active' ? 1 : 0;
              members.push({ id: d.id, score: (dCount * 5) + ((downlineCount - dCount) * 2) + (active * 3) });
           });
         } else if (userData?.roleType === 'team_leader') {
           // Fallback for legacy team leaders without a teamId
           setTeamData({
             teamLeaderName: userData.fullName || 'You',
             teamLeaderId: userData.uid,
             leaderPerformanceScore: 0,
             calculatedTotalMembers: (userData.totalDownlineCount || 0) + 1
           });
           const teamMembersRef = collection(db, 'users');
           const q = query(teamMembersRef, where('sponsorId', '==', userData.uid));
           const snap = await getDocs(q);
           snap.forEach(d => {
              const u = d.data();
              const dCount = u.directReferralsCount || 0;
              const downlineCount = u.totalDownlineCount || 0;
              const active = u.activityState === 'active' ? 1 : 0;
              members.push({ id: d.id, score: (dCount * 5) + ((downlineCount - dCount) * 2) + (active * 3) });
           });
         }
         
         members.sort((a, b) => b.score - a.score);
         const internalRankIndex = members.findIndex(m => m.id === userData?.uid);
         setTeamRank(internalRankIndex !== -1 ? internalRankIndex + 1 : null);

         if (userData?.roleType === 'team_leader') {
            const globalQ = query(collection(db, 'teams'), orderBy('leaderPerformanceScore', 'desc'));
            const gSnap = await getDocs(globalQ);
            let gRank = 1;
            let found = false;
            gSnap.forEach(gDoc => {
               if (gDoc.data().teamLeaderId === userData?.uid) found = true;
               if (!found) gRank++;
            });
            if (found) setGlobalRank(gRank);
         }
       } catch (e) {
         console.error("Error fetching team stats", e);
       }
    };

    const fetchNetwork = async () => {
      if (userData?.uid) {
        // If user document is missing a referral code (legacy users), generate one
        if (!userData.referralCode && !localReferralCode) {
          const newRefCode = (userData.fullName || 'USER').replace(/\s+/g, '').substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
          try {
            await updateDoc(doc(db, 'users', userData.uid), { referralCode: newRefCode });
            setLocalReferralCode(newRefCode);
          } catch (error) {
            console.error("Error updating missing referral code", error);
            setLocalReferralCode('ERROR');
          }
        } else if (userData.referralCode) {
           setLocalReferralCode(userData.referralCode);
        }

        try {
          const snap = await getDoc(doc(db, 'network', userData.uid));
          if (snap.exists()) {
            setNetworkStats(snap.data());
          }

          // Fetch recent direct referrals for activity
          if (userData.referralCode) {
             // Query based on sponsor referral code (or sponsorId fallback)
             const usersRef = collection(db, 'users');
             const q = query(usersRef, where('sponsorId', 'in', [userData.uid, userData.referralCode]));
             const querySnapshot = await getDocs(q);
             const referrals: any[] = [];
             querySnapshot.forEach(doc => {
               const data = doc.data();
               referrals.push({
                 id: doc.id,
                 ...data,
                 timestamp: data.createdAt?.toMillis() || Date.now()
               });
             });
             
             // Sort locally since firestore might need composite index
             referrals.sort((a, b) => b.timestamp - a.timestamp);
             
             setActualDirectCount(referrals.length);
             setRecentActivities(referrals.slice(0, 5));

             // Format chart data (referrals per month)
             const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
             const currentMonth = new Date().getMonth();
             const counts = new Array(6).fill(0);
             
             referrals.forEach(ref => {
               const date = new Date(ref.timestamp);
               const monthDiff = currentMonth - date.getMonth() + (12 * (new Date().getFullYear() - date.getFullYear()));
               if (monthDiff >= 0 && monthDiff < 6) {
                  counts[5 - monthDiff]++;
               }
             });

             const cData = [];
             for (let i = 5; i >= 0; i--) {
               const mIndex = (currentMonth - i + 12) % 12;
               cData.push({
                 name: months[mIndex],
                 referrals: counts[5 - i]
               });
             }
             setChartData(cData);
             
             // Compute exact total downline for demo robustness
             try {
               const allUsers = await getDocs(collection(db, 'users'));
               const usersMap: Record<string, string> = {};
               const userStates: Record<string, string> = {};
               allUsers.forEach(u => {
                 usersMap[u.id] = u.data().sponsorId;
                 userStates[u.id] = u.data().activityState || 'dormant';
               });
               
               let downlines = 0;
               let activeCount = 0;
               let dormantCount = 0;
               const countDownlines = (sponsorId: string) => {
                  Object.keys(usersMap).forEach(uid => {
                     if (usersMap[uid] === sponsorId) {
                         downlines++;
                         if (userStates[uid] === 'active') activeCount++;
                         else dormantCount++;
                         countDownlines(uid);
                     }
                  });
               };
               countDownlines(userData.uid);
               setActualDownlineCount(downlines);
               setActiveMembers(activeCount);
               setDormantMembers(dormantCount);
             } catch (e) {
               console.error("Failed downline computation:", e);
             }
          }
        } catch (error: any) {
          console.error("Error fetching network data:", error);
          if (error.message && error.message.toLowerCase().includes('permission')) {
             setNetworkStats({ 
               error: 'Missing permissions to fetch network. If you are using your own Firebase project, please update your firestore.rules to allow read access.' 
             });
          } else {
             handleFirestoreError(error, OperationType.GET, `network/${userData.uid}`);
          }
        }
      }
    };

    fetchTeamInfo();
    fetchNetwork();
  }, [userData]);

  const displayReferralCode = localReferralCode || userData?.referralCode || 'GENERATING...';
  const referralLink = `${window.location.origin}/register?ref=${displayReferralCode}`;

  const copyRefLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Rank computation
  const directCount = actualDirectCount > 0 ? actualDirectCount : (userData?.directReferralsCount || 0);
  let nextRank = 'Bronze';
  let targetCount = 5;
  if (directCount >= 50) {
    nextRank = 'Max Rank';
    targetCount = 50;
  } else if (directCount >= 30) {
    nextRank = 'Diamond';
    targetCount = 50;
  } else if (directCount >= 15) {
    nextRank = 'Gold';
    targetCount = 30;
  } else if (directCount >= 5) {
    nextRank = 'Silver';
    targetCount = 15;
  }
  
  const progressPercent = Math.min(100, Math.round((directCount / targetCount) * 100));
  const remaining = Math.max(0, targetCount - directCount);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="flex items-start justify-between z-10">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">Welcome back, {userData?.fullName?.split(' ')[0] || 'User'}!</h2>
              <p className="text-sm text-muted-foreground mb-6">Here is what's happening with your network today.</p>
            </div>
            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              {userData?.currentRank || 'Member'}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Your Referral Link & Code</h3>
            
            <div className="flex items-center gap-3 mb-3 bg-muted px-4 py-2.5 rounded-xl border border-border shadow-inner">
              <div className="flex-1 font-mono text-sm font-bold tracking-wide text-primary">
                {displayReferralCode}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(displayReferralCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Copy Code"
              >
                {codeCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-primary" />}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
              <div className="flex-1 bg-muted px-4 py-2.5 rounded-xl border border-border text-xs sm:text-sm font-medium text-foreground w-full break-all shadow-inner truncate">
                {referralLink}
              </div>
              <button 
                onClick={copyRefLink}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl hover:opacity-90 hover:shadow-md transition-all text-sm font-medium"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied Link' : 'Copy Link'}
              </button>
            </div>

            <div className="flex gap-2">
               <a 
                 href={`https://wa.me/?text=Join%20my%20network%20on%20CECDE!%20Use%20my%20referral%20link:%20${encodeURIComponent(referralLink)}`}
                 target="_blank"
                 rel="noreferrer"
                 className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors rounded-lg text-xs font-bold"
               >
                 WhatsApp
               </a>
               <a 
                 href={`mailto:?subject=Join my CECDE Network&body=Hi!%0A%0AJoin%20my%20network%20using%20the%20link%20below:%0A${encodeURIComponent(referralLink)}%0A%0AOr%20use%20my%20code:%20${displayReferralCode}`}
                 className="flex-1 flex items-center justify-center gap-2 py-2 bg-muted hover:bg-muted/80 transition-colors rounded-lg text-xs text-foreground font-bold"
               >
                 Email Share
               </a>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-center">
           <h3 className="text-sm font-medium text-muted-foreground mb-3">Rank Progress</h3>
           <div className="flex items-end gap-2 mb-2">
             <div className="text-3xl font-bold text-foreground">{progressPercent}<span className="text-lg text-muted-foreground">%</span></div>
             <div className="text-sm text-success font-medium mb-1">{nextRank === 'Max Rank' ? 'Maxed' : `to ${nextRank}`}</div>
           </div>
           
           <div className="w-full bg-muted rounded-full h-2.5 mb-2 overflow-hidden">
             <div className="bg-primary h-2.5 rounded-full" style={{ width: `${progressPercent}%` }}></div>
           </div>
           {nextRank !== 'Max Rank' ? (
             <p className="text-xs text-muted-foreground">You need {remaining} more direct referrals to rank up.</p>
           ) : (
             <p className="text-xs text-muted-foreground">You have reached the highest referral rank!</p>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Downline" 
          value={actualDownlineCount > 0 ? actualDownlineCount : (networkStats?.totalDownlineCount || userData?.totalDownlineCount || 0)} 
          icon={<Users className="w-5 h-5 text-primary" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Direct Referrals" 
          value={directCount} 
          icon={<UserPlus className="w-5 h-5 text-primary" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Active Members" 
          value={networkStats?.activeDownlineCount || 0} 
          icon={<TrendingUp className="w-5 h-5 text-primary" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Wallet Balance" 
          value={`$${userData?.walletBalance || 0}`} 
          icon={<DollarSign className="w-5 h-5 text-primary" />} 
          trend="Available to withdraw"
          trendUp={null}
        />
      </div>

      {(userData?.teamId || userData?.roleType === 'team_leader') && (
        <div className="mt-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-4">
            {userData.roleType === 'team_leader' ? 'Your Team Performance' : `Team: ${teamData?.teamLeaderName || 'Loading...'}`}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5 shadow-sm">
               <p className="text-sm text-foreground/80 font-medium mb-1">Total Team Members</p>
               <h3 className="text-3xl font-bold tracking-tight text-primary">{teamData?.calculatedTotalMembers || teamData?.totalMembers || 0}</h3>
            </div>
            {userData.roleType === 'team_leader' ? (
              <div className="bg-gradient-to-br from-yellow-400/10 to-yellow-500/5 rounded-2xl border border-yellow-500/20 p-5 shadow-sm">
                 <p className="text-sm text-foreground/80 font-medium mb-1">Global Team Rank</p>
                 <h3 className="text-3xl font-bold tracking-tight text-yellow-600">#{globalRank || '-'}</h3>
                 <p className="text-xs text-yellow-600/80 mt-1">{teamData?.leaderPerformanceScore || 0} pts</p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-400/10 to-blue-500/5 rounded-2xl border border-blue-500/20 p-5 shadow-sm">
                 <p className="text-sm text-foreground/80 font-medium mb-1">My Rank in Team</p>
                 <h3 className="text-3xl font-bold tracking-tight text-blue-600">#{teamRank || '-'}</h3>
              </div>
            )}
            
            <div className="bg-gradient-to-br from-success/10 to-success/5 rounded-2xl border border-success/20 p-5 shadow-sm">
               <p className="text-sm text-foreground/80 font-medium mb-1">Active Team Members</p>
               <h3 className="text-3xl font-bold tracking-tight text-success">{teamData?.activeMembers || 0}</h3>
            </div>
            
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm overflow-hidden relative">
               <p className="text-sm text-muted-foreground font-medium mb-1">{userData.roleType === 'team_leader' ? 'Team Score' : 'Leader Name'}</p>
               <h3 className="text-3xl font-bold tracking-tight text-foreground">
                 {userData.roleType === 'team_leader' ? `${teamData?.leaderPerformanceScore || 0} pts` : teamData?.teamLeaderName || '-'}
               </h3>
               {userData.roleType !== 'team_leader' && <p className="text-xs text-muted-foreground mt-1">Leader ID: {teamData?.teamLeaderId || '-'}</p>}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-4">Team Activity Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl border border-success/20 p-5 shadow-sm flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-success/5 rounded-bl-full -z-10"></div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success"></div>
                <h3 className="text-sm font-medium text-muted-foreground">Active Members</h3>
              </div>
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-foreground">{activeMembers}</span>
              <span className="text-sm font-medium text-success">{actualDownlineCount > 0 ? Math.round((activeMembers / actualDownlineCount) * 100) : 0}% of team</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Total active downlines</p>
          </div>
          <div className="bg-card rounded-2xl border border-purple-500/20 p-5 shadow-sm flex flex-col relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-full -z-10"></div>
             <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <h3 className="text-sm font-medium text-muted-foreground">Dormant Members</h3>
              </div>
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-foreground">{dormantMembers}</span>
              <span className="text-sm font-medium text-purple-500">{actualDownlineCount > 0 ? Math.round((dormantMembers / actualDownlineCount) * 100) : 0}% of team</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Total dormant downlines</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Referral Growth</h2>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-secondary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} tickLine={false} axisLine={false} dy={10} />
                <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: 'var(--color-foreground)' }}
                />
                <Area type="monotone" dataKey="referrals" stroke="var(--color-secondary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRef)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Recent Activity</h2>
          <div className="flex flex-col gap-6">
            {recentActivities.length > 0 ? recentActivities.map((act, i) => (
               <div key={i} className="flex gap-6">
                 <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 text-secondary" />
                 </div>
                 <div>
                   <p className="text-sm font-semibold text-foreground mb-0.5">New referral joined</p>
                   <p className="text-xs text-muted-foreground mb-1.5">{act.fullName || 'A new user'} registered using your link.</p>
                   <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
                     {new Date(act.timestamp).toLocaleDateString()}
                   </p>
                 </div>
               </div>
            )) : (
               <div className="flex flex-col items-center justify-center text-center p-4">
                 <p className="text-sm text-muted-foreground">No recent activity.</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, trendUp }: any) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        {trend && (
          <div className={cn("text-xs font-semibold px-2 py-1 rounded-full", trendUp === true ? "bg-success/10 text-success" : trendUp === false ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
            {trend}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
      <div className="text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}
