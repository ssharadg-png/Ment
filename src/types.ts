export type Availability = 'Available' | 'Unavailable';
export type GroupMode = 'none' | 'programme' | 'batch' | 'section' | 'specialization';

export interface Faculty {
  id: string;
  name: string;
  department: string;
  designation: string;
  programme: string;
  maxCapacity: number;
  currentMentees: number;
  availability: Availability;
  preferred: string;
  classTeacher: boolean;
}

export interface Student {
  id: string;
  regNo: string;
  name: string;
  programme: string;
  batch: string;
  year: string;
  semester: string;
  section: string;
  specialization: string;
  gender?: string;
  existingMentor?: string;
  specialRequirement?: string;
  mentorId?: string;
  locked?: boolean;
}

export interface AllocationRules {
  targetPerFaculty: number;
  defaultCapacity: number;
  maxDifference: number;
  groupMode: GroupMode;
  equalAllocation: boolean;
  classTeacherPreference: boolean;
  retainExisting: boolean;
  avoidMultiSection: boolean;
  randomize: boolean;
  allowUnequal: boolean;
  lowestWorkload: boolean;
  lockExisting: boolean;
}

export interface ReportMeta {
  department: string;
  programme: string;
  academicYear: string;
  semester: string;
  allocationDate: string;
  preparedBy: string;
}

export interface AppState {
  faculty: Faculty[];
  students: Student[];
  rules: AllocationRules;
  meta: ReportMeta;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface AllocationResult {
  students: Student[];
  warnings: string[];
  unallocatedCount: number;
  workloadDifference: number;
}

export interface Summary {
  totalStudents: number;
  totalFaculty: number;
  availableFaculty: number;
  allocated: number;
  unallocated: number;
  average: number;
  highest: number;
  lowest: number;
  difference: number;
  fullCapacity: number;
}
