/**
 * Enterprise MLM Platform
 * Immutable Financial Ledgers & Wallets
 */

export type TransactionType = 'deposit' | 'withdrawal' | 'commission' | 'transfer' | 'bonus' | 'fee';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'rejected' | 'reversed';

export interface Wallet {
  walletId: string;
  userId: string;
  type: 'earning_wallet' | 'bonus_wallet' | 'shopping_wallet';
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  currency: string;
  lastUpdated: any;
}

export interface ImmutableTransaction {
  id: string;
  userId: string;
  walletId: string;
  type: TransactionType;
  category: string;
  amount: number;
  beforeBalance: number;
  afterBalance: number;
  sourceUser?: string; // e.g. who triggered the commission
  beneficiary?: string;
  status: TransactionStatus;
  referenceId: string;
  timestamp: any;
  notes?: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  method: string;
  details: Record<string, string>;
  status: TransactionStatus;
  processedBy?: string; // admin UID
  processedAt?: any;
  createdAt: any;
}
