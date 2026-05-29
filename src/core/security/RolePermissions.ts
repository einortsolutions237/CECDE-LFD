/**
 * Enterprise MLM Platform
 * Role-Based Access Control (RBAC) Constants
 */
import { RolePath } from '../types/user.interface';

export const RolePermissions = {
  super_admin: {
    canManageUsers: true,
    canManageFinances: true,
    canManageSettings: true,
    canPurgeSystem: true,
    canChangeRoles: true,
  },
  admin: {
    canManageUsers: true,
    canManageFinances: false, // Moved to finance_admin
    canManageSettings: true,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  finance_admin: {
    canManageUsers: false,
    canManageFinances: true,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  support_admin: {
    canManageUsers: true,
    canManageFinances: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  moderator: {
    canManageUsers: false,
    canManageFinances: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  member: {
    canManageUsers: false,
    canManageFinances: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  }
};

export const hasPermission = (role: RolePath, permission: keyof typeof RolePermissions.super_admin): boolean => {
  if (!role) return false;
  return RolePermissions[role]?.[permission] || false;
};
