import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { Download, Filter, FileText, TrendingUp, Users, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

const COLORS = ['#16A34A', '#6C3BAA', '#F59E0B', '#3B82F6', '#EC4899'];
const AREA_COLORS = { primary: '#6C3BAA', secondary: '#16A34A' };

export default function Reports() {
  const { userData } = useAuth();
  const [directMembers, setDirectMembers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      try {
        const q = query(
          collection(db, 'users'), 
          where('sponsorId', 'in', [userData.uid, userData.referralCode])
        );
        const querySnapshot = await getDocs(q);
        const members: any[] = [];
        querySnapshot.forEach(doc => {
           const data = doc.data();
           members.push({
             ...data,
             timestamp: data.createdAt?.toMillis() || Date.now()
           });
        });
        setDirectMembers(members);
      } catch (err: any) {
        console.error("Error fetching report data", err);
        if (!err.message?.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      }
    };
    fetchData();
  }, [userData]);

  const { barData, pieData, areaData, metrics } = useMemo(() => {
    // Pie Data (Rank Distribution)
    const rDist: Record<string, number> = {};
    const now = Date.now();
    const millisInWeek = 1000 * 60 * 60 * 24 * 7;
    const millisInMonth = 1000 * 60 * 60 * 24 * 30;
    
    // Bar data array mapping weeks 1 to 4 ago.
    const bData = [
      { name: '3 Wks Ago', referrals: 0, active: 0, dormant: 0 },
      { name: '2 Wks Ago', referrals: 0, active: 0, dormant: 0 },
      { name: 'Last Week', referrals: 0, active: 0, dormant: 0 },
      { name: 'This Week', referrals: 0, active: 0, dormant: 0 }
    ];

    // Area data array mapping months 1 to 6 ago.
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const aData = new Array(6).fill(0).map((_, i) => ({
      name: months[(currentMonth - 5 + i + 12) % 12],
      totalGrowth: 0,
      activeGrowth: 0
    }));

    let activeTotal = 0;

    directMembers.forEach(m => {
       const rank = m.currentRank || 'Member';
       rDist[rank] = (rDist[rank] || 0) + 1;

       if (m.activityState === 'active') {
         activeTotal++;
       }

       const diff = now - m.timestamp;
       const weekDiff = Math.floor(diff / millisInWeek);
       if (weekDiff < 4) {
         const idx = 3 - weekDiff;
         bData[idx].referrals++;
         if (m.activityState === 'active') {
           bData[idx].active++;
         } else {
           bData[idx].dormant++;
         }
       }

       const date = new Date(m.timestamp);
       const monthDiff = currentMonth - date.getMonth() + (12 * (new Date().getFullYear() - date.getFullYear()));
       if (monthDiff >= 0 && monthDiff < 6) {
         aData[5 - monthDiff].totalGrowth += 1 + (m.totalDownlineCount || 0);
         if (m.activityState === 'active') {
           aData[5 - monthDiff].activeGrowth += 1; // Simplification
         }
       }
    });

    // Accumulate total growth for area chart to show cumulative network growth over time
    let cumulativeTotal = 0;
    let cumulativeActive = 0;
    aData.forEach(d => {
      cumulativeTotal += d.totalGrowth;
      cumulativeActive += d.activeGrowth;
      d.totalGrowth = cumulativeTotal;
      d.activeGrowth = cumulativeActive;
    });
    
    const pData = Object.entries(rDist).map(([name, value]) => ({ name, value }));

    const conversionRate = directMembers.length > 0 ? ((activeTotal / directMembers.length) * 100).toFixed(1) : '0.0';

    return { 
      barData: bData, 
      pieData: pData, 
      areaData: aData,
      metrics: {
        totalReferrals: directMembers.length,
        activeReferrals: activeTotal,
        conversionRate,
        recentGrowth: bData[3].referrals
      }
    };
  }, [directMembers]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics & Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Detailed performance metrics, conversion rates, and network growth.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button className="btn-secondary">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex-1 sm:flex-none btn-primary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* METRICS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card flex items-center gap-6 card-hover">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Referrals</p>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">{metrics.totalReferrals}</h3>
          </div>
        </div>
        
        <div className="card flex items-center gap-6 card-hover">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Active Referrals</p>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">{metrics.activeReferrals}</h3>
          </div>
        </div>

        <div className="card flex items-center gap-6 card-hover">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">{metrics.conversionRate}%</h3>
          </div>
        </div>

        <div className="card flex items-center gap-6 card-hover">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Recent Growth</p>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">+{metrics.recentGrowth} this week</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* NETWORK GROWTH OVER TIME (AREA CHART) */}
        <div className="xl:col-span-2 card flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Cumulative Network Growth (6 Months)</h2>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AREA_COLORS.primary} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={AREA_COLORS.primary} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AREA_COLORS.secondary} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={AREA_COLORS.secondary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                   contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="totalGrowth" name="Total Network Size" stroke={AREA_COLORS.primary} fillOpacity={1} fill="url(#colorTotal)" strokeWidth={2} />
                <Area type="monotone" dataKey="activeGrowth" name="Active Network Size" stroke={AREA_COLORS.secondary} fillOpacity={1} fill="url(#colorActive)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RANK DISTRIBUTION PIE CHART */}
        <div className="card flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Directs Rank Distribution</h2>
          <div className="w-full h-[220px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '0.875rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
             {pieData.length > 0 ? pieData.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {entry.name}
                  </div>
                  <div className="font-bold text-foreground">{entry.value}</div>
                </div>
             )) : (
                <div className="text-center text-sm text-muted-foreground">No data available</div>
             )}
          </div>
        </div>
      </div>

      {/* REFERRAL PERFORMANCE BARCHART */}
      <div className="card flex flex-col">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Recent Referral Performance (Last 4 Weeks)</h2>
        <div className="flex gap-6 mb-4 items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
               <span className="w-3 h-3 rounded-sm bg-primary block"></span>
               Total Referrals Added
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
               <span className="w-3 h-3 rounded-sm bg-secondary block"></span>
               Became Active
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
               <span className="w-3 h-3 rounded-sm bg-border block"></span>
               Remained Dormant
            </div>
        </div>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
              <Tooltip 
                 contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 cursor={{fill: 'var(--color-muted)', opacity: 0.4}}
              />
              <Bar dataKey="active" stackId="a" name="Active Joiners" fill="var(--color-secondary)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="dormant" stackId="a" name="Dormant Joiners" fill="var(--color-border)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card flex items-start gap-6 cursor-pointer hover:bg-muted/30 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
             <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground mb-1">Generate Monthly Analytics PDF</h3>
            <p className="text-xs text-muted-foreground">Download a detailed overview of all network stats, referral conversion rates, and ranks for the previous month.</p>
          </div>
        </div>
        <div className="card flex items-start gap-6 cursor-pointer hover:bg-muted/30 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
             <FileText className="w-6 h-6 text-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground mb-1">Full Database CSV Export</h3>
            <p className="text-xs text-muted-foreground">Download raw CSV data for offline analysis of registrations and network structure.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
