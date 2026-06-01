import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, or } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Users, Award, Shield, User, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

export default function TeamMembers() {
  const { userData } = useAuth();
  const { t } = useTranslation(['team', 'common']);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberTypeFilter, setMemberTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
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
        // Fetch only the direct members or team members
        const conditions = [where('sponsorId', '==', userData.uid)];
        if (userData.teamId) {
           conditions.push(where('teamId', '==', userData.teamId));
        }
        
        const usersQuery = query(collection(db, 'users'), or(...conditions));
        
        const fetchMembersData = async () => {
          try {
            const snapshot = await getDocs(usersQuery);
            let members: any[] = [];
            let activeCount = 0;
            let calculatedTotal = 1; // Team leader (1)
            
            snapshot.forEach(doc => {
               const data = doc.data();
               // Prevent the leader themselves showing up as a member
               if (doc.id !== userData.uid) {
                 members.push({ id: doc.id, ...data });
                 
                 // Direct member (1) + their indirect downline
                 calculatedTotal += 1 + (data.totalDownlineCount || 0);
  
                 if (data.accountStatus === 'active') {
                    activeCount++;
                 }
               }
            });
  
            // Sort by computed referrals desc
            members.sort((a, b) => ((b.directReferralsCount || b.directReferrals || 0) - (a.directReferralsCount || a.directReferrals || 0)));
  
            setTeamMembers(members);
            
            // Total Members = Team Leader (1) + Direct + Indirect (totalDownlineCount)
            const actualDownline = userData.totalDownlineCount || 0;
            
            if (members.length === 0) {
               calculatedTotal = actualDownline + 1;
            }
  
            let indirectCount = 0;
            members.forEach((m: any) => {
               const isDirect = m.sponsorId === userData?.uid || m.sponsorId === userData?.referralCode || m.sponsorReferralCode === userData?.referralCode;
               if (!isDirect) {
                 indirectCount++;
               }
            });
  
            setTeamStats({
              totalMembers: calculatedTotal, 
              activeMembers: activeCount + (userData.accountStatus === 'active' ? 1 : 0),
              totalDownline: indirectCount
            });
          } catch (err) {
            console.error("Error fetching team members:", err);
            setError(t('team:failed_load'));
          } finally {
            setLoading(false);
          }
        };

        fetchMembersData();
      } catch (err: any) {
        console.error("Setup error:", err);
        setError(t('team:failed_setup'));
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
        <h2 className="text-3xl font-bold tracking-tight text-foreground">{t('team:access_denied')}</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          {t('team:access_denied_desc')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">{t('team:team_dashboard')}</h1>
          <p className="text-sm font-medium text-muted-foreground">{t('team:team_dashboard_subtitle')}</p>
        </div>
      </div>

      {error ? (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl text-sm font-semibold">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card card-hover flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('team:total_team_members')}</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-foreground">{teamStats.totalMembers?.toLocaleString()}</h3>
            </div>
            
            <div className="card card-hover flex flex-col border-success/20 bg-success/5">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-card border border-success/20 flex items-center justify-center text-success shadow-sm">
                  <Award className="w-6 h-6" />
                </div>
              </div>
              <p className="text-sm font-bold uppercase tracking-widest text-success mb-2">{t('team:active_members')}</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-foreground">{teamStats.activeMembers?.toLocaleString()}</h3>
            </div>

            <div className="card card-hover flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-primary shadow-sm">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('team:indirect_referrals')}</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-foreground">{teamStats.totalDownline?.toLocaleString()}</h3>
            </div>
          </div>

          <div className="card p-0 overflow-hidden border border-border">
            <div className="p-6 border-b border-border bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="font-bold text-2xl tracking-tight text-foreground flex items-center gap-3">
                <User className="w-5 h-5 text-primary" />
                {t('team:team_members')}
              </h2>
              <div className="flex bg-muted p-1 rounded-xl border border-border text-xs font-semibold">
                <button
                  onClick={() => setMemberTypeFilter('all')}
                  className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'all' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
                >
                  {t('team:all_team')}
                </button>
                <button
                  onClick={() => setMemberTypeFilter('direct')}
                  className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'direct' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
                >
                  {t('team:direct_referrals')}
                </button>
                <button
                  onClick={() => setMemberTypeFilter('indirect')}
                  className={cn("px-3 py-1.5 rounded-lg transition-all", memberTypeFilter === 'indirect' ? "bg-card text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground")}
                >
                  {t('team:indirect_referrals')}
                </button>
              </div>
            </div>
            
            <div className="table-scroll-container">
              {teamMembers.filter(m => {
                 const isDirect = m.sponsorId === userData?.uid || m.sponsorId === userData?.referralCode || m.sponsorReferralCode === userData?.referralCode;
                 if (memberTypeFilter === 'direct') return isDirect;
                 if (memberTypeFilter === 'indirect') return !isDirect;
                 return true;
               }).length > 0 ? (
                <table className="w-full text-sm text-left min-w-[700px] md:min-w-full">
                  <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border tracking-wider whitespace-nowrap">
                    <tr>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('team:name_email')}</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('team:rank')}</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('team:referrals')}</th>
                      <th className="px-4 py-3 md:px-6 md:py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30 whitespace-nowrap">{t('team:status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teamMembers.filter(m => {
                      const isDirect = m.sponsorId === userData?.uid || m.sponsorId === userData?.referralCode || m.sponsorReferralCode === userData?.referralCode;
                      if (memberTypeFilter === 'direct') return isDirect;
                      if (memberTypeFilter === 'indirect') return !isDirect;
                      return true;
                    }).map(member => (
                      <tr key={member.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap">
                          <div className="font-bold text-foreground">{member.fullName || t('team:unknown')}</div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                          <div className="text-xs text-muted-foreground mt-1">{t('team:ref_code')}: <span className="font-mono text-primary">{member.referralCode}</span></div>
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-primary whitespace-nowrap">
                          {member.currentRank || t('team:unranked')}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 text-center font-bold whitespace-nowrap">
                          {member.directReferralsCount || member.directReferrals || 0}
                        </td>
                        <td className="px-4 py-3 md:px-6 md:py-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${member.accountStatus === 'active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {member.accountStatus || t('team:pending')}
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
                  <h3 className="text-xl font-semibold tracking-tight text-foreground mb-1">{t('team:no_members')}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t('team:no_members_desc')}
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
