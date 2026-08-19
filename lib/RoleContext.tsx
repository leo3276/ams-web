'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export type UserRole = 'owner' | 'employee' | 'accountant';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  branch?: string;
  salary?: number; // Monthly salary in GHS
  created_at: string;
}

interface RoleContextValue {
  role: UserRole;
  primaryRole: UserRole;
  setRole: (role: UserRole) => void;
  setLoginRole: (role: UserRole) => void;
  canSwitchRoles: boolean;
  isOwner: boolean;
  isEmployee: boolean;
  isAccountant: boolean;
  staffMembers: StaffMember[];
  loadingStaff: boolean;
  addStaffMember: (name: string, email: string, role: UserRole, phone?: string, branch?: string, salary?: number) => Promise<{ success: boolean; error?: string }>;
  removeStaffMember: (id: string) => Promise<{ success: boolean; error?: string }>;
  recordStaffSalaryPayment: (member: StaffMember, paymentMethod?: 'cash' | 'bank') => Promise<{ success: boolean; error?: string }>;
  refreshStaff: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue>({
  role: 'owner',
  primaryRole: 'owner',
  setRole: () => {},
  setLoginRole: () => {},
  canSwitchRoles: true,
  isOwner: true,
  isEmployee: false,
  isAccountant: false,
  staffMembers: [],
  loadingStaff: false,
  addStaffMember: async () => ({ success: true }),
  removeStaffMember: async () => ({ success: true }),
  recordStaffSalaryPayment: async () => ({ success: true }),
  refreshStaff: async () => {},
});

const ROLE_STORAGE_KEY = 'ams:web_user_role_v1';
const PRIMARY_ROLE_STORAGE_KEY = 'ams:web_primary_role_v1';
const STAFF_STORAGE_KEY = 'ams:web_staff_cache_v1';

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('owner');
  const [primaryRole, setPrimaryRoleState] = useState<UserRole>('owner');
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    const storedPrimary = localStorage.getItem(PRIMARY_ROLE_STORAGE_KEY);
    if (storedPrimary === 'owner' || storedPrimary === 'employee' || storedPrimary === 'accountant') {
      setPrimaryRoleState(storedPrimary);
    }

    const storedRole = localStorage.getItem(ROLE_STORAGE_KEY);
    if (storedRole === 'owner' || storedRole === 'employee' || storedRole === 'accountant') {
      setRoleState(storedRole);
    }

    const cached = localStorage.getItem(STAFF_STORAGE_KEY);
    if (cached) {
      try {
        setStaffMembers(JSON.parse(cached));
      } catch (_e) {}
    }
  }, []);

  const setLoginRole = (newPrimary: UserRole) => {
    setPrimaryRoleState(newPrimary);
    setRoleState(newPrimary);
    localStorage.setItem(PRIMARY_ROLE_STORAGE_KEY, newPrimary);
    localStorage.setItem(ROLE_STORAGE_KEY, newPrimary);
  };

  const setRole = (newRole: UserRole) => {
    if (primaryRole !== 'owner') return;
    setRoleState(newRole);
    localStorage.setItem(ROLE_STORAGE_KEY, newRole);
  };

  const refreshStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      const businessId = businesses?.[0]?.id;
      if (businessId) {
        const { data: members, error } = await supabase
          .from('business_members')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false });

        if (!error && members) {
          setStaffMembers(members);
          localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(members));
        }
      }
    } catch (_e) {
      // offline fallback
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  const addStaffMember = async (
    name: string,
    email: string,
    memberRole: UserRole,
    phone?: string,
    branch?: string,
    salary?: number
  ) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { success: false, error: 'Not authenticated' };

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      const businessId = businesses?.[0]?.id;

      const newMember: StaffMember = {
        id: `staff_${Date.now()}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: memberRole,
        phone: phone?.trim() || undefined,
        branch: branch?.trim() || 'Main Branch',
        salary: salary ? Number(salary) : undefined,
        created_at: new Date().toISOString(),
      };

      if (businessId) {
        await supabase.from('business_members').insert({
          business_id: businessId,
          name: newMember.name,
          email: newMember.email,
          role: newMember.role,
        });
      }

      const updated = [newMember, ...staffMembers.filter((m) => m.email !== newMember.email)];
      setStaffMembers(updated);
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(updated));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to add staff member' };
    }
  };

  const removeStaffMember = async (id: string) => {
    try {
      await supabase.from('business_members').delete().eq('id', id);
      const updated = staffMembers.filter((m) => m.id !== id);
      setStaffMembers(updated);
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(updated));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to remove staff' };
    }
  };

  const recordStaffSalaryPayment = async (member: StaffMember, paymentMethod: 'cash' | 'bank' = 'bank') => {
    try {
      const salaryAmt = Number(member.salary || 0);
      if (!salaryAmt || salaryAmt <= 0) {
        return { success: false, error: 'Please set a valid salary amount for this staff member.' };
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { success: false, error: 'Not authenticated' };

      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      const businessId = businesses?.[0]?.id;
      const today = new Date().toISOString().slice(0, 10);
      const roleLabel = member.role === 'employee' ? 'Staff/Cashier' : 'CPA/Accountant';
      const vendorName = `Salary: ${member.name} (${roleLabel})`;

      if (businessId) {
        const { error } = await supabase.from('transactions').insert({
          business_id: businessId,
          transaction_date: today,
          vendor: vendorName,
          type: 'operating_expense',
          category: 'Payroll & Salaries',
          amount: salaryAmt,
          payment_method: paymentMethod,
        });

        if (error) {
          return { success: false, error: error.message };
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Could not record salary payment' };
    }
  };

  const canSwitchRoles = primaryRole === 'owner';
  const isOwner = role === 'owner';
  const isEmployee = role === 'employee';
  const isAccountant = role === 'accountant';

  return (
    <RoleContext.Provider
      value={{
        role,
        primaryRole,
        setRole,
        setLoginRole,
        canSwitchRoles,
        isOwner,
        isEmployee,
        isAccountant,
        staffMembers,
        loadingStaff,
        addStaffMember,
        removeStaffMember,
        recordStaffSalaryPayment,
        refreshStaff,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(RoleContext);
}
