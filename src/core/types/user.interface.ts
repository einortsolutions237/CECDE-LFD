/**
 * Enterprise MLM Platform
 * Core Domain Interfaces: Users & Roles
 */

export type RolePath = 'super_admin' | 'admin' | 'moderator' | 'team_leader' | 'member';
export type ActivityState = 'active' | 'dormant' | 'suspended';
export type AccountStatus = 'active' | 'suspended' | 'archived';

export interface MLMUser {
  uid: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;

  // Security Roles
  role: RolePath;
  roleType?: string;

  // MLM Genealogy Positioning
  sponsorId?: string;
  referralCode: string;
  sponsorReferralCode?: string;
  teamId?: string;
  currentRank: string;

  // MLM Activity
  activityState: ActivityState;
  accountStatus: AccountStatus;

  // Metrics
  directReferralsCount: number;
  indirectReferralCount: number;
  totalDownlineCount: number;
  activeDownlineCount: number;
  dormantDownlineCount: number;
  suspendedDownlineCount: number;
  
  rankingScore: number;
  leaderboardScore: number;

  createdAt: any;
  updatedAt: any;
}
