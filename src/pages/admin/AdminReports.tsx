import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { 
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend 
} from 'recharts';
import { Users, UserPlus, FileText, CheckCircle, XCircle, ShieldAlert, UsersRound, TrendingUp } from 'lucide-react';

const COLORS = ['#6C3BAA', '#16A34A', '#F59E0B', '#3B82F6', '#EC4899', '#06B6D4', '#8B5CF6'];

export default function AdminReports() {
  const [usersInfo, setUsersInfo] = useState<any[]>([]);
  const [teamsInfo, setTeamsInfo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const uQuery = query(collection(db, 'users'));
        const uSnap = await getDocs(uQuery);
        const users: any[] = [];
        uSnap.forEach(doc => {
          const d = doc.data();
          users.push({
            id: doc.id,
            ...d,
            createdAt: d.createdAt?.toMillis() || Date.now()
          });
        });
        setUsersInfo(users);

        const tQuery = query(collection(db, 'teams'));
        const tSnap = await getDocs(tQuery);
        const teams: any[] = [];
        tSnap.forEach(doc => {
           teams.push({ id: doc.id, ...doc.data() });
        });
        setTeamsInfo(teams);

      } catch (err: any) {
        console.error("Error fetching reports data:", err);
        handleFirestoreError(err, OperationType.LIST, 'reports');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const {
    kpis,
    rankData,
    roleData,
    activityData,
    growthData
  } = useMemo(() => {
    let activeCnt = 0;
    let dormantCnt = 0;
    let suspendedCnt = 0;
    
    let adminCnt = 0;
    let tlCnt = 0;
    let memberCnt = 0;

    const ranks: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const gData = new Array(12).fill(0).map((_, i) => ({
      name: months[(currentMonth - 11 + i + 12) % 12],
      registrations: 0
    }));

    usersInfo.forEach(u => {
      // Status
      if (u.accountStatus === 'suspended') suspendedCnt++;
      else if (u.activityState === 'active' || u.accountStatus === 'active') activeCnt++;
      else dormantCnt++;

      // Role
      if (u.roleType === 'super_admin') adminCnt++;
      else if (u.roleType === 'team_leader') tlCnt++;
      else memberCnt++;

      // Rank
      const rank = u.currentRank || 'Unranked';
      ranks[rank] = (ranks[rank] || 0) + 1;

      // Growth
      const date = new Date(u.createdAt);
      const mDiff = currentMonth - date.getMonth() + (12 * (currentYear - date.getFullYear()));
      if (mDiff >= 0 && mDiff < 12) {
        gData[11 - mDiff].registrations++;
      }
    });

    const rankArray = Object.entries(ranks)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);

    const roleArray = [
      { name: 'Super Admin', value: adminCnt },
      { name: 'Team Leader', value: tlCnt },
      { name: 'Member', value: memberCnt }
    ].filter(x => x.value > 0);

    const actArray = [
      { name: 'Active', value: activeCnt },
      { name: 'Dormant', value: dormantCnt },
      { name: 'Suspended', value: suspendedCnt }
    ];

    return {
      kpis: {
        totalUsers: usersInfo.length,
        totalTeams: teamsInfo.length,
        active: activeCnt,
        suspended: suspendedCnt,
        totalPoints: teamsInfo.reduce((acc, t) => acc + (t.leaderPerformanceScore || 0), 0)
      },
      rankData: rankArray,
      roleData: roleArray,
      activityData: actArray,
      growthData: gData
    };

  }, [usersInfo, teamsInfo]);


  if (loading) {
    return <div className="p-10 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-3xl font-bold text-foreground">System Audit & Reports</h1>
           <p className="text-muted-foreground mt-1">Detailed statistical overview of the entire system</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex flex-col">
           <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
             <Users className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-muted-foreground">Total Users</p>
           <h3 className="text-3xl font-bold tracking-tight">{kpis.totalUsers}</h3>
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex flex-col">
           <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success mb-3">
             <CheckCircle className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-muted-foreground">Active Users</p>
           <h3 className="text-3xl font-bold tracking-tight">{kpis.active}</h3>
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex flex-col">
           <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive mb-3">
             <XCircle className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-muted-foreground">Suspended</p>
           <h3 className="text-3xl font-bold tracking-tight">{kpis.suspended}</h3>
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex flex-col">
           <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
             <UsersRound className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-muted-foreground">Total Teams</p>
           <h3 className="text-3xl font-bold tracking-tight">{kpis.totalTeams}</h3>
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex flex-col">
           <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-600 mb-3">
             <TrendingUp className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-muted-foreground">Total Team Points</p>
           <h3 className="text-3xl font-bold tracking-tight">{kpis.totalPoints}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {/* Growth Trends */}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight mb-6 flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Growth Trends (Last 12 Months)</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                 <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                 <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                 <RechartsTooltip 
                     contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem' }}
                     cursor={{fill: 'var(--color-muted)', opacity: 0.2}}
                 />
                 <Bar dataKey="registrations" fill="#6C3BAA" radius={[4, 4, 0, 0]} name="Registrations" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rank Distribution */}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight mb-6 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500" /> Rank Distribution</h2>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                   <XAxis type="number" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} />
                   <YAxis type="category" dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                   <RechartsTooltip 
                       contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem' }}
                       cursor={{fill: 'var(--color-muted)', opacity: 0.2}}
                   />
                   <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Users" />
                </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Roles Distribution */}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight mb-6 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-yellow-500" /> Roles Distribution</h2>
          <div className="h-[250px] flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={roleData} innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                    {roleData.map((e, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Status */}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-success" /> Activity Status</h2>
          <div className="h-[250px] flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activityData} innerRadius={0} outerRadius={100} dataKey="value">
                    {activityData.map((e, index) => {
                      const color = e.name === 'Active' ? '#16A34A' : e.name === 'Suspended' ? '#DC2626' : '#94A3B8';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Detailed Platform Summary */}
      <div className="mt-8 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
         <div className="p-6 border-b border-border bg-muted/20">
            <h2 className="text-xl font-semibold tracking-tight">System Detailed Summary</h2>
         </div>
         <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
               <div>
                  <p className="text-muted-foreground mb-1">Database Sync:</p>
                  <p className="font-bold text-success flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Real-time Connection</p>
               </div>
               <div>
                  <p className="text-muted-foreground mb-1">Registered Users:</p>
                  <p className="font-bold">{kpis.totalUsers}</p>
               </div>
               <div>
                  <p className="text-muted-foreground mb-1">Teams Evaluated:</p>
                  <p className="font-bold">{kpis.totalTeams}</p>
               </div>
               <div>
                  <p className="text-muted-foreground mb-1">Last Updated:</p>
                  <p className="font-bold">{new Date().toLocaleString()}</p>
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}

