/**
 * Enterprise MLM Platform
 * Scalable Genealogy & Binary/Matrix Structures
 */

export interface GenealogyNode {
  userId: string;
  sponsorId: string;
  uplineIds: string[]; // Fast path traversal optimized for Firestore
  depth: number;
  placement?: 'left' | 'right' | 'leg_1' | 'leg_2' | 'leg_3'; // Flexible for Matrix or Binary
  leftChildId?: string;
  rightChildId?: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

export interface NetworkMetrics {
  userId: string;
  totalDirect: number;
  totalIndirect: number;
  activeDirect: number;
  activeIndirect: number;
  leftLegVolume?: number;
  rightLegVolume?: number;
  totalVolume: number;
}
