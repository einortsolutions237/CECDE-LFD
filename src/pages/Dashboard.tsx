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
             
             // Use precomputed values for efficiency
             setActualDownlineCount(userData.totalDownlineCount || 0);
             
             let activeCount = 0;
             let dormantCount = 0;
             referrals.forEach(ref => {
               if (ref.activityState === 'active') activeCount++;
               else dormantCount++;
             });
             setActiveMembers(activeCount);
             setDormantMembers(dormantCount);

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
        <div className="col-span-1 md:col-span-2 card flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="flex items-start justify-between z-10 mb-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground mb-1">Welcome back, {userData?.fullName?.split(' ')[0] || 'User'}!</h2>
              <p className="text-sm font-medium text-muted-foreground">Here is what's happening with your network today.</p>
            </div>
            <div className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
              {userData?.currentRank || 'Member'}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">Your Referral Link & Code</h3>
            
            <div className="flex items-center gap-3 mb-4 bg-muted/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-border shadow-inner">
              <div className="flex-1 font-mono text-sm md:text-base font-bold tracking-wide text-foreground">
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

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
              <div className="flex-1 bg-muted/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-border text-xs md:text-sm font-medium text-muted-foreground w-full break-all shadow-inner truncate">
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

            <div className="flex gap-3">
               <a 
                 href={`https://wa.me/?text=Join%20my%20network%20on%20CECDE!%20Use%20my%20referral%20link:%20${encodeURIComponent(referralLink)}`}
                 target="_blank"
                 rel="noreferrer"
                 className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all rounded-xl text-sm font-bold shadow-sm"
               >
                 WhatsApp
               </a>
               <a 
                 href={`mailto:?subject=Join my CECDE Network&body=Hi!%0A%0AJoin%20my%20network%20using%20the%20link%20below:%0A${encodeURIComponent(referralLink)}%0A%0AOr%20use%20my%20code:%20${displayReferralCode}`}
                 className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-muted hover:bg-muted/80 transition-all rounded-xl text-sm text-foreground font-bold shadow-sm border border-border"
               >
                 Email Share
               </a>
            </div>
          </div>
        </div>

        <div className="card flex flex-col justify-center">
           <h3 className="text-sm font-bold tracking-widest uppercase text-muted-foreground mb-4">Rank Progress</h3>
           <div className="flex items-end gap-3 mb-3">
             <div className="text-4xl font-extrabold tracking-tight text-foreground">{progressPercent}<span className="text-xl text-muted-foreground font-semibold">%</span></div>
             <div className="text-sm text-success font-medium mb-1">{nextRank === 'Max Rank' ? 'Maxed' : `to ${nextRank}`}</div>
           </div>
           
           <div className="w-full bg-muted rounded-full h-3 mb-3 overflow-hidden shadow-inner">
             <div className="bg-primary h-3 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
           </div>
           {nextRank !== 'Max Rank' ? (
             <p className="text-sm text-muted-foreground font-medium">You need <strong className="text-foreground">{remaining}</strong> more direct referrals to rank up.</p>
           ) : (
             <p className="text-sm text-muted-foreground font-medium">You have reached the highest referral rank!</p>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Downline" 
          value={actualDownlineCount > 0 ? actualDownlineCount.toLocaleString() : (networkStats?.totalDownlineCount || userData?.totalDownlineCount || 0).toLocaleString()} 
          icon={<Users className="w-5 h-5 text-primary" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Direct Referrals" 
          value={directCount.toLocaleString()} 
          icon={<UserPlus className="w-5 h-5 text-emerald-500" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Active Members" 
          value={(networkStats?.activeDownlineCount || 0).toLocaleString()} 
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />} 
          trend=""
          trendUp={null}
        />
        <StatCard 
          title="Wallet Balance" 
          value={`$${(userData?.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
          icon={<DollarSign className="w-5 h-5 text-amber-500" />} 
          trend="Available"
          trendUp={null}
        />
      </div>

      {(userData?.teamId || userData?.roleType === 'team_leader') && (
        <div className="mt-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-6">
            {userData.roleType === 'team_leader' ? 'Your Team Performance' : `Team: ${teamData?.teamLeaderName || 'Loading...'}`}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="card border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
               <p className="text-sm text-primary font-bold uppercase tracking-widest mb-2">Total Members</p>
               <h3 className="text-4xl font-extrabold tracking-tight text-foreground">{teamData?.calculatedTotalMembers?.toLocaleString() || teamData?.totalMembers?.toLocaleString() || 0}</h3>
            </div>
            {userData.roleType === 'team_leader' ? (
              <div className="card border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors">
                 <p className="text-sm text-yellow-600 font-bold uppercase tracking-widest mb-2">Global Team Rank</p>
                 <h3 className="text-4xl font-extrabold tracking-tight text-foreground">#{globalRank || '-'}</h3>
                 <p className="text-sm font-semibold text-yellow-600/80 mt-2">{teamData?.leaderPerformanceScore?.toLocaleString() || 0} pts</p>
              </div>
            ) : (
              <div className="card border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                 <p className="text-sm text-blue-600 font-bold uppercase tracking-widest mb-2">My Rank in Team</p>
                 <h3 className="text-4xl font-extrabold tracking-tight text-foreground">#{teamRank || '-'}</h3>
              </div>
            )}
            
            <div className="card border-success/20 bg-success/5 hover:bg-success/10 transition-colors">
               <p className="text-sm text-success font-bold uppercase tracking-widest mb-2">Active Members</p>
               <h3 className="text-4xl font-extrabold tracking-tight text-foreground">{teamData?.activeMembers?.toLocaleString() || 0}</h3>
            </div>
            
            <div className="card">
               <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-2">{userData.roleType === 'team_leader' ? 'Team Score' : 'Leader Name'}</p>
               <h3 className="text-4xl font-extrabold tracking-tight text-foreground">
                 {userData.roleType === 'team_leader' ? `${teamData?.leaderPerformanceScore?.toLocaleString() || 0} pts` : teamData?.teamLeaderName || '-'}
               </h3>
               {userData.roleType !== 'team_leader' && <p className="text-xs font-semibold text-muted-foreground mt-2">ID: {teamData?.teamLeaderId || '-'}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-6">Team Activity Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="card border-success/20 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-success/5 rounded-bl-full -z-10"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success"></div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Active Members</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-4xl font-extrabold tracking-tight text-foreground">{activeMembers?.toLocaleString()}</span>
              <span className="text-sm font-bold text-success bg-success/10 px-2 py-0.5 rounded-md">{actualDownlineCount > 0 ? Math.round((activeMembers / actualDownlineCount) * 100) : 0}% of team</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Total active downlines</p>
          </div>
          <div className="card border-destructive/20 flex flex-col relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 rounded-bl-full -z-10"></div>
             <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive"></div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Dormant Members</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-4xl font-extrabold tracking-tight text-foreground">{dormantMembers?.toLocaleString()}</span>
              <span className="text-sm font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">{actualDownlineCount > 0 ? Math.round((dormantMembers / actualDownlineCount) * 100) : 0}% of team</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Total dormant downlines</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Referral Growth</h2>
          </div>
          <div className="h-[320px] w-full">
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

        <div className="card flex flex-col">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-8">Recent Activity</h2>
          <div className="flex flex-col gap-6">
            {recentActivities.length > 0 ? recentActivities.map((act, i) => (
               <div key={i} className="flex gap-4 group">
                 <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <UserPlus className="w-5 h-5 text-secondary" />
                 </div>
                 <div className="flex-1">
                   <p className="text-sm font-bold text-foreground mb-1">New referral joined</p>
                   <p className="text-sm font-medium text-muted-foreground mb-2">{act.fullName || 'A new user'} registered using your link.</p>
                   <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground/60">
                     {new Date(act.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric'})}
                   </p>
                 </div>
               </div>
            )) : (
               <div className="flex flex-col items-center justify-center gap-4 text-center p-8 border border-dashed border-border rounded-xl">
                 <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                   <Users className="w-5 h-5 text-muted-foreground" />
                 </div>
                 <p className="text-sm font-medium text-muted-foreground">No recent activity found. Share your link to grow your network!</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = React.memo(({ title, value, icon, trend, trendUp }: any) => {
  return (
    <div className="card card-hover flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary shadow-sm border border-border">
          {icon}
        </div>
        {trend && (
          <div className={cn("text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-sm", trendUp === true ? "bg-success/10 text-success" : trendUp === false ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
            {trend}
          </div>
        )}
      </div>
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div className="text-4xl font-extrabold tracking-tight text-foreground">{value}</div>
    </div>
  );
});
StatCard.displayName = 'StatCard';
