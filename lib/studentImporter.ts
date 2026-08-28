import * as XLSX from 'xlsx';
import { SchoolStudent } from './schoolStore';
import { GHANAIAN_GRADE_LEVELS } from './archetypes/config';

export interface ParsedStudentResult {
  students: Partial<SchoolStudent>[];
  errors: string[];
  totalParsed: number;
}

// Normalizes arbitrary column header strings (e.g., "Student's Full Name", "D.O.B.", "Ghana_Card")
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Match class grade against known Ghanaian grade levels
export function matchGhanaianGrade(input?: string): string {
  if (!input) return 'Basic 1 (Class 1)';
  const clean = input.toLowerCase().trim();

  for (const grade of GHANAIAN_GRADE_LEVELS) {
    const gClean = grade.toLowerCase();
    if (gClean === clean) return grade;
    if (clean.includes('creche') && gClean.includes('creche')) return grade;
    if (clean.includes('nursery 1') && gClean.includes('nursery 1')) return grade;
    if (clean.includes('nursery 2') && gClean.includes('nursery 2')) return grade;
    if ((clean.includes('kg 1') || clean.includes('kindergarten 1')) && gClean.includes('kg 1')) return grade;
    if ((clean.includes('kg 2') || clean.includes('kindergarten 2')) && gClean.includes('kg 2')) return grade;
    if ((clean.includes('class 1') || clean.includes('basic 1')) && gClean.includes('class 1')) return grade;
    if ((clean.includes('class 2') || clean.includes('basic 2')) && gClean.includes('class 2')) return grade;
    if ((clean.includes('class 3') || clean.includes('basic 3')) && gClean.includes('class 3')) return grade;
    if ((clean.includes('class 4') || clean.includes('basic 4')) && gClean.includes('class 4')) return grade;
    if ((clean.includes('class 5') || clean.includes('basic 5')) && gClean.includes('class 5')) return grade;
    if ((clean.includes('class 6') || clean.includes('basic 6')) && gClean.includes('class 6')) return grade;
    if ((clean.includes('jhs 1') || clean.includes('basic 7')) && gClean.includes('jhs 1')) return grade;
    if ((clean.includes('jhs 2') || clean.includes('basic 8')) && gClean.includes('jhs 2')) return grade;
    if ((clean.includes('jhs 3') || clean.includes('basic 9')) && gClean.includes('jhs 3')) return grade;
    if (clean.includes('shs 1') && gClean.includes('shs 1')) return grade;
    if (clean.includes('shs 2') && gClean.includes('shs 2')) return grade;
    if (clean.includes('shs 3') && gClean.includes('shs 3')) return grade;
  }

  return input;
}

// Convert a single record dictionary to a standardized SchoolStudent object
export function mapRowToStudent(row: Record<string, any>, index: number = 0): Partial<SchoolStudent> {
  const normMap: Record<string, any> = {};
  Object.keys(row).forEach((k) => {
    normMap[normalizeKey(k)] = row[k];
  });

  const get = (...keys: string[]): string => {
    for (const key of keys) {
      const nKey = normalizeKey(key);
      if (normMap[nKey] !== undefined && normMap[nKey] !== null && String(normMap[nKey]).trim() !== '') {
        return String(normMap[nKey]).trim();
      }
    }
    return '';
  };

  const getNum = (...keys: string[]): number => {
    const val = get(...keys);
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const getBool = (...keys: string[]): boolean => {
    const val = get(...keys).toLowerCase();
    return val === 'true' || val === 'yes' || val === '1' || val === 'y';
  };

  const fullName = get(
    'fullname',
    'studentname',
    'name',
    'pupilname',
    'candidatename',
    'childname',
    'student',
    'firstandlastname'
  ) || `Student #${index + 1}`;

  const rawGender = get('gender', 'sex');
  let gender: 'Male' | 'Female' = 'Male';
  if (rawGender.toLowerCase().startsWith('f')) gender = 'Female';

  const rawRel = get('relationshiptostudent', 'relationship', 'guardianrelation');
  let relationshipToStudent: SchoolStudent['relationshipToStudent'] = 'Father';
  if (rawRel.toLowerCase().includes('moth')) relationshipToStudent = 'Mother';
  else if (rawRel.toLowerCase().includes('guard')) relationshipToStudent = 'Guardian';
  else if (rawRel.toLowerCase().includes('uncle')) relationshipToStudent = 'Uncle';
  else if (rawRel.toLowerCase().includes('aunt')) relationshipToStudent = 'Aunt';
  else if (rawRel.toLowerCase().includes('grand')) relationshipToStudent = 'Grandparent';

  const primaryGuardianName = get(
    'primaryguardianname',
    'guardianname',
    'parentname',
    'fathername',
    'mothername',
    'guardian',
    'contactperson'
  ) || 'Parent / Guardian';

  const primaryPhone = get(
    'primaryphone',
    'guardianphone',
    'parentphone',
    'phone',
    'phonenumber',
    'mobilenumber',
    'contactnumber',
    'whatsappnumber',
    'whatsapp'
  );

  const rawClass = get('classgrade', 'class', 'grade', 'level', 'admittedclass');
  const classGrade = matchGhanaianGrade(rawClass);

  const admissionNumber = get('admissionnumber', 'adminno', 'admissionno', 'id', 'studentid', 'indexno') ||
    `SCH-2026-${String(Date.now()).slice(-4)}-${index + 1}`;

  const admissionDate = get('admissiondate', 'dateadmitted', 'enrollmentdate') || new Date().toISOString().slice(0, 10);
  const dateOfBirth = get('dateofbirth', 'dob', 'birthdate');

  return {
    id: 'std_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + index,
    fullName,
    admissionNumber,
    admissionDate,
    classGrade,
    gender,
    dateOfBirth,
    placeOfBirth: get('placeofbirth', 'hometown', 'birthplace'),
    nationality: get('nationality', 'country') || 'Ghanaian',
    religion: (get('religion') as any) || 'Christian',
    birthCertOrBaptismalNo: get('birthcertnumber', 'birthcertno', 'birthcertificate'),
    ghanaCardNumber: get('ghanacardnumber', 'ghanacard', 'nationalid', 'ghaid'),
    nhisNumber: get('nhisnumber', 'nhis', 'healthinsuranceno'),
    bloodGroup: (get('bloodgroup', 'bloodtype') as any) || 'Unknown',
    allergies: get('allergies', 'allergy'),
    medicalConditions: get('medicalconditions', 'conditions', 'healthissues'),
    immunizationComplete: get('immunizationcomplete') ? getBool('immunizationcomplete') : true,
    emergencyMedicalConsent: true,
    fatherName: get('fathername', 'father'),
    fatherOccupation: get('fatheroccupation', 'fatherjob'),
    fatherPhone: get('fatherphone', 'fathermobile'),
    fatherEmployer: get('fatheremployer'),
    motherName: get('mothername', 'mother'),
    motherOccupation: get('motheroccupation', 'motherjob'),
    motherPhone: get('motherphone', 'mothermobile'),
    motherEmployer: get('motheremployer'),
    primaryGuardianName,
    relationshipToStudent,
    primaryPhone,
    secondaryPhone: get('secondaryphone', 'emergencyphone', 'altphone'),
    guardianEmail: get('guardianemail', 'parentemail', 'email'),
    guardianGhanaCardNumber: get('guardianghanacardnumber', 'parentghanacard'),
    residentialAddress: get('residentialaddress', 'address', 'residence', 'location'),
    digitalAddressGps: get('digitaladdressgps', 'gps', 'digitaladdress', 'ghanapostgps'),
    emergencyContactPerson: get('emergencycontactperson', 'emergencycontact'),
    emergencyContactPhone: get('emergencycontactphone', 'emergencyphone'),
    previousSchoolName: get('previousschoolname', 'previousschool', 'lastschool'),
    previousSchoolLocation: get('previousschoollocation', 'schoollocation'),
    lastClassPassed: get('lastclasspassed', 'lastclass'),
    transferCertificateNo: get('transfercertificatenumber', 'transfercertno', 'transferno'),
    entranceExamScore: get('entranceexamscore', 'examscore', 'testscore'),
    shsCsspsPlacementIndex: get('shscsspsindex', 'csspsindex', 'beceindex'),
    admissionFeePaid: getNum('admissionfeepaid', 'admissionfee', 'feepaid') || 250,
    feePayerMoMoNumber: get('feepayermomonumber', 'momonumber', 'feepayerphone') || primaryPhone,
    feePayerMoMoName: get('feepayermomoname', 'momoname', 'feepayername') || primaryGuardianName,
    feeAgreementAcknowledged: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Parse an uploaded ArrayBuffer / File using SheetJS (XLSX / XLS / CSV / JSON)
export async function parseStudentFile(file: File): Promise<ParsedStudentResult> {
  const errors: string[] = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { students: [], errors: ['No sheet found in workbook.'], totalParsed: 0 };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawJson || rawJson.length === 0) {
      return { students: [], errors: ['Sheet is empty or contains no data rows.'], totalParsed: 0 };
    }

    const students: Partial<SchoolStudent>[] = rawJson.map((row, idx) => mapRowToStudent(row, idx));
    return { students, errors, totalParsed: students.length };
  } catch (err: any) {
    return { students: [], errors: [err.message || 'Failed to parse file.'], totalParsed: 0 };
  }
}

// Parse raw pasted text (CSV lines or Key: Value pairs from an admission doc)
export function parsePastedAdmissionText(text: string): ParsedStudentResult {
  const errors: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    return { students: [], errors: ['Pasted text is empty.'], totalParsed: 0 };
  }

  // 1. Try JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const students = arr.map((item, idx) => mapRowToStudent(item, idx));
      return { students, errors, totalParsed: students.length };
    } catch (_e) {}
  }

  // 2. Try Key-Value lines (e.g. "Full Name: Kwame Mensah \n Class: Basic 1 \n Phone: 0244123456")
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const kvMatches = lines.filter((l) => l.includes(':') || l.includes('='));

  if (kvMatches.length >= 2 && kvMatches.length >= lines.length * 0.5) {
    const singleObj: Record<string, any> = {};
    lines.forEach((line) => {
      const splitIdx = line.indexOf(':') !== -1 ? line.indexOf(':') : line.indexOf('=');
      if (splitIdx > 0) {
        const key = line.slice(0, splitIdx).trim();
        const val = line.slice(splitIdx + 1).trim();
        singleObj[key] = val;
      }
    });

    const student = mapRowToStudent(singleObj, 0);
    return { students: [student], errors, totalParsed: 1 };
  }

  // 3. Try CSV / Delimited
  try {
    const workbook = XLSX.read(trimmed, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rawJson.length > 0) {
      const students = rawJson.map((row, idx) => mapRowToStudent(row, idx));
      return { students, errors, totalParsed: students.length };
    }
  } catch (_e) {}

  return { students: [], errors: ['Could not detect valid student admission format.'], totalParsed: 0 };
}

// Download Sample Ghanaian Admission Template (.csv)
export function downloadSampleAdmissionCSV() {
  const sampleData = [
    {
      'Full Name': 'Kwame Mensah',
      'Class': 'Basic 1 (Class 1)',
      'Gender': 'Male',
      'Date of Birth': '2019-04-15',
      'Place of Birth': 'Accra',
      'Nationality': 'Ghanaian',
      'Religion': 'Christian',
      'Ghana Card No': 'GHA-726194829-1',
      'NHIS No': 'NHIS-84920482',
      'Parent Name': 'Emmanuel Mensah',
      'Relationship': 'Father',
      'Parent Phone': '0244123456',
      'Parent Email': 'emmanuel.mensah@gmail.com',
      'Occupation': 'Civil Engineer',
      'Residential Address': 'House 14, East Legon, Accra',
      'GhanaPost GPS': 'GA-183-9024',
      'Previous School': 'Morning Star Nursery',
      'Allergies': 'Peanuts',
      'Blood Group': 'O+',
      'MoMo Payer Phone': '0244123456',
      'Admission Fee Paid': '250',
    },
    {
      'Full Name': 'Akosua Serwaa Boateng',
      'Class': 'Basic 2 (Class 2)',
      'Gender': 'Female',
      'Date of Birth': '2018-09-22',
      'Place of Birth': 'Kumasi',
      'Nationality': 'Ghanaian',
      'Religion': 'Christian',
      'Ghana Card No': 'GHA-394857281-9',
      'NHIS No': 'NHIS-93847291',
      'Parent Name': 'Serwaa Boateng',
      'Relationship': 'Mother',
      'Parent Phone': '0200987654',
      'Parent Email': 'serwaa.boateng@gmail.com',
      'Occupation': 'Pharmacist',
      'Residential Address': 'Plot 4, Airport Hills, Accra',
      'GhanaPost GPS': 'GL-049-3829',
      'Previous School': 'St. Martin Preparatory',
      'Allergies': 'None',
      'Blood Group': 'A+',
      'MoMo Payer Phone': '0200987654',
      'Admission Fee Paid': '250',
    },
    {
      'Full Name': 'Kofi Osei Tutu',
      'Class': 'JHS 1 (Basic 7)',
      'Gender': 'Male',
      'Date of Birth': '2013-11-05',
      'Place of Birth': 'Tema',
      'Nationality': 'Ghanaian',
      'Religion': 'Christian',
      'Ghana Card No': 'GHA-847291039-4',
      'NHIS No': 'NHIS-10394829',
      'Parent Name': 'Kwabena Tutu',
      'Relationship': 'Father',
      'Parent Phone': '0555890123',
      'Parent Email': 'kwabena.tutu@yahoo.com',
      'Occupation': 'Accountant',
      'Residential Address': 'Community 11, Tema',
      'GhanaPost GPS': 'GT-029-4820',
      'Previous School': 'Tema Ridge School',
      'Allergies': 'Dust Asthma',
      'Blood Group': 'B+',
      'MoMo Payer Phone': '0555890123',
      'Admission Fee Paid': '300',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'AMS_Ghana_Pupil_Admission_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
