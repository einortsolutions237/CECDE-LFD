import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { 
  Search, Filter, ChevronRight, ChevronDown, User, Users, 
  Network, FolderTree, UserCheck, X, Eye
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface NetworkUser {
  id: string;
  fullName: string;
  email: string;
  currentRank: string;
  sponsorId: string;
  referralCode: string;
  directReferralsCount: number;
  totalDownlineCount: number;
  activityState: string;
  accountStatus: string;
  createdAt: any;
  timestamp: number;
}


interface TreeNode extends NetworkUser {
  children?: TreeNode[];
  isOpen?: boolean;
}

export default function AdminNetwork() {
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'dormant'>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedUserForTree, setSelectedUserForTree] = useState<NetworkUser | null>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const loadedUsers: NetworkUser[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedUsers.push({
            id: doc.id,
            fullName: data.fullName || '',
            email: data.email || '',
            currentRank: data.currentRank || 'Member',
            sponsorId: data.sponsorId || '',
            referralCode: data.referralCode || '',
            directReferralsCount: data.directReferralsCount || 0,
            totalDownlineCount: data.totalDownlineCount || 0,
            activityState: data.activityState || 'dormant',
            accountStatus: data.accountStatus || 'active',
            createdAt: data.createdAt,
            timestamp: data.createdAt?.toMillis() || Date.now()
          });
        });

        setUsers(loadedUsers.sort((a, b) => b.timestamp - a.timestamp));
      } catch (err: any) {
        console.error("Error fetching network users:", err);
        handleFirestoreError(err, OperationType.LIST, 'users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.referralCode.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || user.accountStatus === statusFilter;
      const matchesActivity = activityFilter === 'all' || user.activityState === activityFilter;

      return matchesSearch && matchesStatus && matchesActivity;
    });
  }, [users, searchQuery, statusFilter, activityFilter]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      activeStatus: users.filter(u => u.accountStatus === 'active').length,
      activityActive: users.filter(u => u.activityState === 'active').length,
      activityDormant: users.filter(u => u.activityState === 'dormant').length,
    };
  }, [users]);

  // Tree Logic
  useEffect(() => {
    if (!selectedUserForTree) {
      setTreeData(null);
      return;
    }

    const buildTree = (rootUser: NetworkUser): TreeNode => {
      const root: TreeNode = { ...rootUser, isOpen: true, children: [] };
      const usersMap: Record<string, TreeNode[]> = {};
      
      // Group users by sponsorId
      users.forEach(u => {
        if (!usersMap[u.sponsorId]) {
          usersMap[u.sponsorId] = [];
        }
        usersMap[u.sponsorId].push({ ...u, isOpen: false, children: [] });
      });

      const assignChildren = (node: TreeNode) => {
        // We match by id or referralCode
        const children = (usersMap[node.id] || []).concat(usersMap[node.referralCode] || []);
        // removes duplicates if any
        const uniqueChildren = Array.from(new Map(children.map(item => [item.id, item])).values());
        
        node.children = uniqueChildren;
        node.children.forEach(child => assignChildren(child));
      };

      assignChildren(root);
      return root;
    };

    setTreeData(buildTree(selectedUserForTree));
  }, [selectedUserForTree, users]);

  const toggleNode = (uid: string, currentNode: TreeNode): TreeNode => {
    if (currentNode.id === uid) {
      return { ...currentNode, isOpen: !currentNode.isOpen };
    }
    if (currentNode.children) {
      return {
        ...currentNode,
        children: currentNode.children.map(child => toggleNode(uid, child))
      };
    }
    return currentNode;
  };

  const handleToggleNode = (uid: string) => {
    if (treeData) {
      setTreeData(toggleNode(uid, treeData));
    }
  };

  const renderTree = (node: TreeNode, level = 0) => {
    const isNodeOpen = node.isOpen;
    
    return (
      <div key={node.id} className="relative">
        <div 
          className={cn(
            "flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors w-max min-w-[300px]",
          )}
        >
          {node.children && node.children.length > 0 ? (
            <button 
              onClick={() => handleToggleNode(node.id)}
              className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mr-1"
            >
              {isNodeOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <div className="w-5 h-5 mr-1" /> // spacer
          )}
          
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-background z-10 shadow-sm",
            level === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}>
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{node.fullName}</span>
            <span className={cn(
                "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                level === 0 ? "bg-primary/20 text-primary border-transparent" : "bg-muted text-muted-foreground border-border"
              )}>
                {node.currentRank || 'Member'}
            </span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
              node.activityState === 'active' ? "bg-success/10 text-success border-success/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20"
            )}>
              {node.activityState === 'active' ? 'Active' : 'Dormant'}
            </span>
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


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex gap-2.5">
          <div className="w-3 h-3 rounded-full bg-primary animate-bounce"></div>
          <div className="w-3 h-3 rounded-full bg-primary animate-bounce [animation-delay:-.3s]"></div>
          <div className="w-3 h-3 rounded-full bg-primary animate-bounce [animation-delay:-.5s]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Global Network</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and monitor the entire system's genealogy.</p>
        </div>
      </div>

      {/* KPI STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Network className="w-4 h-4" />
            </div>
             <h3 className="text-sm font-medium text-muted-foreground">Total Members</h3>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.total}</div>
        </div>
        
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-success">
              <UserCheck className="w-4 h-4" />
            </div>
             <h3 className="text-sm font-medium text-muted-foreground">Active State</h3>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.activityActive}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Users className="w-4 h-4" />
            </div>
             <h3 className="text-sm font-medium text-muted-foreground">Dormant State</h3>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.activityDormant}</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FolderTree className="w-4 h-4" />
            </div>
             <h3 className="text-sm font-medium text-muted-foreground">Avg. Directs</h3>
          </div>
          <div className="text-3xl font-bold tracking-tight text-foreground">{stats.total > 0 ? (users.reduce((acc, u) => acc + (u.directReferralsCount || 0), 0) / stats.total).toFixed(1) : 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        
        {/* USERS TABLE */}
        <div className="bg-card rounded-2xl border border-border flex flex-col shadow-sm overflow-hidden h-fit">
           <div className="p-5 border-b border-border flex flex-col gap-6">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-semibold tracking-tight text-foreground">System Members</h2>
                 <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn("px-3 py-1.5 border rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-muted transition-colors", showFilters ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-foreground")}
                 >
                    <Filter className="w-4 h-4" />
                    Filters
                 </button>
              </div>

              {showFilters && (
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                   <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input 
                        type="text" 
                        placeholder="Search by name, email, or referral code..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      />
                   </div>
                   <div className="flex gap-3">
                      <select 
                        value={activityFilter}
                        onChange={(e) => setActivityFilter(e.target.value as any)}
                        className="px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      >
                         <option value="all">All States</option>
                         <option value="active">Active State</option>
                         <option value="dormant">Dormant State</option>
                      </select>
                      <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      >
                         <option value="all">All Status</option>
                         <option value="active">Active Account</option>
                         <option value="suspended">Suspended Account</option>
                      </select>
                   </div>
                </div>
              )}
           </div>

           <div className="table-scroll-container">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    <th className="px-5 py-3 whitespace-nowrap">Member</th>
                    <th className="px-5 py-3 whitespace-nowrap">Rank</th>
                    <th className="px-5 py-3 text-center whitespace-nowrap">Directs</th>
                    <th className="px-5 py-3 text-center whitespace-nowrap">Downlines</th>
                    <th className="px-5 py-3 whitespace-nowrap">Activity</th>
                    <th className="px-5 py-3 whitespace-nowrap">Status</th>
                    <th className="px-5 py-3 whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                   {filteredUsers.length > 0 ? filteredUsers.map(user => (
                     <tr 
                        key={user.id} 
                        onClick={() => setSelectedUserForTree(user)}
                        className={cn("cursor-pointer hover:bg-muted/30 transition-colors", selectedUserForTree?.id === user.id ? "bg-primary/5" : "")}
                     >
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                              {(user.fullName || user.email || 'U').charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm text-foreground">{user.fullName || 'Unnamed'}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                            {user.currentRank}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center font-semibold text-sm whitespace-nowrap">
                          {user.directReferralsCount || 0}
                        </td>
                        <td className="px-5 py-3 text-center font-semibold text-sm whitespace-nowrap">
                          {user.totalDownlineCount || 0}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                            user.activityState === 'active' ? "bg-success/10 text-success border-success/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          )}>
                            {user.activityState}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                            user.accountStatus === 'active' ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"
                          )}>
                            {user.accountStatus}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <button 
                            onClick={() => setSelectedUserForTree(user)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="View Genealogy Tree"
                          >
                            <FolderTree className="w-4 h-4" />
                          </button>
                        </td>
                     </tr>
                   )) : (
                     <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm whitespace-nowrap">
                          No members matching your criteria.
                        </td>
                     </tr>
                   )}
                </tbody>
              </table>
           </div>
        </div>

        {/* GENEALOGY TREE PREVIEW */}
        <div className="flex flex-col gap-6">
           {selectedUserForTree ? (
             <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col overflow-hidden sticky top-6 max-h-[80vh]">
               <div className="p-5 border-b border-border flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-primary" />
                    Genealogy View
                  </h2>
                  <button 
                    onClick={() => setSelectedUserForTree(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                     <X className="w-4 h-4" />
                  </button>
               </div>
               <div className="p-5 overflow-auto flex-1 bg-muted/10 customized-scrollbar">
                  {treeData && renderTree(treeData)}
               </div>
             </div>
           ) : (
             <div className="hidden xl:flex bg-card rounded-2xl border border-border border-dashed shadow-sm flex-col items-center justify-center p-8 text-center text-muted-foreground min-h-[400px]">
                <FolderTree className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold text-foreground mb-2">Genealogy Preview</h3>
                <p className="text-sm max-w-[250px]">Click the tree icon on any member to view their complete downline structure.</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
}
