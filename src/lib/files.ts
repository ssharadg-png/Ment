import * as XLSX from 'xlsx';
import type { Faculty, Student } from '../types';
import { createId, normalizedKey, normalize, safeNumber } from './helpers';

const alias = (row: Record<string, unknown>, names: string[]) => {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizedKey(key), value]));
  for (const name of names) {
    const value = normalized.get(normalizedKey(name));
    if (value !== undefined) return value;
  }
  return '';
};

function parseBoolean(value: unknown) {
  return ['yes', 'true', '1', 'y'].includes(normalize(value).toLowerCase());
}

export async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['csv', 'xlsx', 'xls'].includes(extension ?? '')) {
    throw new Error('Please upload a CSV, XLSX, or XLS file.');
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The uploaded file does not contain a worksheet.');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
    defval: '',
    raw: false
  });
}

export async function importFacultyFile(file: File, defaultCapacity: number): Promise<Faculty[]> {
  const rows = await readRows(file);
  if (rows.length === 0) throw new Error('The faculty file is empty.');
  const faculty = rows.map((row, index) => ({
    id: normalize(alias(row, ['Faculty ID', 'ID', 'FacultyID'])),
    name: normalize(alias(row, ['Faculty Name', 'Name'])),
    department: normalize(alias(row, ['Department'])),
    designation: normalize(alias(row, ['Designation'])),
    programme: normalize(alias(row, ['Programme', 'Program'])),
    maxCapacity: safeNumber(alias(row, ['Maximum Mentees', 'Maximum Capacity', 'Max Capacity']), defaultCapacity),
    currentMentees: safeNumber(alias(row, ['Current Mentees', 'Current Workload']), 0),
    availability: normalize(alias(row, ['Availability Status', 'Availability'])).toLowerCase() === 'unavailable'
      ? 'Unavailable' as const
      : 'Available' as const,
    preferred: normalize(alias(row, ['Preferred Batch/Class/Specialization', 'Preferred', 'Preference'])),
    classTeacher: parseBoolean(alias(row, ['Class Teacher', 'Is Class Teacher']))
  }));

  if (faculty.some((member) => !member.id || !member.name)) {
    throw new Error(`Faculty import failed: row ${faculty.findIndex((member) => !member.id || !member.name) + 2} is missing Faculty ID or Faculty Name.`);
  }
  return faculty;
}

export async function importStudentFile(file: File): Promise<Student[]> {
  const rows = await readRows(file);
  if (rows.length === 0) throw new Error('The student file is empty.');
  const students = rows.map((row) => ({
    id: createId(),
    regNo: normalize(alias(row, ['Registration Number', 'Registration No', 'Reg No', 'Student ID'])),
    name: normalize(alias(row, ['Student Name', 'Name'])),
    programme: normalize(alias(row, ['Programme', 'Program'])),
    batch: normalize(alias(row, ['Batch'])),
    year: normalize(alias(row, ['Year'])),
    semester: normalize(alias(row, ['Semester'])),
    section: normalize(alias(row, ['Section'])),
    specialization: normalize(alias(row, ['Specialization', 'Specialisation'])),
    gender: normalize(alias(row, ['Gender'])),
    existingMentor: normalize(alias(row, ['Existing Faculty Mentor', 'Existing Mentor', 'Mentor'])),
    specialRequirement: normalize(alias(row, ['Special Mentoring Requirement', 'Special Requirement'])),
    mentorId: undefined,
    locked: false
  }));

  if (students.some((student) => !student.regNo || !student.name)) {
    throw new Error(`Student import failed: row ${students.findIndex((student) => !student.regNo || !student.name) + 2} is missing Registration Number or Student Name.`);
  }
  return students;
}
