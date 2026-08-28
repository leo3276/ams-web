'use client';

import { getCachedBusiness } from './offlineStore';
import { supabase } from './supabase';

export interface SchoolStudent {
  id: string;
  admissionNumber: string; // e.g. "SCH-2026-0042"
  admissionDate: string; // YYYY-MM-DD
  classGrade: string; // e.g. "Basic 1 (Class 1)"
  
  // 1. Student Bio-Data
  fullName: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender: 'Male' | 'Female' | 'Other';
  placeOfBirth?: string;
  nationality: string; // e.g. "Ghanaian"
  religion?: 'Christian' | 'Muslim' | 'Traditional' | 'Other';
  photoUrl?: string; // Passport photo base64 or URL
  birthCertOrBaptismalNo?: string;
  ghanaCardNumber?: string; // GHA-XXXXXXXXX-X
  nhisNumber?: string;

  // 2. Health & Medical Information
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
  allergies?: string; // e.g. "Peanuts, Penicillin"
  medicalConditions?: string; // e.g. "Asthma, Sickle Cell trait"
  immunizationComplete?: boolean;
  emergencyMedicalConsent?: boolean;

  // 3. Parent / Guardian Particulars
  fatherName?: string;
  fatherOccupation?: string;
  fatherPhone?: string;
  fatherEmployer?: string;

  motherName?: string;
  motherOccupation?: string;
  motherPhone?: string;
  motherEmployer?: string;

  primaryGuardianName: string;
  relationshipToStudent: 'Father' | 'Mother' | 'Guardian' | 'Uncle' | 'Aunt' | 'Grandparent' | 'Other';
  primaryPhone: string; // Primary WhatsApp / billing phone
  secondaryPhone?: string;
  guardianEmail?: string;
  guardianGhanaCardNumber?: string;
  residentialAddress: string; // e.g. "House No. 12, Block B, East Legon"
  digitalAddressGps?: string; // e.g. "GA-183-9024"
  
  emergencyContactPerson?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;

  // 4. Academic History & Prior Schooling
  previousSchoolName?: string;
  previousSchoolLocation?: string;
  lastClassPassed?: string;
  transferCertificateNo?: string;
  entranceExamScore?: string; // e.g. "88%"
  shsCsspsPlacementIndex?: string; // For JHS -> SHS transitions

  // 5. Financial & Administrative
  admissionFeePaid?: number; // e.g. 200
  admissionFeeReceiptNo?: string;
  feePayerMoMoNumber?: string; // e.g. "0244123456"
  feePayerMoMoName?: string; // e.g. "Kwame Mensah"
  feeAgreementAcknowledged?: boolean;

  // Metadata
  status: 'active' | 'graduated' | 'transferred' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface FeeStructureItem {
  id: string;
  name: string;
  category: 'tuition' | 'feeding' | 'transport' | 'uniform' | 'books' | 'pta' | 'exam' | 'other';
  applicableClass: string; // 'All' or specific class e.g. 'Basic 1 (Class 1)'
  amount: number;
  isMandatory: boolean;
  term: string; // 'All Terms' or 'Term 1'
}

export interface TermFeeBillItem {
  name: string;
  amount: number;
  category?: string;
}

export interface TermFeeBill {
  id: string;
  billNumber: string; // e.g. 'FEE-2026-001'
  studentId: string;
  studentName: string;
  classGrade: string;
  guardianName: string;
  guardianPhone: string;
  academicYear: string;
  term: string;
  items: TermFeeBillItem[];
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: 'unpaid' | 'part_paid' | 'cleared';
  dueDate: string;
  createdAt: string;
}

export interface FeePayment {
  id: string;
  paymentReceiptNumber: string; // e.g. 'REC-2026-001'
  billId: string;
  billNumber: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  guardianPhone: string;
  amountPaid: number;
  paymentMethod: 'cash' | 'momo' | 'bank';
  receivedBy: string;
  transactionDate: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
}

export interface SchoolStaff {
  id: string;
  name: string;
  role: 'headmaster' | 'class_teacher' | 'subject_teacher' | 'driver' | 'cook' | 'cleaner' | 'bursar' | 'admin';
  assignedClass?: string;
  phone: string;
  monthlySalary: number;
  lastPaidDate?: string;
  createdAt: string;
}


function broadcastSchoolUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ams:school-data-updated'));
  }
}

// Storage Keys
function getKey(prefix: string, businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_school';
  return `ams:${prefix}_${bid}`;
}

// 1. STUDENTS
export const INITIAL_MOCK_STUDENTS: SchoolStudent[] = [
  {
    id: 'std_001',
    admissionNumber: 'SCH-2026-001',
    admissionDate: '2026-01-10',
    classGrade: 'Basic 1 (Class 1)',
    fullName: 'Kwame Mensah',
    dateOfBirth: '2019-05-14',
    gender: 'Male',
    placeOfBirth: 'Accra',
    nationality: 'Ghanaian',
    religion: 'Christian',
    ghanaCardNumber: 'GHA-723819201-4',
    nhisNumber: 'NHIS-8291039',
    bloodGroup: 'O+',
    allergies: 'None',
    medicalConditions: 'None',
    immunizationComplete: true,
    emergencyMedicalConsent: true,
    fatherName: 'Mr. John Mensah',
    fatherOccupation: 'Civil Engineer',
    fatherPhone: '0244123456',
    motherName: 'Mrs. Cynthia Mensah',
    motherOccupation: 'Pharmacist',
    motherPhone: '0200889900',
    primaryGuardianName: 'Mr. John Mensah',
    relationshipToStudent: 'Father',
    primaryPhone: '0244123456',
    guardianEmail: 'john.mensah@gmail.com',
    guardianGhanaCardNumber: 'GHA-102938475-1',
    residentialAddress: 'House 14, Ring Road Central, Accra',
    digitalAddressGps: 'GA-183-9024',
    previousSchoolName: 'Little Angels Montessori',
    previousSchoolLocation: 'Dzorwulu, Accra',
    lastClassPassed: 'KG 2',
    admissionFeePaid: 250,
    feePayerMoMoNumber: '0244123456',
    feePayerMoMoName: 'John Mensah',
    feeAgreementAcknowledged: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'std_002',
    admissionNumber: 'SCH-2026-002',
    admissionDate: '2026-01-12',
    classGrade: 'Basic 1 (Class 1)',
    fullName: 'Ama Serwaa Boateng',
    dateOfBirth: '2019-08-22',
    gender: 'Female',
    placeOfBirth: 'Kumasi',
    nationality: 'Ghanaian',
    religion: 'Christian',
    ghanaCardNumber: 'GHA-918273645-8',
    nhisNumber: 'NHIS-9928172',
    bloodGroup: 'B+',
    allergies: 'Penicillin',
    medicalConditions: 'Mild Asthma',
    immunizationComplete: true,
    emergencyMedicalConsent: true,
    fatherName: 'Dr. Osei Boateng',
    fatherOccupation: 'Lecturer',
    fatherPhone: '0555334411',
    motherName: 'Dr. (Mrs) Serwaa Boateng',
    motherOccupation: 'Medical Doctor',
    motherPhone: '0200987654',
    primaryGuardianName: 'Dr. (Mrs) Serwaa Boateng',
    relationshipToStudent: 'Mother',
    primaryPhone: '0200987654',
    guardianEmail: 'serwaa.boateng@gmail.com',
    guardianGhanaCardNumber: 'GHA-394857281-9',
    residentialAddress: 'Plot 4, Airport Hills, Accra',
    digitalAddressGps: 'GL-049-3829',
    previousSchoolName: 'St. Martin Preparatory',
    previousSchoolLocation: 'Kumasi',
    lastClassPassed: 'KG 2',
    admissionFeePaid: 250,
    feePayerMoMoNumber: '0200987654',
    feePayerMoMoName: 'Serwaa Boateng',
    feeAgreementAcknowledged: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export function getSchoolStudents(businessId?: string): SchoolStudent[] {
  if (typeof window === 'undefined') return INITIAL_MOCK_STUDENTS;
  try {
    const raw = localStorage.getItem(getKey('school_students', businessId));
    if (raw === null) {
      saveSchoolStudents(INITIAL_MOCK_STUDENTS, businessId);
      return INITIAL_MOCK_STUDENTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((std: any, idx: number) => ({
        ...std,
        id: std.id || `std_${Date.now()}_${idx}`,
        fullName: std.fullName || std.name || `Student #${idx + 1}`,
        primaryGuardianName: std.primaryGuardianName || std.guardianName || 'Parent / Guardian',
        primaryPhone: std.primaryPhone || std.guardianPhone || '',
        classGrade: std.classGrade || 'Basic 1 (Class 1)',
        admissionNumber: std.admissionNumber || `SCH-2026-${String(idx + 1).padStart(3, '0')}`,
        admissionDate: std.admissionDate || '2026-01-10',
        gender: std.gender || 'Male',
        status: std.status || 'active',
      }));
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function saveSchoolStudents(students: SchoolStudent[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('school_students', businessId), JSON.stringify(students));
    broadcastSchoolUpdate();
  } catch (_e) {}
}

// 2. FEE STRUCTURE
export const DEFAULT_SCHOOL_FEES: FeeStructureItem[] = [
  { id: 'fee_1', name: 'Tuition & Academic Fee', category: 'tuition', applicableClass: 'All', amount: 600, isMandatory: true, term: 'All Terms' },
  { id: 'fee_2', name: 'Canteen & Daily Feeding', category: 'feeding', applicableClass: 'All', amount: 350, isMandatory: true, term: 'All Terms' },
  { id: 'fee_3', name: 'School Bus & Transport', category: 'transport', applicableClass: 'All', amount: 250, isMandatory: false, term: 'All Terms' },
  { id: 'fee_4', name: 'PTA Development Levy', category: 'pta', applicableClass: 'All', amount: 50, isMandatory: true, term: 'Term 1' },
  { id: 'fee_5', name: 'ICT Lab & Examination Fee', category: 'exam', applicableClass: 'All', amount: 80, isMandatory: true, term: 'All Terms' },
  { id: 'fee_6', name: 'School Uniform (2 Sets)', category: 'uniform', applicableClass: 'All', amount: 180, isMandatory: false, term: 'Term 1' },
  { id: 'fee_7', name: 'Exercise Books & Stationery Pack', category: 'books', applicableClass: 'All', amount: 150, isMandatory: false, term: 'Term 1' },
];

export function getFeeStructures(businessId?: string): FeeStructureItem[] {
  if (typeof window === 'undefined') return DEFAULT_SCHOOL_FEES;
  try {
    const raw = localStorage.getItem(getKey('school_fee_structures', businessId));
    return raw ? JSON.parse(raw) : DEFAULT_SCHOOL_FEES;
  } catch (_e) {
    return DEFAULT_SCHOOL_FEES;
  }
}

export function saveFeeStructures(fees: FeeStructureItem[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('school_fee_structures', businessId), JSON.stringify(fees));
    broadcastSchoolUpdate();
  } catch (_e) {}
}

// 3. TERM FEE BILLS
export function getTermFeeBills(businessId?: string): TermFeeBill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('school_fee_bills', businessId));
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function saveTermFeeBills(bills: TermFeeBill[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('school_fee_bills', businessId), JSON.stringify(bills));
    broadcastSchoolUpdate();
  } catch (_e) {}
}

// 4. FEE PAYMENTS
export function getFeePayments(businessId?: string): FeePayment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey('school_fee_payments', businessId));
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function saveFeePayments(payments: FeePayment[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('school_fee_payments', businessId), JSON.stringify(payments));
    broadcastSchoolUpdate();
  } catch (_e) {}
}

// 5. TEACHERS & STAFF
export const DEFAULT_SCHOOL_STAFF: SchoolStaff[] = [
  { id: 'stf_1', name: 'Mr. Emmanuel Osei', role: 'headmaster', phone: '0244112233', monthlySalary: 3500, createdAt: new Date().toISOString() },
  { id: 'stf_2', name: 'Mrs. Grace Mensah', role: 'class_teacher', assignedClass: 'Basic 1 (Class 1)', phone: '0200334455', monthlySalary: 2200, createdAt: new Date().toISOString() },
  { id: 'stf_3', name: 'Mr. Samuel Kwarteng', role: 'subject_teacher', assignedClass: 'JHS 1', phone: '0555667788', monthlySalary: 2400, createdAt: new Date().toISOString() },
  { id: 'stf_4', name: 'Uncle Kwame Boateng', role: 'driver', phone: '0244998877', monthlySalary: 1800, createdAt: new Date().toISOString() },
];

export function getSchoolStaff(businessId?: string): SchoolStaff[] {
  if (typeof window === 'undefined') return DEFAULT_SCHOOL_STAFF;
  try {
    const raw = localStorage.getItem(getKey('school_staff', businessId));
    return raw ? JSON.parse(raw) : DEFAULT_SCHOOL_STAFF;
  } catch (_e) {
    return DEFAULT_SCHOOL_STAFF;
  }
}

export function saveSchoolStaff(staff: SchoolStaff[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getKey('school_staff', businessId), JSON.stringify(staff));
    broadcastSchoolUpdate();
  } catch (_e) {}
}

// 6. RECORD FEE PAYMENT ACTION
export function recordStudentFeePayment(params: {
  billId: string;
  amountPaid: number;
  paymentMethod: 'cash' | 'momo' | 'bank';
  receivedBy: string;
  notes?: string;
  businessId?: string;
}): { success: boolean; payment?: FeePayment; updatedBill?: TermFeeBill; error?: string } {
  const bills = getTermFeeBills(params.businessId);
  const billIndex = bills.findIndex((b) => b.id === params.billId);
  if (billIndex === -1) return { success: false, error: 'Fee bill not found.' };

  const bill = bills[billIndex];
  if (params.amountPaid <= 0) return { success: false, error: 'Payment amount must be greater than 0.' };

  const newAmountPaid = bill.amountPaid + params.amountPaid;
  const newBalance = Math.max(0, bill.totalAmount - newAmountPaid);
  const newStatus = newBalance === 0 ? 'cleared' : 'part_paid';

  const updatedBill: TermFeeBill = {
    ...bill,
    amountPaid: newAmountPaid,
    balanceDue: newBalance,
    status: newStatus,
  };

  bills[billIndex] = updatedBill;
  saveTermFeeBills(bills, params.businessId);

  const payments = getFeePayments(params.businessId);
  const paymentRecord: FeePayment = {
    id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    paymentReceiptNumber: 'REC-' + (payments.length + 1).toString().padStart(4, '0'),
    billId: bill.id,
    billNumber: bill.billNumber,
    studentId: bill.studentId,
    studentName: bill.studentName,
    classGrade: bill.classGrade,
    guardianPhone: bill.guardianPhone,
    amountPaid: params.amountPaid,
    paymentMethod: params.paymentMethod,
    receivedBy: params.receivedBy,
    transactionDate: new Date().toISOString().slice(0, 10),
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };

  payments.unshift(paymentRecord);
  saveFeePayments(payments, params.businessId);

  return { success: true, payment: paymentRecord, updatedBill };
}

export function deleteSchoolStudent(studentId: string, businessId?: string): SchoolStudent[] {
  const current = getSchoolStudents(businessId);
  const updated = current.filter((s) => s.id !== studentId);
  saveSchoolStudents(updated, businessId);
  return updated;
}
