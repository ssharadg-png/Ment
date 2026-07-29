import type { Faculty, Student } from '../types';

export const today = () => new Date().toISOString().slice(0, 10);
export const normalize = (value: unknown) => String(value ?? '').trim();
export const normalizedKey = (value: unknown) => normalize(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export const safeNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
export const createId = () => `${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
export const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const assignedStudents = (students: Student[], facultyId: string) =>
  students.filter((student) => student.mentorId === facultyId);

export const totalLoad = (faculty: Faculty, students: Student[]) =>
  Math.max(0, safeNumber(faculty.currentMentees)) + assignedStudents(students, faculty.id).length;

export const remainingCapacity = (faculty: Faculty, students: Student[]) =>
  Math.max(0, safeNumber(faculty.maxCapacity) - totalLoad(faculty, students));

export const facultyStatus = (faculty: Faculty, students: Student[]) => {
  if (faculty.availability === 'Unavailable') return { label: 'Unavailable', tone: 'neutral' as const };
  const capacity = safeNumber(faculty.maxCapacity);
  const load = totalLoad(faculty, students);
  if (capacity <= 0) return { label: 'Invalid capacity', tone: 'danger' as const };
  if (load >= capacity) return { label: 'Full capacity', tone: 'danger' as const };
  if (load / capacity >= 0.85) return { label: 'Nearing capacity', tone: 'warning' as const };
  return { label: 'Balanced', tone: 'success' as const };
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
