'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useArchetype } from '@/lib/ArchetypeContext';
import {
  getSchoolStudents,
  saveSchoolStudents,
  deleteSchoolStudent,
  getTermFeeBills,
  SchoolStudent,
  TermFeeBill,
} from '@/lib/schoolStore';
import { GHANAIAN_GRADE_LEVELS } from '@/lib/archetypes/config';
import {
  parseStudentFile,
  parsePastedAdmissionText,
  downloadSampleAdmissionCSV,
} from '@/lib/studentImporter';
import { getCachedBusiness } from '@/lib/offlineStore';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function calculateAge(dob?: string): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    years--;
  }
  return `${years} yrs`;
}

export default function SchoolStudentsPage() {
  const { schoolSettings, getWhatsAppArrearsReminder } = useArchetype();
  const [businessName, setBusinessName] = useState('Star Academy & Preparatory');
  const [currency, setCurrency] = useState('GHS');

  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [bills, setBills] = useState<TermFeeBill[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'owing' | 'cleared'>('all');

  // Modals
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<number>(1);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [selectedDossierStudent, setSelectedDossierStudent] = useState<SchoolStudent | null>(null);

  // Bulk / Document Import State
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkParsedStudents, setBulkParsedStudents] = useState<Partial<SchoolStudent>[]>([]);
  const [bulkImportClass, setBulkImportClass] = useState<string>('All');
  const [pastedDocText, setPastedDocText] = useState('');
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // ==========================================
  // COMPREHENSIVE ADMISSION FORM STATE
  // ==========================================
  // 1. Pupil Bio-Data
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [placeOfBirth, setPlaceOfBirth] = useState('');
  const [nationality, setNationality] = useState('Ghanaian');
  const [religion, setReligion] = useState<'Christian' | 'Muslim' | 'Traditional' | 'Other'>('Christian');
  const [classGrade, setClassGrade] = useState('Basic 1 (Class 1)');
  const [birthCertNo, setBirthCertNo] = useState('');
  const [ghanaCardNo, setGhanaCardNo] = useState('');
  const [nhisNo, setNhisNo] = useState('');

  // 2. Health & Medical
  const [bloodGroup, setBloodGroup] = useState<SchoolStudent['bloodGroup']>('Unknown');
  const [allergies, setAllergies] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [immunizationComplete, setImmunizationComplete] = useState(true);
  const [emergencyMedicalConsent, setEmergencyMedicalConsent] = useState(true);

  // 3. Parent / Guardian Particulars
  const [fatherName, setFatherName] = useState('');
  const [fatherOccupation, setFatherOccupation] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [fatherEmployer, setFatherEmployer] = useState('');

  const [motherName, setMotherName] = useState('');
  const [motherOccupation, setMotherOccupation] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [motherEmployer, setMotherEmployer] = useState('');

  const [primaryGuardianName, setPrimaryGuardianName] = useState('');
  const [relationshipToStudent, setRelationshipToStudent] = useState<SchoolStudent['relationshipToStudent']>('Father');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianGhanaCardNo, setGuardianGhanaCardNo] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [digitalAddressGps, setDigitalAddressGps] = useState('');

  const [emergencyContactPerson, setEmergencyContactPerson] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // 4. Academic History
  const [previousSchoolName, setPreviousSchoolName] = useState('');
  const [previousSchoolLocation, setPreviousSchoolLocation] = useState('');
  const [lastClassPassed, setLastClassPassed] = useState('');
  const [transferCertNo, setTransferCertNo] = useState('');
  const [entranceExamScore, setEntranceExamScore] = useState('');
  const [shsCsspsIndex, setShsCsspsIndex] = useState('');

  // 5. Financial & Admin
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [admissionFeePaid, setAdmissionFeePaid] = useState('250');
  const [feePayerMoMoNumber, setFeePayerMoMoNumber] = useState('');
  const [feePayerMoMoName, setFeePayerMoMoName] = useState('');
  const [feeAgreementAcknowledged, setFeeAgreementAcknowledged] = useState(true);

  useEffect(() => {
    const biz = getCachedBusiness();
    if (biz) {
      setBusinessName(biz.name);
      setCurrency(biz.currency || 'GHS');
    }
    const stds = getSchoolStudents();
    const bls = getTermFeeBills();
    setStudents(stds);
    setBills(bls);
    setLoading(false);
  }, []);

  // Compute pupil financial balances & stats
  const studentRows = useMemo(() => {
    return students.map((std) => {
      const stdName = (std.fullName || (std as any).name || '').trim().toLowerCase();
      const stdBills = bills.filter(
        (b) => b.studentId === std.id || (b.studentName || '').trim().toLowerCase() === stdName
      );
      const totalBilled = stdBills.reduce((acc, b) => acc + b.totalAmount, 0);
      const totalPaid = stdBills.reduce((acc, b) => acc + b.amountPaid, 0);
      const balanceDue = Math.max(0, totalBilled - totalPaid);
      const isCleared = totalBilled > 0 && balanceDue === 0;
      const isOwing = balanceDue > 0;

      return {
        ...std,
        totalBilled,
        totalPaid,
        balanceDue,
        isCleared,
        isOwing,
        billsCount: stdBills.length,
      };
    });
  }, [students, bills]);

  const filteredStudents = useMemo(() => {
    return studentRows.filter((s) => {
      const q = (searchTerm || '').toLowerCase();
      const nameStr = (s.fullName || (s as any).name || '').toLowerCase();
      const guardianStr = (s.primaryGuardianName || (s as any).guardianName || '').toLowerCase();
      const phoneStr = s.primaryPhone || (s as any).guardianPhone || '';
      const admStr = (s.admissionNumber || '').toLowerCase();
      const ghaStr = (s.ghanaCardNumber || '').toLowerCase();
      const gpsStr = (s.digitalAddressGps || '').toLowerCase();

      const matchesSearch =
        nameStr.includes(q) ||
        guardianStr.includes(q) ||
        phoneStr.includes(searchTerm) ||
        admStr.includes(q) ||
        ghaStr.includes(q) ||
        gpsStr.includes(q);

      if (!matchesSearch) return false;

      if (selectedClass !== 'All' && s.classGrade !== selectedClass) return false;
      if (statusFilter === 'owing' && !s.isOwing) return false;
      if (statusFilter === 'cleared' && !s.isCleared) return false;

      return true;
    });
  }, [studentRows, searchTerm, selectedClass, statusFilter]);

  // Aggregate Metrics
  const totalBoys = useMemo(() => students.filter((s) => s.gender === 'Male').length, [students]);
  const totalGirls = useMemo(() => students.filter((s) => s.gender === 'Female').length, [students]);
  const totalOwingCount = useMemo(() => studentRows.filter((s) => s.isOwing).length, [studentRows]);
  const totalOutstandingArrears = useMemo(
    () => studentRows.reduce((acc, s) => acc + s.balanceDue, 0),
    [studentRows]
  );

  // Generate Next Admission #
  const nextAdmissionNo = useMemo(() => {
    const year = new Date().getFullYear();
    const count = students.length + 1;
    return `SCH-${year}-${count.toString().padStart(3, '0')}`;
  }, [students.length]);


  // Auto-populate all 5 admission form tabs from a parsed student record
  const populateFormFromStudent = (std: Partial<SchoolStudent>) => {
    if (std.fullName) setFullName(std.fullName);
    if (std.dateOfBirth) setDateOfBirth(std.dateOfBirth);
    if (std.gender) setGender(std.gender as any);
    if (std.placeOfBirth) setPlaceOfBirth(std.placeOfBirth);
    if (std.nationality) setNationality(std.nationality);
    if (std.religion) setReligion(std.religion as any);
    if (std.classGrade) setClassGrade(std.classGrade);
    if (std.birthCertOrBaptismalNo) setBirthCertNo(std.birthCertOrBaptismalNo);
    if (std.ghanaCardNumber) setGhanaCardNo(std.ghanaCardNumber);
    if (std.nhisNumber) setNhisNo(std.nhisNumber);

    if (std.bloodGroup) setBloodGroup(std.bloodGroup);
    if (std.allergies) setAllergies(std.allergies);
    if (std.medicalConditions) setMedicalConditions(std.medicalConditions);
    if (std.immunizationComplete !== undefined) setImmunizationComplete(std.immunizationComplete);

    if (std.fatherName) setFatherName(std.fatherName);
    if (std.fatherOccupation) setFatherOccupation(std.fatherOccupation);
    if (std.fatherPhone) setFatherPhone(std.fatherPhone);
    if (std.fatherEmployer) setFatherEmployer(std.fatherEmployer);

    if (std.motherName) setMotherName(std.motherName);
    if (std.motherOccupation) setMotherOccupation(std.motherOccupation);
    if (std.motherPhone) setMotherPhone(std.motherPhone);
    if (std.motherEmployer) setMotherEmployer(std.motherEmployer);

    if (std.primaryGuardianName) setPrimaryGuardianName(std.primaryGuardianName);
    if (std.relationshipToStudent) setRelationshipToStudent(std.relationshipToStudent);
    if (std.primaryPhone) setPrimaryPhone(std.primaryPhone);
    if (std.guardianEmail) setGuardianEmail(std.guardianEmail);
    if (std.guardianGhanaCardNumber) setGuardianGhanaCardNo(std.guardianGhanaCardNumber);
    if (std.residentialAddress) setResidentialAddress(std.residentialAddress);
    if (std.digitalAddressGps) setDigitalAddressGps(std.digitalAddressGps);

    if (std.emergencyContactPerson) setEmergencyContactPerson(std.emergencyContactPerson);
    if (std.emergencyContactPhone) setEmergencyContactPhone(std.emergencyContactPhone);

    if (std.previousSchoolName) setPreviousSchoolName(std.previousSchoolName);
    if (std.previousSchoolLocation) setPreviousSchoolLocation(std.previousSchoolLocation);
    if (std.lastClassPassed) setLastClassPassed(std.lastClassPassed);
    if (std.transferCertificateNo) setTransferCertNo(std.transferCertificateNo);
    if (std.entranceExamScore) setEntranceExamScore(std.entranceExamScore);
    if (std.shsCsspsPlacementIndex) setShsCsspsIndex(std.shsCsspsPlacementIndex);

    if (std.admissionFeePaid) setAdmissionFeePaid(String(std.admissionFeePaid));
    if (std.feePayerMoMoNumber) setFeePayerMoMoNumber(std.feePayerMoMoNumber);
    if (std.feePayerMoMoName) setFeePayerMoMoName(std.feePayerMoMoName);
  };

  // Handle single student file upload inside the admission wizard
  const handleWizardFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await parseStudentFile(file);
    if (res.students.length > 0) {
      populateFormFromStudent(res.students[0]);
      setImportNotice(`✓ Auto-filled ${res.students[0].fullName || 'student'} particulars from document (${file.name})`);
      setTimeout(() => setImportNotice(null), 5000);
    } else {
      alert(res.errors.join('\n') || 'Could not parse student document.');
    }
  };

  // Handle bulk file upload
  const handleBulkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await parseStudentFile(file);
    if (res.students.length > 0) {
      setBulkParsedStudents(res.students);
    } else {
      alert(res.errors.join('\n') || 'Could not parse student file.');
    }
  };

  // Handle paste parse
  const handleParsePastedText = () => {
    if (!pastedDocText.trim()) return;
    const res = parsePastedAdmissionText(pastedDocText);
    if (res.students.length > 0) {
      setBulkParsedStudents(res.students);
    } else {
      alert('Could not detect student particulars in pasted text.');
    }
  };

  // Commit bulk imported students
  const handleCommitBulkImport = () => {
    if (bulkParsedStudents.length === 0) return;
    const current = getSchoolStudents();
    const toImport = bulkParsedStudents.map((s, idx) => ({
      id: s.id || `std_${Date.now()}_${idx}`,
      fullName: s.fullName || `Student #${current.length + idx + 1}`,
      admissionNumber: s.admissionNumber || `SCH-2026-${String(current.length + idx + 1).padStart(3, '0')}`,
      admissionDate: s.admissionDate || new Date().toISOString().slice(0, 10),
      classGrade: s.classGrade || 'Basic 1 (Class 1)',
      gender: s.gender || 'Male',
      dateOfBirth: s.dateOfBirth || '',
      placeOfBirth: s.placeOfBirth || '',
      nationality: s.nationality || 'Ghanaian',
      religion: s.religion || 'Christian',
      birthCertOrBaptismalNo: s.birthCertOrBaptismalNo || '',
      ghanaCardNumber: s.ghanaCardNumber || '',
      nhisNumber: s.nhisNumber || '',
      bloodGroup: s.bloodGroup || 'Unknown',
      allergies: s.allergies || '',
      medicalConditions: s.medicalConditions || '',
      immunizationComplete: s.immunizationComplete ?? true,
      emergencyMedicalConsent: true,
      fatherName: s.fatherName || '',
      fatherOccupation: s.fatherOccupation || '',
      fatherPhone: s.fatherPhone || '',
      fatherEmployer: s.fatherEmployer || '',
      motherName: s.motherName || '',
      motherOccupation: s.motherOccupation || '',
      motherPhone: s.motherPhone || '',
      motherEmployer: s.motherEmployer || '',
      primaryGuardianName: s.primaryGuardianName || 'Parent / Guardian',
      relationshipToStudent: s.relationshipToStudent || 'Father',
      primaryPhone: s.primaryPhone || '',
      secondaryPhone: s.secondaryPhone || '',
      guardianEmail: s.guardianEmail || '',
      guardianGhanaCardNumber: s.guardianGhanaCardNumber || '',
      residentialAddress: s.residentialAddress || '',
      digitalAddressGps: s.digitalAddressGps || '',
      emergencyContactPerson: s.emergencyContactPerson || '',
      emergencyContactPhone: s.emergencyContactPhone || '',
      previousSchoolName: s.previousSchoolName || '',
      previousSchoolLocation: s.previousSchoolLocation || '',
      lastClassPassed: s.lastClassPassed || '',
      transferCertificateNumber: s.transferCertificateNo || '',
      entranceExamScore: s.entranceExamScore || '',
      shsCsspsIndex: s.shsCsspsPlacementIndex || '',
      admissionFeePaid: s.admissionFeePaid || 250,
      feePayerMoMoNumber: s.feePayerMoMoNumber || s.primaryPhone || '',
      feePayerMoMoName: s.feePayerMoMoName || s.primaryGuardianName || '',
      feeAgreementAcknowledged: true,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const updated = [...current, ...toImport];
    setStudents(updated);
    saveSchoolStudents(updated);
    setShowBulkImportModal(false);
    setBulkParsedStudents([]);
    setPastedDocText('');
    alert(`✓ Successfully imported ${toImport.length} students into the school directory!`);
  };

  // Open New Admission Form
  const handleOpenAdd = () => {
    setEditingStudentId(null);
    setActiveFormTab(1);
    const today = new Date().toISOString().slice(0, 10);

    setFullName('');
    setDateOfBirth('2019-05-15');
    setGender('Male');
    setPlaceOfBirth('Accra');
    setNationality('Ghanaian');
    setReligion('Christian');
    setClassGrade('Basic 1 (Class 1)');
    setBirthCertNo('');
    setGhanaCardNo('');
    setNhisNo('');

    setBloodGroup('Unknown');
    setAllergies('');
    setMedicalConditions('');
    setImmunizationComplete(true);
    setEmergencyMedicalConsent(true);

    setFatherName('');
    setFatherOccupation('');
    setFatherPhone('');
    setFatherEmployer('');

    setMotherName('');
    setMotherOccupation('');
    setMotherPhone('');
    setMotherEmployer('');

    setPrimaryGuardianName('');
    setRelationshipToStudent('Father');
    setPrimaryPhone('');
    setGuardianEmail('');
    setGuardianGhanaCardNo('');
    setResidentialAddress('');
    setDigitalAddressGps('');

    setEmergencyContactPerson('');
    setEmergencyContactPhone('');

    setPreviousSchoolName('');
    setPreviousSchoolLocation('');
    setLastClassPassed('');
    setTransferCertNo('');
    setEntranceExamScore('');
    setShsCsspsIndex('');

    setAdmissionNumber(nextAdmissionNo);
    setAdmissionDate(today);
    setAdmissionFeePaid('250');
    setFeePayerMoMoNumber('');
    setFeePayerMoMoName('');
    setFeeAgreementAcknowledged(true);

    setShowAdmissionModal(true);
  };

  // Open Edit Form
  const handleOpenEdit = (std: SchoolStudent) => {
    setEditingStudentId(std.id);
    setActiveFormTab(1);

    setFullName(std.fullName || (std as any).name || '');
    setDateOfBirth(std.dateOfBirth || '');
    setGender((std.gender as any) || 'Male');
    setPlaceOfBirth(std.placeOfBirth || '');
    setNationality(std.nationality || 'Ghanaian');
    setReligion(std.religion || 'Christian');
    setClassGrade(std.classGrade);
    setBirthCertNo(std.birthCertOrBaptismalNo || '');
    setGhanaCardNo(std.ghanaCardNumber || '');
    setNhisNo(std.nhisNumber || '');

    setBloodGroup(std.bloodGroup || 'Unknown');
    setAllergies(std.allergies || '');
    setMedicalConditions(std.medicalConditions || '');
    setImmunizationComplete(std.immunizationComplete ?? true);
    setEmergencyMedicalConsent(std.emergencyMedicalConsent ?? true);

    setFatherName(std.fatherName || '');
    setFatherOccupation(std.fatherOccupation || '');
    setFatherPhone(std.fatherPhone || '');
    setFatherEmployer(std.fatherEmployer || '');

    setMotherName(std.motherName || '');
    setMotherOccupation(std.motherOccupation || '');
    setMotherPhone(std.motherPhone || '');
    setMotherEmployer(std.motherEmployer || '');

    setPrimaryGuardianName(std.primaryGuardianName || (std as any).guardianName || '');
    setRelationshipToStudent(std.relationshipToStudent || 'Father');
    setPrimaryPhone(std.primaryPhone || (std as any).guardianPhone || '');
    setGuardianEmail(std.guardianEmail || '');
    setGuardianGhanaCardNo(std.guardianGhanaCardNumber || '');
    setResidentialAddress(std.residentialAddress || '');
    setDigitalAddressGps(std.digitalAddressGps || '');

    setEmergencyContactPerson(std.emergencyContactPerson || '');
    setEmergencyContactPhone(std.emergencyContactPhone || '');

    setPreviousSchoolName(std.previousSchoolName || '');
    setPreviousSchoolLocation(std.previousSchoolLocation || '');
    setLastClassPassed(std.lastClassPassed || '');
    setTransferCertNo(std.transferCertificateNo || '');
    setEntranceExamScore(std.entranceExamScore || '');
    setShsCsspsIndex(std.shsCsspsPlacementIndex || '');

    setAdmissionNumber(std.admissionNumber || '');
    setAdmissionDate(std.admissionDate || '');
    setAdmissionFeePaid(String(std.admissionFeePaid || 0));
    setFeePayerMoMoNumber(std.feePayerMoMoNumber || '');
    setFeePayerMoMoName(std.feePayerMoMoName || '');
    setFeeAgreementAcknowledged(std.feeAgreementAcknowledged ?? true);

    setShowAdmissionModal(true);
  };

  // Submit Admission Wizard
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !primaryGuardianName.trim() || !primaryPhone.trim()) {
      alert('Please fill in Student Full Name, Primary Guardian Name, and WhatsApp Phone.');
      return;
    }

    const stdData: SchoolStudent = {
      id: editingStudentId || 'std_' + Date.now(),
      admissionNumber: admissionNumber.trim() || nextAdmissionNo,
      admissionDate: admissionDate || new Date().toISOString().slice(0, 10),
      classGrade,
      fullName: fullName.trim(),
      dateOfBirth,
      gender,
      placeOfBirth: placeOfBirth.trim() || undefined,
      nationality: nationality.trim() || 'Ghanaian',
      religion,
      birthCertOrBaptismalNo: birthCertNo.trim() || undefined,
      ghanaCardNumber: ghanaCardNo.trim() || undefined,
      nhisNumber: nhisNo.trim() || undefined,

      bloodGroup,
      allergies: allergies.trim() || 'None',
      medicalConditions: medicalConditions.trim() || 'None',
      immunizationComplete,
      emergencyMedicalConsent,

      fatherName: fatherName.trim() || undefined,
      fatherOccupation: fatherOccupation.trim() || undefined,
      fatherPhone: fatherPhone.trim() || undefined,
      fatherEmployer: fatherEmployer.trim() || undefined,

      motherName: motherName.trim() || undefined,
      motherOccupation: motherOccupation.trim() || undefined,
      motherPhone: motherPhone.trim() || undefined,
      motherEmployer: motherEmployer.trim() || undefined,

      primaryGuardianName: primaryGuardianName.trim(),
      relationshipToStudent,
      primaryPhone: primaryPhone.trim(),
      guardianEmail: guardianEmail.trim() || undefined,
      guardianGhanaCardNumber: guardianGhanaCardNo.trim() || undefined,
      residentialAddress: residentialAddress.trim() || 'Accra, Ghana',
      digitalAddressGps: digitalAddressGps.trim() || undefined,

      emergencyContactPerson: emergencyContactPerson.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,

      previousSchoolName: previousSchoolName.trim() || undefined,
      previousSchoolLocation: previousSchoolLocation.trim() || undefined,
      lastClassPassed: lastClassPassed.trim() || undefined,
      transferCertificateNo: transferCertNo.trim() || undefined,
      entranceExamScore: entranceExamScore.trim() || undefined,
      shsCsspsPlacementIndex: shsCsspsIndex.trim() || undefined,

      admissionFeePaid: parseFloat(admissionFeePaid) || 0,
      feePayerMoMoNumber: feePayerMoMoNumber.trim() || primaryPhone.trim(),
      feePayerMoMoName: feePayerMoMoName.trim() || primaryGuardianName.trim(),
      feeAgreementAcknowledged,

      status: 'active',
      createdAt: editingStudentId
        ? students.find((s) => s.id === editingStudentId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let updated: SchoolStudent[];
    if (editingStudentId) {
      updated = students.map((s) => (s.id === editingStudentId ? stdData : s));
    } else {
      updated = [stdData, ...students];
    }

    setStudents(updated);
    saveSchoolStudents(updated);
    setShowAdmissionModal(false);
    alert(`✓ Pupil ${stdData.fullName} enrolled successfully (${stdData.admissionNumber})!`);
  };

  const handleDeleteStudent = (id: string, name: string) => {
    if (!confirm(`Permanently delete ${name} from the school directory?`)) return;
    const updated = deleteSchoolStudent(id);
    setStudents(updated);
    if (selectedDossierStudent?.id === id) setSelectedDossierStudent(null);
    if (editingStudentId === id) setShowAdmissionModal(false);
  };

  // Instant render without blocking loader

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-slate-900">
      
      {/* 1. TOP EXECUTIVE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🧑‍🎓</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Student Directory &amp; Class Rosters
              </h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">
                  {schoolSettings.schoolType || 'Basic & Preparatory School'}
                </span>
                <span>•</span>
                <span className="font-mono">
                  {schoolSettings.academicYear || '2025/2026'} ({schoolSettings.currentTerm || 'Term 1'})
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowBulkImportModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <span>📥 Import Roster / Excel</span>
          </button>
          <Link
            href="/school/billing"
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5"
          >
            <span>⚡ Class Billing</span>
          </Link>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <span>+ Enroll Student</span>
          </button>
        </div>
      </div>

      {/* 2. FOUR PRIMARY KPI STAT TILES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Enrolled</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">{students.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {totalBoys} Boys · {totalGirls} Girls
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Fee Payers (MoMo)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {students.filter((s) => s.feePayerMoMoNumber).length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Mobile Money verified</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Unpaid Term Arrears</p>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {currency} {totalOutstandingArrears.toLocaleString()}
          </p>
          <p className="text-[11px] text-red-600 font-medium mt-0.5">
            {totalOwingCount} pupils owing fees
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Legal Documentation</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {Math.round((students.filter((s) => s.ghanaCardNumber || s.birthCertOrBaptismalNo).length / (students.length || 1)) * 100)}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Ghana Card / Birth Cert</p>
        </div>
      </div>

      {/* 3. FILTER & SEARCH SUITE */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by student name, parent, phone, GPS address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({studentRows.length})
            </button>
            <button
              onClick={() => setStatusFilter('owing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'owing'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              Owing ({totalOwingCount})
            </button>
            <button
              onClick={() => setStatusFilter('cleared')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'cleared'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Cleared ({studentRows.filter((s) => s.isCleared).length})
            </button>
          </div>
        </div>

        {/* Ghanaian Grade Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-thin">
          <button
            onClick={() => setSelectedClass('All')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition ${
              selectedClass === 'All'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Classes ({students.length})
          </button>
          {GHANAIAN_GRADE_LEVELS.slice(0, 14).map((grade) => {
            const count = students.filter((s) => s.classGrade === grade).length;
            return (
              <button
                key={grade}
                onClick={() => setSelectedClass(grade)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                  selectedClass === grade
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {grade} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. STUDENT DIRECTORY TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl mb-2 inline-block">🧑‍🎓</span>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Pupils Found</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              {students.length === 0
                ? 'Enroll your first pupil with the comprehensive admission dossier.'
                : 'No pupils matched your search criteria.'}
            </p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xs"
            >
              + Enroll Student Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Student &amp; Roll #</th>
                  <th className="py-3 px-4">Class &amp; Age</th>
                  <th className="py-3 px-4">Parent / WhatsApp Contact</th>
                  <th className="py-3 px-4">GPS / Address</th>
                  <th className="py-3 px-4">Medical &amp; IDs</th>
                  <th className="py-3 px-4">Term Balance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((std) => {
                  const arrearsLink = getWhatsAppArrearsReminder({
                    studentName: std.fullName || (std as any).name,
                    classGrade: std.classGrade,
                    guardianPhone: std.primaryPhone || (std as any).guardianPhone,
                    outstandingBalance: std.balanceDue,
                    businessName,
                    currency,
                  });

                  return (
                    <tr
                      key={std.id}
                      className="hover:bg-slate-50/70 transition cursor-pointer group"
                      onClick={() => setSelectedDossierStudent(std)}
                    >
                      {/* Pupil & Admission # */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-xs shrink-0 border border-slate-200">
                            {initials(std.fullName || (std as any).name || 'P')}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:underline">
                              {std.fullName || (std as any).name}
                            </p>
                            <span className="text-[10px] font-mono text-slate-500">
                              #{std.admissionNumber} ({std.gender === 'Male' ? 'Boy' : 'Girl'})
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Class & Age */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {std.classGrade}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                          {calculateAge(std.dateOfBirth)}
                        </p>
                      </td>

                      {/* Parent / WhatsApp Contact */}
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <p className="font-medium text-slate-900">
                          {std.primaryGuardianName || (std as any).guardianName}{' '}
                          <span className="text-[10px] text-slate-400">
                            ({std.relationshipToStudent || 'Parent'})
                          </span>
                        </p>
                        {std.primaryPhone || (std as any).guardianPhone ? (
                          <a
                            href={`https://wa.me/${(std.primaryPhone || (std as any).guardianPhone).replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-mono font-medium mt-0.5"
                          >
                            <span>📱</span> {std.primaryPhone || (std as any).guardianPhone}
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400">No phone</span>
                        )}
                      </td>

                      {/* Digital GPS / Address */}
                      <td className="py-3 px-4">
                        {std.digitalAddressGps && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-block mb-0.5">
                            📍 {std.digitalAddressGps}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-600 truncate max-w-xs">
                          {std.residentialAddress || '—'}
                        </p>
                      </td>

                      {/* Medical & IDs */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {std.bloodGroup && std.bloodGroup !== 'Unknown' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              {std.bloodGroup}
                            </span>
                          )}
                          {std.ghanaCardNumber && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              GHA ID
                            </span>
                          )}
                          {std.nhisNumber && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              NHIS
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Term Balance */}
                      <td className="py-3 px-4 font-mono">
                        {std.balanceDue > 0 ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            Owing {currency} {std.balanceDue.toLocaleString()}
                          </span>
                        ) : std.totalBilled > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Cleared
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">No bill</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {std.balanceDue > 0 && (std.primaryPhone || (std as any).guardianPhone) && (
                            <a
                              href={arrearsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-medium transition"
                              title="Send WhatsApp Arrears Slip"
                            >
                              WhatsApp
                            </a>
                          )}

                          <button
                            onClick={() => setSelectedDossierStudent(std)}
                            className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-800"
                            title="View Full Dossier"
                          >
                            Dossier
                          </button>

                          <button
                            onClick={() => handleOpenEdit(std)}
                            className="p-1 rounded text-slate-500 hover:text-slate-900"
                            title="Edit Pupil Profile"
                          >
                            ✏️
                          </button>

                          <button
                            onClick={() => handleDeleteStudent(std.id, std.fullName || (std as any).name)}
                            className="p-1 rounded text-slate-400 hover:text-red-600"
                            title="Delete Pupil"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 5. COMPREHENSIVE 5-TAB PUPIL ADMISSION WIZARD MODAL      */}
      {/* ======================================================== */}
      {showAdmissionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto animate-fadeIn">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingStudentId ? 'Edit Student Admission Dossier' : 'Pupil Admission & Registration Form'}
                </h3>
                <p className="text-xs text-slate-500">
                  Ghana Education Service standard admission particulars &amp; parent bio-data.
                </p>
              </div>
              <button
                onClick={() => setShowAdmissionModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Document Auto-Fill Dropzone Banner */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📄</span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Have an Admission Document or Bio-Data file?</p>
                  <p className="text-[11px] text-slate-500">Auto-fill all 5 tabs by importing an Excel (.xlsx), CSV, JSON, or text form.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs inline-flex items-center gap-1.5 transition">
                  <span>📂 Choose File</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.json,.txt"
                    onChange={handleWizardFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {importNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium animate-fadeIn flex items-center justify-between">
                <span>{importNotice}</span>
                <button onClick={() => setImportNotice(null)} className="text-emerald-600 font-bold ml-2">✕</button>
              </div>
            )}

            {/* Form Steps */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-center">
              {[
                { id: 1, label: '1. Bio-Data' },
                { id: 2, label: '2. Parents' },
                { id: 3, label: '3. Medical' },
                { id: 4, label: '4. Academic' },
                { id: 5, label: '5. Admin & Fee' },
              ].map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveFormTab(tab.id)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeFormTab === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 pt-1">
              
              {/* TAB 1: PUPIL BIO-DATA */}
              {activeFormTab === 1 && (
                <div className="space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Student Personal &amp; Legal Identification
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Student Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Kwame Kwarteng Mensah"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-900 text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Enrolling Class Grade *
                      </label>
                      <select
                        value={classGrade}
                        onChange={(e) => setClassGrade(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-900 text-slate-900 font-medium"
                      >
                        {GHANAIAN_GRADE_LEVELS.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Date of Birth *
                      </label>
                      <input
                        type="date"
                        required
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Gender *
                      </label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Place of Birth
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Korle-Bu, Accra"
                        value={placeOfBirth}
                        onChange={(e) => setPlaceOfBirth(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nationality
                      </label>
                      <input
                        type="text"
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Religion / Denomination
                      </label>
                      <select
                        value={religion}
                        onChange={(e) => setReligion(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      >
                        <option value="Christian">Christian</option>
                        <option value="Muslim">Muslim</option>
                        <option value="Traditional">Traditional</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Birth Cert / Baptismal No.
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. BC-029102-2019"
                        value={birthCertNo}
                        onChange={(e) => setBirthCertNo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Student Ghana Card #
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. GHA-728192019-4"
                        value={ghanaCardNo}
                        onChange={(e) => setGhanaCardNo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        NHIS Insurance Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 8291039"
                        value={nhisNo}
                        onChange={(e) => setNhisNo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PARENTS & GUARDIANS */}
              {activeFormTab === 2 && (
                <div className="space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Parent &amp; Guardian Particulars
                  </h4>

                  {/* Primary Guardian Highlight */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <p className="text-xs font-bold text-slate-900">
                      Primary Contact &amp; Billing Guardian
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Primary Guardian Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mr. John Mensah"
                          value={primaryGuardianName}
                          onChange={(e) => setPrimaryGuardianName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Relationship to Student *
                        </label>
                        <select
                          value={relationshipToStudent}
                          onChange={(e) => setRelationshipToStudent(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                        >
                          <option value="Father">Father</option>
                          <option value="Mother">Mother</option>
                          <option value="Guardian">Guardian</option>
                          <option value="Uncle">Uncle</option>
                          <option value="Aunt">Aunt</option>
                          <option value="Grandparent">Grandparent</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Primary WhatsApp Phone *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 0244123456"
                          value={primaryPhone}
                          onChange={(e) => setPrimaryPhone(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Guardian Email
                        </label>
                        <input
                          type="email"
                          placeholder="guardian@gmail.com"
                          value={guardianEmail}
                          onChange={(e) => setGuardianEmail(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Guardian Ghana Card Number
                        </label>
                        <input
                          type="text"
                          placeholder="GHA-102938475-1"
                          value={guardianGhanaCardNo}
                          onChange={(e) => setGuardianGhanaCardNo(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Residence & GhanaPost GPS */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Residential Home Address *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. House No. 14, Block B, East Legon, Accra"
                        value={residentialAddress}
                        onChange={(e) => setResidentialAddress(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Digital Address (GhanaPost GPS)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. GA-183-9024"
                        value={digitalAddressGps}
                        onChange={(e) => setDigitalAddressGps(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Father & Mother */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <p className="text-xs font-semibold text-slate-900">Father Particulars</p>
                      <input
                        type="text"
                        placeholder="Father Full Name"
                        value={fatherName}
                        onChange={(e) => setFatherName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Occupation & Employer"
                        value={fatherOccupation}
                        onChange={(e) => setFatherOccupation(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Father Phone"
                        value={fatherPhone}
                        onChange={(e) => setFatherPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>

                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <p className="text-xs font-semibold text-slate-900">Mother Particulars</p>
                      <input
                        type="text"
                        placeholder="Mother Full Name"
                        value={motherName}
                        onChange={(e) => setMotherName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Occupation & Employer"
                        value={motherOccupation}
                        onChange={(e) => setMotherOccupation(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Mother Phone"
                        value={motherPhone}
                        onChange={(e) => setMotherPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: HEALTH & MEDICAL */}
              {activeFormTab === 3 && (
                <div className="space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Health, Allergies &amp; Medical History
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Blood Group
                      </label>
                      <select
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      >
                        <option value="Unknown">Unknown</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Known Food &amp; Drug Allergies
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Peanuts, Eggs, Penicillin, Dust, None"
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Chronic Medical Conditions / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Asthma, Sickle Cell trait, G6PD deficiency, None"
                      value={medicalConditions}
                      onChange={(e) => setMedicalConditions(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        id="immCheck"
                        checked={immunizationComplete}
                        onChange={(e) => setImmunizationComplete(e.target.checked)}
                        className="rounded text-slate-900"
                      />
                      <label htmlFor="immCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Complete immunization records (Polio, Yellow Fever, Measles)
                      </label>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        id="consentCheck"
                        checked={emergencyMedicalConsent}
                        onChange={(e) => setEmergencyMedicalConsent(e.target.checked)}
                        className="rounded text-slate-900"
                      />
                      <label htmlFor="consentCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Emergency medical treatment consent granted to school
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: ACADEMIC HISTORY */}
              {activeFormTab === 4 && (
                <div className="space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Previous Schooling &amp; Academic Transfer Records
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Previous School Name (If Transfer)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Little Angels Preparatory"
                        value={previousSchoolName}
                        onChange={(e) => setPreviousSchoolName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Previous School Location
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kumasi / Cape Coast"
                        value={previousSchoolLocation}
                        onChange={(e) => setPreviousSchoolLocation(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Last Class / Grade Passed
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. KG 2 / Class 3"
                        value={lastClassPassed}
                        onChange={(e) => setLastClassPassed(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Transfer / Testimonial #
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. TR-2025-081"
                        value={transferCertNo}
                        onChange={(e) => setTransferCertNo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Entrance Exam Score
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 86%"
                        value={entranceExamScore}
                        onChange={(e) => setEntranceExamScore(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      CSSPS / SHS Placement Index Number (For JHS $ightarrow$ SHS Transitions)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1029482019"
                      value={shsCsspsIndex}
                      onChange={(e) => setShsCsspsIndex(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* TAB 5: FINANCIAL & ADMINISTRATION */}
              {activeFormTab === 5 && (
                <div className="space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    School Administration &amp; Fee Payer MoMo Details
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Admission / Roll Number *
                      </label>
                      <input
                        type="text"
                        required
                        value={admissionNumber}
                        onChange={(e) => setAdmissionNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-100 text-slate-900 font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Date of Admission
                      </label>
                      <input
                        type="date"
                        required
                        value={admissionDate}
                        onChange={(e) => setAdmissionDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Admission Fee Paid ({currency})
                      </label>
                      <input
                        type="number"
                        value={admissionFeePaid}
                        onChange={(e) => setAdmissionFeePaid(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <p className="text-xs font-bold text-slate-900">
                      Parent Mobile Money (MoMo) Reconciliation Particulars
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Fee Payer MoMo Number (For Auto-Matching)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 0244123456"
                          value={feePayerMoMoNumber}
                          onChange={(e) => setFeePayerMoMoNumber(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          MoMo Registered Account Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Kwame Mensah"
                          value={feePayerMoMoName}
                          onChange={(e) => setFeePayerMoMoName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      id="feeAgreeCheck"
                      checked={feeAgreementAcknowledged}
                      onChange={(e) => setFeeAgreementAcknowledged(e.target.checked)}
                      className="rounded text-slate-900"
                    />
                    <label htmlFor="feeAgreeCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                      Parent has signed &amp; acknowledged the School Fee Schedule and Code of Conduct.
                    </label>
                  </div>
                </div>
              )}

              {/* Wizard Bottom Navigation Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {activeFormTab > 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab((prev) => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    ← Previous
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAdmissionModal(false)}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}

                {activeFormTab < 5 ? (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab((prev) => Math.min(5, prev + 1))}
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                  >
                    Next Step →
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-6 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                  >
                    ✓ Save Pupil Admission
                  </button>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. OFFICIAL PUPIL PROFILE DOSSIER MODAL / SLIDE-OVER     */}
      {/* ======================================================== */}
      {selectedDossierStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto animate-fadeIn">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                Student Profile Dossier
              </span>
              <button
                onClick={() => setSelectedDossierStudent(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Profile Avatar Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-white font-bold text-lg flex items-center justify-center">
                  {initials(selectedDossierStudent.fullName || (selectedDossierStudent as any).name || 'P')}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedDossierStudent.fullName || (selectedDossierStudent as any).name}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-2 py-0.2 rounded text-[11px] font-semibold bg-white text-slate-800 border border-slate-200">
                      {selectedDossierStudent.classGrade}
                    </span>
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      #{selectedDossierStudent.admissionNumber}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Admission Date</p>
                <p className="text-xs font-mono text-slate-800 font-medium">{selectedDossierStudent.admissionDate || '2026-01-10'}</p>
                <span className="px-2 py-0.2 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-200 mt-1 inline-block">
                  {selectedDossierStudent.status || 'Active'}
                </span>
              </div>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* Box 1: Bio-Data & ID */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
                  Bio-Data &amp; Identification
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date of Birth:</span>
                  <span className="font-semibold text-slate-900">{selectedDossierStudent.dateOfBirth || '—'} ({calculateAge(selectedDossierStudent.dateOfBirth)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gender / Religion:</span>
                  <span className="text-slate-900">{selectedDossierStudent.gender || 'Male'} · {selectedDossierStudent.religion || 'Christian'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Place of Birth:</span>
                  <span className="text-slate-900">{selectedDossierStudent.placeOfBirth || 'Ghana'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ghana Card #:</span>
                  <span className="font-mono text-slate-900">{selectedDossierStudent.ghanaCardNumber || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NHIS Card #:</span>
                  <span className="font-mono text-slate-900">{selectedDossierStudent.nhisNumber || '—'}</span>
                </div>
              </div>

              {/* Box 2: Health & Medical */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
                  Health &amp; Medical
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Blood Group:</span>
                  <span className="px-1.5 py-0.2 rounded font-bold bg-white text-slate-800 border border-slate-200">
                    {selectedDossierStudent.bloodGroup || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Known Allergies:</span>
                  <span className="font-medium text-slate-900">{selectedDossierStudent.allergies || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Medical Conditions:</span>
                  <span className="text-slate-900">{selectedDossierStudent.medicalConditions || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Emergency Consent:</span>
                  <span className="text-slate-900 font-medium">✓ Granted</span>
                </div>
              </div>

              {/* Box 3: Parent & Residence */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
                  Parent &amp; Address
                </h3>
                <div>
                  <span className="text-slate-500 block">Primary Guardian:</span>
                  <span className="font-bold text-slate-900">
                    {selectedDossierStudent.primaryGuardianName || (selectedDossierStudent as any).guardianName}{' '}
                    <span className="text-slate-400 font-normal">({selectedDossierStudent.relationshipToStudent || 'Parent'})</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">WhatsApp:</span>
                  <a
                    href={`https://wa.me/${(selectedDossierStudent.primaryPhone || (selectedDossierStudent as any).guardianPhone || '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-medium text-emerald-700 hover:underline"
                  >
                    📱 {selectedDossierStudent.primaryPhone || (selectedDossierStudent as any).guardianPhone}
                  </a>
                </div>
                <div>
                  <span className="text-slate-500 block">Residential Address:</span>
                  <span className="text-slate-900">{selectedDossierStudent.residentialAddress || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">GhanaPost GPS:</span>
                  <span className="font-mono font-medium text-slate-900">{selectedDossierStudent.digitalAddressGps || '—'}</span>
                </div>
              </div>

              {/* Box 4: Financial & Prior Academic */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
                  Fee Payer &amp; Academic History
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee Payer MoMo:</span>
                  <span className="font-mono text-slate-900">{selectedDossierStudent.feePayerMoMoNumber || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">MoMo Account Name:</span>
                  <span className="text-slate-900">{selectedDossierStudent.feePayerMoMoName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission Fee Paid:</span>
                  <span className="font-mono font-bold text-slate-900">{currency} {selectedDossierStudent.admissionFeePaid || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Previous School:</span>
                  <span className="text-slate-900">{selectedDossierStudent.previousSchoolName || 'New Entrant'}</span>
                </div>
              </div>

            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => handleDeleteStudent(selectedDossierStudent.id, selectedDossierStudent.fullName || (selectedDossierStudent as any).name)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition"
              >
                🗑️ Delete Student
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                >
                  🖨️ Print Dossier (PDF)
                </button>
                <button
                  onClick={() => {
                    const target = selectedDossierStudent;
                    setSelectedDossierStudent(null);
                    handleOpenEdit(target);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-800 hover:bg-slate-50"
                >
                  Edit Student Info
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    
      {/* BULK ROSTER & DOCUMENT IMPORT MODAL */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[95vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📥</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Import Student Roster &amp; Admission Records</h3>
                  <p className="text-xs text-slate-500">Bulk upload pupils from Excel (.xlsx), CSV, JSON, or pasted admission forms.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkImportModal(false);
                  setBulkParsedStudents([]);
                }}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Upload & Template Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 text-center space-y-2">
                <span className="text-2xl inline-block">📊</span>
                <p className="text-xs font-bold text-slate-800">Upload Excel or CSV File</p>
                <p className="text-[11px] text-slate-500">Supports .xlsx, .xls, .csv, and .json</p>
                <label className="cursor-pointer inline-block px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs">
                  Browse File
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.json,.txt"
                    onChange={handleBulkFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2 flex flex-col justify-center items-center">
                <span className="text-2xl inline-block">📋</span>
                <p className="text-xs font-bold text-slate-800">Need the Standard Template?</p>
                <p className="text-[11px] text-slate-500">Pre-formatted with all Ghanaian admission fields</p>
                <button
                  type="button"
                  onClick={downloadSampleAdmissionCSV}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold transition shadow-xs"
                >
                  ⬇️ Download Sample CSV
                </button>
              </div>
            </div>

            {/* Paste Document Text Tab */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Or Paste Admission Document / Form Text</label>
              <textarea
                rows={3}
                placeholder="Paste tab-delimited records, CSV lines, or 'Field: Value' key-value admission slips here..."
                value={pastedDocText}
                onChange={(e) => setPastedDocText(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-mono text-slate-800 focus:outline-none focus:border-slate-900"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800"
                >
                  Parse Text
                </button>
              </div>
            </div>

            {/* Parsed Preview Table */}
            {bulkParsedStudents.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-800">
                    ✓ Found {bulkParsedStudents.length} student record(s) ready to import:
                  </p>
                  <span className="text-[11px] text-slate-500 font-mono">
                    All Ghanaian bio-data fields detected
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5">Pupil Name</th>
                        <th className="p-2.5">Class</th>
                        <th className="p-2.5">Gender</th>
                        <th className="p-2.5">Parent / Guardian</th>
                        <th className="p-2.5">Parent Phone</th>
                        <th className="p-2.5">GPS / Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkParsedStudents.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="p-2.5 font-bold text-slate-900">{s.fullName}</td>
                          <td className="p-2.5 text-slate-700">{s.classGrade}</td>
                          <td className="p-2.5 text-slate-600">{s.gender}</td>
                          <td className="p-2.5 text-slate-700">{s.primaryGuardianName}</td>
                          <td className="p-2.5 font-mono text-slate-700">{s.primaryPhone || '—'}</td>
                          <td className="p-2.5 text-[11px] text-slate-500">{s.digitalAddressGps || s.residentialAddress || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Action */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowBulkImportModal(false);
                  setBulkParsedStudents([]);
                  setPastedDocText('');
                }}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={bulkParsedStudents.length === 0}
                onClick={handleCommitBulkImport}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-xs transition"
              >
                ✓ Import {bulkParsedStudents.length} Students to Directory
              </button>
            </div>

          </div>
        </div>
      )}

</div>
  );
}
