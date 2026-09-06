'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { getCachedBusiness, getCachedTransactions, setCachedTransactions, resolveActiveBusiness } from './offlineStore';
import { logAuditEvent } from './auditLogger';

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

function getStaffStorageKey(businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `ams:staff_members_list_v1_${bid}`;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [primaryRole, setPrimaryRoleState] = useState<UserRole>('owner');
  const [role, setRoleState] = useState<UserRole>('owner');
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cachedBiz = getCachedBusiness();
      const key = getStaffStorageKey(cachedBiz?.id);
      let raw = localStorage.getItem(key);
      if (!raw) raw = localStorage.getItem('ams:staff_members_list_v1_default_biz');
      if (!raw) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ams:staff_members_list_v1_')) {
            raw = localStorage.getItem(k);
            if (raw) break;
          }
        }
      }
      return raw ? JSON.parse(raw) : [];
    } catch (_e) {
      return [];
    }
  });
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    const savedPrimary = localStorage.getItem(PRIMARY_ROLE_STORAGE_KEY) as UserRole | null;
    if (savedPrimary) {
      setPrimaryRoleState(savedPrimary);
      setRoleState(savedPrimary);
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
    let businessId = 'default_biz';

    try {
      const activeBiz = await resolveActiveBusiness();
      if (activeBiz?.id) {
        businessId = activeBiz.id;
      }

      // Load cached staff first
      const currentStorageKey = getStaffStorageKey(businessId);
      let localStaff: StaffMember[] = [];
      try {
        const rawLocal = localStorage.getItem(currentStorageKey) || localStorage.getItem('ams:staff_members_list_v1_default_biz');
        if (rawLocal) localStaff = JSON.parse(rawLocal);
      } catch (_e) {}

      // Fetch remote members from Supabase
      const { data: remoteMembers, error } = await supabase
        .from('business_members')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (!error && remoteMembers && remoteMembers.length > 0) {
        const mergedMap = new Map();
        localStaff.forEach((m) => mergedMap.set(m.id || m.email, m));
        remoteMembers.forEach((m) => mergedMap.set(m.id || m.email, m));
        const merged = Array.from(mergedMap.values());

        setStaffMembers(merged);
        localStorage.setItem(currentStorageKey, JSON.stringify(merged));
        localStorage.setItem('ams:staff_members_list_v1_default_biz', JSON.stringify(merged));
      } else if (localStaff.length > 0) {
        setStaffMembers(localStaff);
      }
    } catch (_e) {
      // offline fallback
      try {
        const cached = localStorage.getItem(getStaffStorageKey(businessId));
        if (cached) setStaffMembers(JSON.parse(cached));
      } catch (_e) {}
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  // Sync on initial provider mount & listen for live staff roster update events
  useEffect(() => {
    refreshStaff();

    const handleStaffUpdate = () => {
      refreshStaff();
    };

    window.addEventListener('ams:staff-updated', handleStaffUpdate);
    return () => {
      window.removeEventListener('ams:staff-updated', handleStaffUpdate);
    };
  }, [refreshStaff]);

  const addStaffMember = async (
    name: string,
    email: string,
    memberRole: UserRole,
    phone?: string,
    branch?: string,
    salary?: number
  ) => {
    try {
      const activeBiz = await resolveActiveBusiness();
      const businessId = activeBiz?.id;
      if (!businessId || businessId === 'default_biz') return { success: false, error: 'No business found' };

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

      const { data: insertedData, error } = await supabase.from('business_members').insert({
        business_id: businessId,
        name: newMember.name,
        email: newMember.email,
        role: newMember.role,
        phone: newMember.phone || null,
        branch: newMember.branch || 'Main Branch',
        salary: newMember.salary || 0,
      }).select().single();

      if (error) {
        return { success: false, error: error.message };
      }

      if (insertedData?.id) {
        newMember.id = insertedData.id;
      }

      const updated = [newMember, ...staffMembers.filter((m) => m.email !== newMember.email)];
      setStaffMembers(updated);
      localStorage.setItem(getStaffStorageKey(businessId), JSON.stringify(updated));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to add staff member' };
    }
  };

  const removeStaffMember = async (id: string) => {
    try {
      const b = getCachedBusiness();
      await supabase.from('business_members').delete().eq('id', id);
      const updated = staffMembers.filter((m) => m.id !== id);
      setStaffMembers(updated);
      localStorage.setItem(getStaffStorageKey(b?.id), JSON.stringify(updated));
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

      const activeBiz = await resolveActiveBusiness();
      const businessId = activeBiz?.id;
      if (!businessId || businessId === 'default_biz') return { success: false, error: 'No business found' };

      const today = new Date().toISOString().slice(0, 10);
      const roleLabel = member.role === 'employee' ? 'Staff/Cashier' : 'CPA/Accountant';
      const vendorName = `Salary: ${member.name} (${roleLabel})`;

      let activeBid = businessId;

      if (businessId && businessId !== 'default_biz') {
        try {
          await supabase.from('transactions').insert({
            business_id: businessId,
            transaction_date: today,
            vendor: vendorName,
            type: 'operating_expense',
            category: 'Payroll & Salaries',
            amount: salaryAmt,
            payment_method: paymentMethod,
          });
        } catch (_supabaseErr) {}
      }

      // Record local transaction for Live Ledger, P&L OPEX, and Cash/Bank Outflow
      const salaryTx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        business_id: activeBid,
        transaction_date: today,
        vendor: vendorName,
        type: 'operating_expense' as const,
        category: 'Payroll & Salaries',
        amount: salaryAmt,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      };

      const existingTxs = getCachedTransactions(activeBid);
      setCachedTransactions([salaryTx, ...existingTxs], activeBid);

      logAuditEvent({
        businessId: activeBid,
        actionType: 'DISBURSE_PAYOUT',
        entityType: 'transaction',
        entityId: salaryTx.id,
        entityName: member.name,
        description: `Disbursed Monthly Salary: GHS ${salaryAmt.toLocaleString()} to ${member.name} (${roleLabel}) via ${paymentMethod === 'bank' ? 'Bank / MoMo' : 'Cash Drawer'}`,
        newValue: salaryTx,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ams:transactions-updated'));
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
