import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  ChevronRight, ChevronDown, User, UserPlus, Copy, Users, 
  Network, UserCheck, Search, Filter, MoreHorizontal, Award, FolderTree
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';

interface TreeNode {
  uid: string;
  fullName: string;
  currentRank: string;
  sponsorId: string;
  referralCode: string;
  children?: TreeNode[];
  isOpen?: boolean;
}

const RANK_COLORS = ['#6C3BAA', '#16A34A', '#F59E0B', '#3B82F6', '#EC4899'];
const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

export default function NetworkTree() {
  const { userData } = useAuth();
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandAll, setExpandAll] = useState(false);
  const [directMembers, setDirectMembers] = useState<any[]>([]);
  const [actualDownlineCount, setActualDownlineCount] = useState<number>(0);
  const [activeM, setActiveM] = useState<number>(0);
  const [dormantM, setDormantM] = useState<number>(0);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'dormant'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    const fetchTree = async () => {
      if (!userData) return;
      
      const rootNode: TreeNode = {
        uid: userData.uid,
        fullName: userData.fullName,
        currentRank: userData.currentRank,
        sponsorId: userData.sponsorId || '',
        referralCode: userData.referralCode || '',
        isOpen: true,
        children: []
      };

      try {
        // Query direct referrals (by uid or referralCode)
        const q = query(collection(db, 'users'), where('sponsorId', 'in', [userData.uid, userData.referralCode]));
        const querySnapshot = await getDocs(q);
        const children: TreeNode[] = [];
        const loadedMembers: any[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedMembers.push({
            id: doc.id,
            ...data,
            timestamp: data.createdAt?.toMillis() || Date.now()
          });
          children.push({
            uid: doc.id,
            fullName: data.fullName,
            currentRank: data.currentRank || 'Member',
            sponsorId: data.sponsorId,
            referralCode: data.referralCode || '',
            isOpen: false,
            children: []
          });
        });
        
        setDirectMembers(loadedMembers);
        rootNode.children = children;
        setTreeData(rootNode);

        // Compute actual downline count and activity states
        try {
          const allUsers = await getDocs(collection(db, 'users'));
          const usersMap: Record<string, string> = {};
          const userStates: Record<string, string> = {};
          
          // Adj list to compute direct referrals for everyone dynamically
          const adjList = new Map<string, string[]>();
          allUsers.forEach(u => adjList.set(u.id, []));

          allUsers.forEach(u => {
            const data = u.data();
            usersMap[u.id] = data.sponsorId;
            userStates[u.id] = data.activityState || 'dormant';
            
            if (data.sponsorId && adjList.has(data.sponsorId)) {
               adjList.get(data.sponsorId)!.push(u.id);
            }
          });
          
          // Dynamically compute direct referrals counting for directMembers
          loadedMembers.forEach(m => {
             m.calculatedDirectReferrals = (adjList.get(m.id) || []).length;
          });
          setDirectMembers([...loadedMembers]);

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
          setActiveM(activeCount);
          setDormantM(dormantCount);
        } catch (e) {
          console.error("Failed true downline computation", e);
        }

      } catch (err: any) {
        console.error("Error fetching network tree:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setTreeData([{
            id: 'error',
            fullName: 'Permission Error',
            rank: 'Error',
            level: 0,
            directs: 0,
            email: 'Check your Firebase rules',
            status: 'inactive',
            referralCode: '',
            isOpen: false,
            children: []
          }]);
        } else {
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTree();
  }, [userData]);

  const toggleNode = async (node: TreeNode) => {
    if (!treeData) return;

    const findAndToggle = async (curr: TreeNode): Promise<TreeNode> => {
      if (curr.uid === node.uid) {
        const nextOpen = !curr.isOpen;
        let nextChildren = curr.children || [];
        
        if (nextOpen && (!curr.children || curr.children.length === 0) && curr.referralCode) {
          try {
            const q = query(collection(db, 'users'), where('sponsorId', 'in', [curr.uid, curr.referralCode]));
            const querySnapshot = await getDocs(q);
            const loadedChildren: TreeNode[] = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              loadedChildren.push({
                uid: doc.id,
                fullName: data.fullName,
                currentRank: data.currentRank || 'Member',
                sponsorId: data.sponsorId,
                referralCode: data.referralCode || '',
                isOpen: false,
                children: []
              });
            });
            nextChildren = loadedChildren;
          } catch (err: any) {
            console.error("Error loading nested child nodes:", err);
            if (!err.message?.toLowerCase().includes('permission')) {
              handleFirestoreError(err, OperationType.LIST, 'users');
            }
          }
        }
        
        return {
          ...curr,
          isOpen: nextOpen,
          children: nextChildren
        };
      }

      if (curr.children) {
        const updatedChildren = await Promise.all(
          curr.children.map(child => findAndToggle(child))
        );
        return { ...curr, children: updatedChildren };
      }

      return curr;
    };

    const newTree = await findAndToggle(treeData);
    setTreeData(newTree);
  };

  const renderTree = (node: TreeNode, level = 0) => {
    const isNodeOpen = expandAll ? true : node.isOpen;

    return (
      <div key={node.uid} className="ml-5 first:ml-0 relative">
        <div 
          className={cn(
            "flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-muted/50 cursor-pointer mb-2 transition-all group",
            level === 0 ? "bg-primary/5 hover:bg-primary/10 border border-primary/10 p-4 mb-4" : ""
          )}
          onClick={() => toggleNode(node)}
        >
          {node.children || (node.referralCode && level < 3) ? (
            isNodeOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" /> : <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          ) : (
            <div className="w-4 h-4" />
          )}
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border",
            level === 0 ? "bg-primary text-primary-foreground border-primary/20" : "bg-card text-foreground border-border"
          )}>
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-foreground">{node.fullName}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn(
                "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                level === 0 ? "bg-primary/20 text-primary border-transparent" : "bg-muted text-muted-foreground border-border"
              )}>
                {node.currentRank || 'Member'}
              </span>
            </div>
          </div>
        </div>
        
        {isNodeOpen && node.children && node.children.length > 0 && (
          <div className="border-l-2 border-border/50 ml-7 pl-4 relative before:absolute before:inset-0 before:-left-0.5 before:w-0.5 before:bg-gradient-to-b before:from-border/50 before:to-transparent">
            {node.children.map(child => renderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const copyReferralLink = () => {
    if (userData?.referralCode) {
      navigator.clipboard.writeText(`${window.location.origin}/register?ref=${userData.referralCode}`);
      alert("Referral link copied!");
    }
  };

  // Compute stats from direct members for charts
  const { rankDistribution, topRecruiters, growthData } = useMemo(() => {
    const rDist: Record<string, number> = {};
    const tRec = [...directMembers].sort((a, b) => (b.calculatedDirectReferrals || 0) - (a.calculatedDirectReferrals || 0)).slice(0, 5);
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const gData = new Array(6).fill(0).map((_, i) => ({
      name: months[(currentMonth - 5 + i + 12) % 12],
      members: 0,
      referrals: 0
    }));

    directMembers.forEach(m => {
      const rank = m.currentRank || 'Member';
      rDist[rank] = (rDist[rank] || 0) + 1;
      
      const date = new Date(m.timestamp);
      const monthDiff = currentMonth - date.getMonth() + (12 * (new Date().getFullYear() - date.getFullYear()));
      if (monthDiff >= 0 && monthDiff < 6) {
        gData[5 - monthDiff].referrals++;
        // Approximating downline additions
        gData[5 - monthDiff].members += 1 + (m.totalDownlineCount || 0);
      }
    });

    const rankArray = Object.entries(rDist).map(([name, value]) => ({ name, value }));

    return { rankDistribution: rankArray, topRecruiters: tRec, growthData: gData };
  }, [directMembers]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const directCount = treeData?.children?.length || 0;
  
  if (!treeData || directCount === 0) {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Network Management</h1>
            <p className="text-sm text-muted-foreground mt-1">View your referral network, team growth, and genealogy tree.</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-12 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">No Network Yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">Start growing your network by inviting members. Share your referral link to expand your downline.</p>
          <button onClick={copyReferralLink} className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 hover:shadow-md transition-all">
            <UserPlus className="w-5 h-5" /> Invite First Member
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Network Management</h1>
          <p className="text-sm text-muted-foreground mt-1">View your referral network, team growth, and genealogy tree.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={copyReferralLink} className="btn-secondary">
            <Copy className="w-4 h-4" /> Copy Link
          </button>
          <button onClick={copyReferralLink} className="flex-1 sm:flex-none btn-primary">
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        </div>
      </div>

      {/* NETWORK SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Your Team Leader</h3>
          <div className="text-xl font-semibold tracking-tight text-foreground truncate">{userData.roleType !== 'team_leader' && userData.teamId && userData.teamId !== userData.uid ? 'Managed internally' : 'You (Team Leader)'}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Direct Members</h3>
          <div className="text-3xl font-bold text-foreground">{directCount}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Network className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Indirect Members</h3>
          <div className="text-3xl font-bold text-foreground">{Math.max(0, (actualDownlineCount > 0 ? actualDownlineCount : (userData.totalDownlineCount || 0)) - directCount)}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Active Directs</h3>
          <div className="text-3xl font-bold text-foreground">{directMembers.filter(m => m.activityState === 'active').length}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col hover:-translate-y-1 transition-transform">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FolderTree className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Network Depth</h3>
          <div className="text-3xl font-bold text-foreground">{'~'} <span className="text-lg font-medium text-muted-foreground">levels</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REFERRAL TREE VISUALIZATION */}
        <div className="lg:col-span-3 bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm flex flex-col overflow-hidden relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Genealogy Tree</h2>
              <p className="text-xs text-muted-foreground">Interactive view of your network structure.</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setExpandAll(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-foreground"
              >
                Expand All
              </button>
              <button 
                onClick={() => setExpandAll(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-foreground"
              >
                Reset
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto pb-4 flex-1">
            <div className="min-w-max">
              {renderTree(treeData)}
            </div>
          </div>
        </div>

        {/* TEAM RANK DISTRIBUTION */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col h-full">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Team Rank Distribution</h2>
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
                <div className="text-center text-muted-foreground text-sm">No ranks distributed.</div>
            )}
          </div>
        </div>

        {/* ACTIVITY OVERVIEW CHART */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col h-full">
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Activity Status</h2>
          <div className="w-full h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                  <Pie
                  data={[
                    { name: 'Active', value: activeM },
                    { name: 'Dormant', value: dormantM }
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
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.75rem', fontSize: '0.875rem' }}
                    itemStyle={{ color: 'var(--color-foreground)', fontWeight: 600 }}
                  />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 font-medium text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-success" />
                  Active Members
                </div>
                <div className="font-bold text-foreground">{activeM}</div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 font-medium text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  Dormant Members
                </div>
                <div className="font-bold text-foreground">{dormantM}</div>
              </div>
          </div>
        </div>

        {/* TOP PERFORMERS SECTION */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Top Recruiters</h2>
            <Award className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col gap-6">
            {topRecruiters.length > 0 ? topRecruiters.map((recruiter, idx) => (
              <div key={recruiter.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {(recruiter.fullName || 'U').charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{recruiter.fullName}</div>
                    <div className="text-xs text-muted-foreground">{recruiter.currentRank || 'Member'}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-sm font-bold text-foreground">{recruiter.calculatedDirectReferrals || 0}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Directs</div>
                </div>
              </div>
            )) : (
              <div className="text-center text-muted-foreground text-sm p-4">No recruiters found.</div>
            )}
          </div>
        </div>
      </div>

      {/* TEAM GROWTH CHART */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Network Growth (Last 6 Months)</h2>
        </div>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
              <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="members" name="Est. New Network Size" stroke="#6C3BAA" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              <Line type="monotone" dataKey="referrals" name="New Directs" stroke="#16A34A" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NETWORK MEMBERS TABLE */}
      <div className="bg-card rounded-2xl border border-border flex flex-col shadow-sm">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Team Members</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto relative">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search member..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              />
            </div>
            <button 
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={cn("px-3 py-2 border rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-foreground", activityFilter !== 'all' ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border")}
            >
              <Filter className="w-4 h-4" />
            </button>
            {showFilterDropdown && (
              <div className="absolute top-12 right-0 w-48 bg-card border border-border rounded-xl shadow-lg z-10 py-1 flex flex-col text-sm">
                <button onClick={() => { setActivityFilter('all'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'all' ? "text-primary" : "text-foreground")}>All Members</button>
                <button onClick={() => { setActivityFilter('active'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'active' ? "text-primary" : "text-foreground")}>Active Members</button>
                <button onClick={() => { setActivityFilter('dormant'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'dormant' ? "text-primary" : "text-foreground")}>Dormant Members</button>
              </div>
            )}
          </div>
        </div>
        <div className="table-scroll-container">
          <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">User</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Rank</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Sponsor Code</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Direct Referrals</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Activity State</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Total Downline</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">Join Date</th>
                <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {directMembers
                .filter(m => activityFilter === 'all' || (m.activityState || 'dormant') === activityFilter)
                .filter(m => (m.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.referralCode || '').toLowerCase().includes(searchQuery.toLowerCase()))
                .map(member => (
                <tr key={member.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {(member.fullName || 'U').charAt(0)}
                      </div>
                      <span className="font-semibold text-foreground">{member.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      {member.currentRank || 'Member'}
                    </span>
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-muted-foreground whitespace-nowrap">{member.sponsorReferralCode || member.sponsorId}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-center font-semibold whitespace-nowrap">{member.calculatedDirectReferrals || 0}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {member.activityState === 'active' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20 w-fit whitespace-nowrap">
                        Active
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20 w-fit whitespace-nowrap">
                        Dormant
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-center font-semibold whitespace-nowrap">{member.totalDownlineCount || 0}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {member.accountStatus === 'active' ? (
                      <span className="text-success font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                        Active
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-muted-foreground whitespace-nowrap">
                    {new Date(member.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-right whitespace-nowrap">
                    <button className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {directMembers.length === 0 && (
                <tr>
                   <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">
                      No direct members found.
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

