import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, orderBy, limit, or } from 'firebase/firestore';
import toast from 'react-hot-toast';
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

import { useTranslation, Trans } from 'react-i18next';

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
const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Team Leader', 'Diamond', 'Crown Ambassador'];

export default function NetworkTree() {
  const { userData } = useAuth();
  const { t } = useTranslation(['network', 'common']);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandAll, setExpandAll] = useState(false);
  const [directMembers, setDirectMembers] = useState<any[]>([]);
  const [actualDownlineCount, setActualDownlineCount] = useState<number>(0);
  const [activeM, setActiveM] = useState<number>(0);
  const [dormantM, setDormantM] = useState<number>(0);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'dormant'>('all');
  const [memberTypeFilter, setMemberTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
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
        // Query both direct referrals and team members of the team
        const conditions = [where('sponsorId', '==', userData.uid)];
        if (userData.referralCode) {
          conditions.push(where('sponsorId', '==', userData.referralCode));
        }
        if (userData.teamId) {
          conditions.push(where('teamId', '==', userData.teamId));
        }
        
        const q = query(collection(db, 'users'), or(...conditions));
        const querySnapshot = await getDocs(q);
        
        const children: TreeNode[] = [];
        const loadedMembers: any[] = [];
        let directCountLocal = 0;
        let indirectCountLocal = 0;
        
        querySnapshot.forEach((doc) => {
          if (doc.id === userData.uid) return;
          const data = doc.data();
          const memberObj = {
            id: doc.id,
            ...data,
            timestamp: data.createdAt?.toMillis() || Date.now()
          };
          loadedMembers.push(memberObj);
          
          // Check if sponsor matches the team leader
          const isDirect = data.sponsorId === userData.uid || data.sponsorId === userData.referralCode || data.sponsorReferralCode === userData.referralCode;
          if (isDirect) {
            directCountLocal++;
            children.push({
              uid: doc.id,
              fullName: data.fullName,
              currentRank: data.currentRank || 'Member',
              sponsorId: data.sponsorId,
              referralCode: data.referralCode || '',
              isOpen: false,
              children: []
            });
          } else {
            indirectCountLocal++;
          }
        });
        
        setDirectMembers(loadedMembers);
        rootNode.children = children;
        setTreeData(rootNode);

        // Calculate count of active and dormant members
        let activeCount = 0;
        let dormantCount = 0;
        loadedMembers.forEach(m => {
          if (m.activityState === 'active') activeCount++;
          else dormantCount++;
        });

        // "Every team member on the team member list whose sponsor is not the 'Team leader' Sponsor code is put under the 'Indirect Referal' list and should be displayed on the INDIRECT REFERALS card"
        if (userData.roleType === 'team_leader') {
          setActualDownlineCount(indirectCountLocal);
        } else {
          setActualDownlineCount(userData.indirectReferralCount || 0);
        }
        setActiveM(activeCount);
        setDormantM(dormantCount);

      } catch (err: any) {
        console.error("Error fetching network tree:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          setTreeData({
            uid: 'error',
            fullName: 'Permission Error',
            currentRank: 'Error',
            sponsorId: '',
            referralCode: '',
            isOpen: false,
            children: []
          });
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
      toast.success(t('common:copied'));
    }
  };

  // Compute stats from direct members for charts
  const { rankDistribution, topRecruiters, growthData } = useMemo(() => {
    const rDist: Record<string, number> = {};
    const tRec = [...directMembers].sort((a, b) => ((b.directReferralsCount || b.directReferrals || 0) - (a.directReferralsCount || a.directReferrals || 0))).slice(0, 5);
    
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
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{t('network:title')}</h1>
            <p className="text-sm font-medium text-muted-foreground mt-2">{t('network:subtitle')}</p>
          </div>
        </div>
        <div className="card flex flex-col items-center justify-center text-center p-12">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">{t('network:no_network_yet')}</h2>
          <p className="text-muted-foreground font-medium mb-8 max-w-md">{t('network:start_growing')}</p>
          <button onClick={copyReferralLink} className="flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <UserPlus className="w-5 h-5" /> {t('network:invite_first')}
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
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{t('network:title')}</h1>
          <p className="text-sm font-medium text-muted-foreground mt-2">{t('network:subtitle')}</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button onClick={copyReferralLink} className="btn-secondary">
            <Copy className="w-4 h-4" /> {t('network:copy_link')}
          </button>
          <button onClick={copyReferralLink} className="flex-1 sm:flex-none btn-primary shadow-sm hover:shadow-md">
            <UserPlus className="w-4 h-4" /> {t('network:invite_member')}
          </button>
        </div>
      </div>

      {/* NETWORK SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="card card-hover flex flex-col border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-card border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Award className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-2">{t('network:your_team_leader')}</h3>
          <div className="text-2xl font-extrabold tracking-tight text-foreground truncate">{userData.roleType !== 'team_leader' && userData.teamId && userData.teamId !== userData.uid ? t('network:managed_internally') : t('network:you_team_leader')}</div>
        </div>

        <div className="card card-hover flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-primary shadow-sm">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('network:direct_members')}</h3>
          <div className="text-4xl font-extrabold text-foreground">{directCount}</div>
        </div>

        <div className="card card-hover flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-primary shadow-sm">
              <Network className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('network:indirect_referrals')}</h3>
          <div className="text-4xl font-extrabold text-foreground">{actualDownlineCount.toLocaleString()}</div>
        </div>

        <div className="card card-hover flex flex-col border-success/20 bg-success/5">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-card border border-success/20 flex items-center justify-center text-success shadow-sm">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-success mb-2">{t('network:active_directs')}</h3>
          <div className="text-4xl font-extrabold text-foreground">{directMembers.filter(m => m.activityState === 'active').length}</div>
        </div>

        <div className="card card-hover flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
              <FolderTree className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('network:network_depth')}</h3>
          <div className="text-4xl font-extrabold text-foreground">
            {t('network:levels_approx', { count: 3 }).replace(/3\s?/, '')}
            <span className="text-base font-semibold text-muted-foreground tracking-wide">3</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REFERRAL TREE VISUALIZATION */}
        <div className="lg:col-span-3 card flex flex-col overflow-hidden relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('network:genealogy_tree')}</h2>
              <p className="text-sm font-medium text-muted-foreground">{t('network:interactive_view')}</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setExpandAll(true)}
                className="text-sm font-bold px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-foreground shadow-sm"
              >
                {t('network:expand_all')}
              </button>
              <button 
                onClick={() => setExpandAll(false)}
                className="text-sm font-bold px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-foreground shadow-sm"
              >
                {t('network:reset')}
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
        <div className="card flex flex-col h-full overflow-hidden">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-8">{t('network:team_rank_distribution')}</h2>
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
                <div className="text-center text-muted-foreground text-sm">{t('network:no_ranks_distributed')}</div>
            )}
          </div>
        </div>

        {/* ACTIVITY OVERVIEW CHART */}
        <div className="card flex flex-col h-full overflow-hidden">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-8">{t('network:activity_status')}</h2>
          <div className="w-full h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                  <Pie
                  data={[
                    { name: t('network:active'), value: activeM },
                    { name: t('network:dormant'), value: dormantM }
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
                  {t('network:active_members')}
                </div>
                <div className="font-bold text-foreground">{activeM}</div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 font-medium text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  {t('network:dormant_members')}
                </div>
                <div className="font-bold text-foreground">{dormantM}</div>
              </div>
          </div>
        </div>

        {/* TOP PERFORMERS SECTION */}
        <div className="card flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('network:top_recruiters')}</h2>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-primary" />
            </div>
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
                  <div className="text-sm font-bold text-foreground">{recruiter.directReferralsCount || recruiter.directReferrals || 0}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">{t('network:directs', 'Directs')}</div>
                </div>
              </div>
            )) : (
              <div className="text-center text-muted-foreground text-sm p-4">{t('network:no_recruiters')}</div>
            )}
          </div>
        </div>
      </div>

      {/* TEAM GROWTH CHART */}
      <div className="card flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-6">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('network:network_growth')}</h2>
        </div>
        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
              <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '1rem', fontSize: '0.875rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="members" name={t('network:est_new_network_size', 'Est. New Network Size')} stroke="#6C3BAA" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              <Line type="monotone" dataKey="referrals" name={t('network:new_directs', 'New Directs')} stroke="#16A34A" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NETWORK MEMBERS TABLE */}
      <div className="card p-0 overflow-hidden border border-border">
        <div className="p-6 border-b border-border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap">{t('network:team_members')}</h2>
            <div className="flex bg-muted p-1 rounded-xl border border-border text-xs font-semibold">
              <button
                onClick={() => setMemberTypeFilter('all')}
                className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'all' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                {t('network:all_team')}
              </button>
              <button
                onClick={() => setMemberTypeFilter('direct')}
                className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'direct' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                {t('network:direct_referrals')}
              </button>
              <button
                onClick={() => setMemberTypeFilter('indirect')}
                className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'indirect' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                {t('network:indirect_referrals')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto relative">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder={t('network:search_member')}
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
                <button onClick={() => { setActivityFilter('all'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'all' ? "text-primary" : "text-foreground")}>{t('network:all_members')}</button>
                <button onClick={() => { setActivityFilter('active'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'active' ? "text-primary" : "text-foreground")}>{t('network:active_members')}</button>
                <button onClick={() => { setActivityFilter('dormant'); setShowFilterDropdown(false); }} className={cn("px-4 py-2 text-left hover:bg-muted font-medium", activityFilter === 'dormant' ? "text-primary" : "text-foreground")}>{t('network:dormant_members')}</button>
              </div>
            )}
          </div>
        </div>
        <div className="table-scroll-container">
          <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border whitespace-nowrap">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:user')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:rank')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:sponsor_code')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:direct_referrals')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:activity_state')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:indirect_referrals')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:status')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('network:join_date')}</th>
                <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {directMembers
                .filter(m => {
                  const isDirect = m.sponsorId === userData.uid || m.sponsorId === userData.referralCode || m.sponsorReferralCode === userData.referralCode;
                  if (memberTypeFilter === 'direct') return isDirect;
                  if (memberTypeFilter === 'indirect') return !isDirect;
                  return true;
                })
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
                  <td className="px-4 py-3 md:px-6 md:py-4 text-center font-semibold whitespace-nowrap">{member.directReferralsCount || member.directReferrals || 0}</td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {member.activityState === 'active' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20 w-fit whitespace-nowrap">
                        {t('network:active')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20 w-fit whitespace-nowrap">
                        {t('network:dormant')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 text-center font-semibold whitespace-nowrap">
                     {member.indirectReferralCount || 0}
                  </td>
                  <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                    {member.accountStatus === 'active' ? (
                      <span className="text-success font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                        {t('network:active')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                        {t('network:inactive')}
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
              {directMembers
                .filter(m => {
                  const isDirect = m.sponsorId === userData.uid || m.sponsorId === userData.referralCode || m.sponsorReferralCode === userData.referralCode;
                  if (memberTypeFilter === 'direct') return isDirect;
                  if (memberTypeFilter === 'indirect') return !isDirect;
                  return true;
                })
                .filter(m => activityFilter === 'all' || (m.activityState || 'dormant') === activityFilter)
                .filter(m => (m.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.referralCode || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <tr>
                   <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground whitespace-nowrap">
                      {t('network:no_members_found')}
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

