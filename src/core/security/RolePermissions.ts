/**
 * Enterprise MLM Platform
 * Role-Based Access Control (RBAC) Constants
 */
import { RolePath } from '../types/user.interface';

export const RolePermissions = {
  super_admin: {
    canManageUsers: true,
    canManageSettings: true,
    canPurgeSystem: true,
    canChangeRoles: true,
  },
  admin: {
    canManageUsers: true,
    canManageSettings: true,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  team_leader: {
    canManageUsers: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  moderator: {
    canManageUsers: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  },
  member: {
    canManageUsers: false,
    canManageSettings: false,
    canPurgeSystem: false,
    canChangeRoles: false,
  }
};

export const hasPermission = (role: RolePath, permission: keyof typeof RolePermissions.super_admin): boolean => {
  if (!role) return false;
  return RolePermissions[role]?.[permission] || false;
};
