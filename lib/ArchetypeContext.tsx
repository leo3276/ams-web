'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from './supabase';
import { getCachedBusiness, setCachedBusiness } from './offlineStore';
import {
  BusinessArchetypeId,
  ArchetypeConfig,
  ARCHETYPES,
  DEFAULT_ARCHETYPE,
  getArchetypeConfig,
} from './archetypes/config';

export interface SchoolSettings {
  academicYear: string;
  currentTerm: string;
  schoolType?: string;
  headmasterName?: string;
  momoNumber?: string;
  momoAccountName?: string;
}

export interface StudentRosterEntry {
  id: string;
  name: string;
  classGrade: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  admissionNumber?: string;
  gender?: 'Male' | 'Female' | 'Other';
  residentialAddress?: string;
  createdAt: string;
}

interface ArchetypeContextValue {
  archetypeId: BusinessArchetypeId;
  archetype: ArchetypeConfig;
  setArchetypeId: (id: BusinessArchetypeId) => Promise<void>;
  isEducation: boolean;
  isRetail: boolean;
  isServices: boolean;
  isCorporate: boolean;
  isFood: boolean;
  isChurch: boolean;
  isFarming: boolean;
  isLogistics: boolean;
  schoolSettings: SchoolSettings;
  updateSchoolSettings: (settings: Partial<SchoolSettings>) => void;
  students: StudentRosterEntry[];
  addStudent: (student: Omit<StudentRosterEntry, 'id' | 'createdAt'>) => StudentRosterEntry;
  updateStudent: (id: string, updates: Partial<StudentRosterEntry>) => void;
  removeStudent: (id: string) => void;
  getStudentsByClass: (classGrade: string) => StudentRosterEntry[];
  getWhatsAppPaymentReceipt: (params: {
    studentName: string;
    classGrade: string;
    guardianPhone: string;
    amountPaid: number;
    outstandingBalance: number;
    businessName: string;
    currency: string;
  }) => string;
  getWhatsAppArrearsReminder: (params: {
    studentName: string;
    classGrade: string;
    guardianPhone: string;
    outstandingBalance: number;
    dueDate?: string;
    businessName: string;
    currency: string;
  }) => string;
}

const ArchetypeContext = createContext<ArchetypeContextValue | null>(null);

const STORAGE_KEY_ARCHETYPE = 'ams:active_archetype_v1';

function getSchoolSettingsKey(businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `ams:school_settings_${bid}`;
}

function getStudentsKey(businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `ams:students_roster_${bid}`;
}

export function ArchetypeProvider({ children }: { children: React.ReactNode }) {
  const [archetypeId, setArchetypeIdState] = useState<BusinessArchetypeId>(() => {
    if (typeof window === 'undefined') return DEFAULT_ARCHETYPE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ARCHETYPE);
      if (stored && stored in ARCHETYPES) return stored as BusinessArchetypeId;
      const cachedBiz = getCachedBusiness();
      if (cachedBiz && (cachedBiz as any).business_type && (cachedBiz as any).business_type in ARCHETYPES) {
        return (cachedBiz as any).business_type as BusinessArchetypeId;
      }
    } catch (_e) {}
    return DEFAULT_ARCHETYPE;
  });
  const [schoolSettings, setSchoolSettingsState] = useState<SchoolSettings>(() => {
    const defaults = {
      academicYear: '2025/2026',
      currentTerm: 'Term 1',
      schoolType: 'Basic & Preparatory School',
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const settingsKey = getSchoolSettingsKey();
      const stored = localStorage.getItem(settingsKey);
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch (_e) {}
    return defaults;
  });
  const [students, setStudentsState] = useState<StudentRosterEntry[]>([]);

  // Load active archetype and settings from cache on mount
  useEffect(() => {
    // 1. Check local storage
    const storedArchetype = localStorage.getItem(STORAGE_KEY_ARCHETYPE);
    if (storedArchetype && storedArchetype in ARCHETYPES) {
      setArchetypeIdState(storedArchetype as BusinessArchetypeId);
    } else {
      const cachedBiz = getCachedBusiness();
      if (cachedBiz && (cachedBiz as any).business_type && (cachedBiz as any).business_type in ARCHETYPES) {
        setArchetypeIdState((cachedBiz as any).business_type as BusinessArchetypeId);
      }
    }

    // 2. Load school settings
    const settingsKey = getSchoolSettingsKey();
    const storedSettings = localStorage.getItem(settingsKey);
    if (storedSettings) {
      try {
        setSchoolSettingsState(JSON.parse(storedSettings));
      } catch (_e) {}
    }

    // 3. Load students roster
    const studentsKey = getStudentsKey();
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents) {
      try {
        setStudentsState(JSON.parse(storedStudents));
      } catch (_e) {}
    }
  }, []);

  const archetype = useMemo(() => getArchetypeConfig(archetypeId), [archetypeId]);

  const setArchetypeId = useCallback(async (newId: BusinessArchetypeId) => {
    setArchetypeIdState(newId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ARCHETYPE, newId);
    }

    const cachedBiz = getCachedBusiness();
    if (cachedBiz?.id) {
      const updated = { ...cachedBiz, business_type: 'sole_proprietorship' };
      setCachedBusiness(updated as any);
    }
  }, []);

  const updateSchoolSettings = useCallback((updates: Partial<SchoolSettings>) => {
    setSchoolSettingsState((prev) => {
      const next = { ...prev, ...updates };
      const key = getSchoolSettingsKey();
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const addStudent = useCallback((data: Omit<StudentRosterEntry, 'id' | 'createdAt'>): StudentRosterEntry => {
    const newStudent: StudentRosterEntry = {
      ...data,
      id: 'std_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
    };

    setStudentsState((prev) => {
      const next = [newStudent, ...prev];
      const key = getStudentsKey();
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });

    return newStudent;
  }, []);

  const updateStudent = useCallback((id: string, updates: Partial<StudentRosterEntry>) => {
    setStudentsState((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      const key = getStudentsKey();
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const removeStudent = useCallback((id: string) => {
    setStudentsState((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const key = getStudentsKey();
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const getStudentsByClass = useCallback((classGrade: string) => {
    if (!classGrade || classGrade === 'All') return students;
    return students.filter((s) => s.classGrade === classGrade);
  }, [students]);

  const getWhatsAppPaymentReceipt = useCallback((params: {
    studentName: string;
    classGrade: string;
    guardianPhone: string;
    amountPaid: number;
    outstandingBalance: number;
    businessName: string;
    currency: string;
  }) => {
    const cleanPhone = (params.guardianPhone || '').replace(/[^0-9]/g, '');
    const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

    const balanceText = params.outstandingBalance > 0
      ? `Remaining ${schoolSettings.currentTerm} Balance: ${params.currency} ${params.outstandingBalance.toLocaleString()}`
      : 'Term Fees Status: FULLY CLEARED ✓';

    const message = `🎓 *OFFICIAL FEE RECEIPT* - ${params.businessName}

Dear Parent/Guardian,

We have successfully received payment for:
🧑‍🎓 *Student:* ${params.studentName}
📚 *Class:* ${params.classGrade}
📅 *Academic Year:* ${schoolSettings.academicYear} (${schoolSettings.currentTerm})
💰 *Amount Paid:* ${params.currency} ${params.amountPaid.toLocaleString()}
📊 ${balanceText}

Thank you for your partnership and support.
*${params.businessName} Accounts Office*`;

    const encoded = encodeURIComponent(message);
    return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [schoolSettings]);

  const getWhatsAppArrearsReminder = useCallback((params: {
    studentName: string;
    classGrade: string;
    guardianPhone: string;
    outstandingBalance: number;
    dueDate?: string;
    businessName: string;
    currency: string;
  }) => {
    const cleanPhone = (params.guardianPhone || '').replace(/[^0-9]/g, '');
    const recipient = cleanPhone.startsWith('0') ? `233${cleanPhone.slice(1)}` : cleanPhone;

    const dueText = params.dueDate ? `Due Date: ${params.dueDate}` : 'Kindly settle at your earliest convenience.';
    const momoText = schoolSettings.momoNumber
      ? `
📱 *MoMo Pay:* ${schoolSettings.momoNumber} (${schoolSettings.momoAccountName || params.businessName})`
      : '';

    const message = `🎓 *TERM FEE STATEMENT* - ${params.businessName}

Dear Parent/Guardian,

This is a friendly statement regarding:
🧑‍🎓 *Student:* ${params.studentName}
📚 *Class:* ${params.classGrade}
📅 *Term:* ${schoolSettings.currentTerm} (${schoolSettings.academicYear})
⚠️ *Outstanding Fee Balance:* ${params.currency} ${params.outstandingBalance.toLocaleString()}
📅 ${dueText}${momoText}

Payments can be made directly at the school accounts office or via Mobile Money above.

Warm regards,
*${params.businessName} Administration*`;

    const encoded = encodeURIComponent(message);
    return recipient ? `https://wa.me/${recipient}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [schoolSettings]);

  const value = useMemo(() => ({
    archetypeId,
    archetype,
    setArchetypeId,
    isEducation: archetypeId === 'education_schools',
    isRetail: archetypeId === 'retail_wholesale',
    isServices: archetypeId === 'services_artisans',
    isCorporate: archetypeId === 'professional_corporate',
    isFood: archetypeId === 'food_hospitality',
    isChurch: archetypeId === 'churches_nonprofits',
    isFarming: archetypeId === 'agriculture_farming',
    isLogistics: archetypeId === 'logistics_transport',
    schoolSettings,
    updateSchoolSettings,
    students,
    addStudent,
    updateStudent,
    removeStudent,
    getStudentsByClass,
    getWhatsAppPaymentReceipt,
    getWhatsAppArrearsReminder,
  }), [
    archetypeId,
    archetype,
    setArchetypeId,
    schoolSettings,
    updateSchoolSettings,
    students,
    addStudent,
    updateStudent,
    removeStudent,
    getStudentsByClass,
    getWhatsAppPaymentReceipt,
    getWhatsAppArrearsReminder,
  ]);

  return <ArchetypeContext.Provider value={value}>{children}</ArchetypeContext.Provider>;
}

export function useArchetype(): ArchetypeContextValue {
  const context = useContext(ArchetypeContext);
  if (!context) {
    // Fallback for isolated components
    return {
      archetypeId: DEFAULT_ARCHETYPE,
      archetype: ARCHETYPES[DEFAULT_ARCHETYPE],
      setArchetypeId: async () => {},
      isEducation: false,
      isRetail: true,
      isServices: false,
      isCorporate: false,
      isFood: false,
      isChurch: false,
      isFarming: false,
      isLogistics: false,
      schoolSettings: { academicYear: '2025/2026', currentTerm: 'Term 1' },
      updateSchoolSettings: () => {},
      students: [],
      addStudent: () => ({} as any),
      updateStudent: () => {},
      removeStudent: () => {},
      getStudentsByClass: () => [],
      getWhatsAppPaymentReceipt: () => '',
      getWhatsAppArrearsReminder: () => '',
    };
  }
  return context;
}
