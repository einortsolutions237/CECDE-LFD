import React, { useState, useEffect, useMemo } from 'react';
import { Users, UserCheck, UserX, Network, GitMerge, DollarSign } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell 
} from 'recharts';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';

const RANK_COLORS = ['#6C3BAA', '#16A34A', '#F59E0B', '#3B82F6', '#EC4899'];

export default function AdminDashboard() {
  const [usersInfo, setUsersInfo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const q = query(collection(db, 'users'));
        const sn = await getDocs(q);
        const u: any[] = [];
        sn.forEach(doc => {
          const d = doc.data();
          u.push({
            id: doc.id,
            ...d,
            timestamp: d.createdAt?.toMillis() || Date.now()
          });
        });
        setUsersInfo(u);
      } catch (err: any) {
        console.error("Error fetching users:", err);
        handleFirestoreError(err, OperationType.LIST, 'users');
      } finally {
        setLoading(false);
      }
    };
    fetchAllUsers();
  }, []);

  const { stats, growthData, rankDistribution, recentActivities } = useMemo(() => {
    let totalUsers = 0;
    let activeUsers = 0;
    let dormantUsers = 0;
    let accountActive = 0;
    let suspended = 0;
    let totalDownlines = 0;
    
    const rDist: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    const gData = new Array(6).fill(0).map((_, i) => ({
      name: months[(currentMonth - 5 + i + 12) % 12],
      users: 0,
      referrals: 0
    }));

    usersInfo.forEach(u => {
      totalUsers++;
      if (u.accountStatus === 'active') accountActive++;
      if (u.accountStatus === 'suspended') suspended++;
      
      if (u.activityState === 'active') activeUsers++;
      else dormantUsers++;

      totalDownlines += (u.totalDownlineCount || 0);

      const rank = u.currentRank || 'Member';
      rDist[rank] = (rDist[rank] || 0) + 1;

      const date = new Date(u.timestamp);
      const monthDiff = currentMonth - date.getMonth() + (12 * (new Date().getFullYear() - date.getFullYear()));
      if (monthDiff >= 0 && monthDiff < 6) {
        gData[5 - monthDiff].users++;
        if (u.sponsorId) {
           gData[5 - monthDiff].referrals++;
        }
      }
    });

    const rankArray = Object.entries(rDist).map(([name, value]) => ({ name, value }));
    const recent = [...usersInfo].sort((a,b) => b.timestamp - a.timestamp).slice(0, 5);

    return {
      stats: { totalUsers, activeUsers, dormantUsers, accountActive, suspended, totalDownlines },
      growthData: gData,
      rankDistribution: rankArray,
      recentActivities: recent
    };
  }, [usersInfo]);

  if (loading) {
     return <div className="p-8 text-center text-muted-foreground">Loading admin stats...</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Users</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.totalUsers}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Active Users</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.activeUsers}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Dormant Users</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.dormantUsers}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Suspended</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.suspended}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Network className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Rank Changes</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">0</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center text-[#F59E0B]">
              <GitMerge className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Downlines</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.totalDownlines}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Revenue</h3>
          <div className="text-3xl font-bold tracking-tight text-foreground">$0.00</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Growth Chart */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">User Registration & Growth (Last 6 Months)</h2>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="users" stroke="#6C3BAA" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} name="Registrations" />
                <Line type="monotone" dataKey="referrals" stroke="#16A34A" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} name="Referrals" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rank Distribution */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Rank Distribution</h2>
          <div className="w-full h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rankDistribution}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {rankDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={RANK_COLORS[index % RANK_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
            {rankDistribution.length > 0 ? rankDistribution.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RANK_COLORS[i % RANK_COLORS.length] }} />
                    {entry.name}
                  </div>
                  <div className="font-bold text-foreground">{entry.value}</div>
                </div>
            )) : (
              <div className="text-center text-muted-foreground text-sm">No data available</div>
            )}
          </div>
        </div>

        {/* Activity Distribution */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Activity Distribution</h2>
          <div className="w-full h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Active', value: stats.activeUsers },
                    { name: 'Dormant', value: stats.dormantUsers }
                  ]}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#16A34A" />
                  <Cell fill="#A855F7" />
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-success" />
                Active
              </div>
              <div className="font-bold text-foreground">{stats.activeUsers}</div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                Dormant
              </div>
              <div className="font-bold text-foreground">{stats.dormantUsers}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Recent Registrations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Action</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">User</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Time</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentActivities.length > 0 ? recentActivities.map((act) => (
                <tr key={act.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">User Registration</td>
                  <td className="px-6 py-4">{act.fullName} ({act.currentRank || 'Member'})</td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(act.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="text-success text-xs font-bold uppercase">Success</span>
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No recent activities.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
