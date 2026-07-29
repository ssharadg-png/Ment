import type {
  AllocationResult,
  AllocationRules,
  AppState,
  Faculty,
  Student,
  Summary,
  ValidationResult
} from '../types';
import {
  deepClone,
  normalizedKey,
  normalize,
  safeNumber,
  totalLoad
} from './helpers';

const unique = (items: string[]) => [...new Set(items)];

export function validateState(state: AppState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (state.faculty.length === 0) errors.push('No faculty data has been entered.');
  if (state.students.length === 0) errors.push('No student data has been entered.');

  const facultyIds = new Set<string>();
  state.faculty.forEach((faculty, index) => {
    if (!normalize(faculty.id)) errors.push(`Faculty row ${index + 1}: Faculty ID is blank.`);
    if (!normalize(faculty.name)) errors.push(`Faculty row ${index + 1}: Faculty name is blank.`);
    const id = normalizedKey(faculty.id);
    if (id && facultyIds.has(id)) errors.push(`Duplicate faculty ID found: ${faculty.id}.`);
    if (id) facultyIds.add(id);
    if (!Number.isFinite(Number(faculty.maxCapacity)) || Number(faculty.maxCapacity) <= 0) {
      errors.push(`Faculty ${faculty.name || faculty.id}: maximum capacity must be greater than zero.`);
    }
    if (safeNumber(faculty.currentMentees) < 0) {
      errors.push(`Faculty ${faculty.name || faculty.id}: current mentees cannot be negative.`);
    }
    if (safeNumber(faculty.currentMentees) > safeNumber(faculty.maxCapacity)) {
      warnings.push(`${faculty.name || faculty.id} already exceeds the stated mentoring capacity.`);
    }
  });

  const studentIds = new Set<string>();
  state.students.forEach((student, index) => {
    if (!normalize(student.regNo)) errors.push(`Student row ${index + 1}: registration number is blank.`);
    if (!normalize(student.name)) errors.push(`Student row ${index + 1}: student name is blank.`);
    const id = normalizedKey(student.regNo);
    if (id && studentIds.has(id)) errors.push(`Duplicate student registration number found: ${student.regNo}.`);
    if (id) studentIds.add(id);
  });

  const availableFaculty = state.faculty.filter(
    (faculty) => faculty.availability === 'Available' && safeNumber(faculty.maxCapacity) > safeNumber(faculty.currentMentees)
  );
  if (state.faculty.length > 0 && availableFaculty.length === 0) {
    errors.push('No available faculty member has remaining mentoring capacity.');
  }

  const totalCapacity = availableFaculty.reduce(
    (sum, faculty) => sum + Math.max(0, safeNumber(faculty.maxCapacity) - safeNumber(faculty.currentMentees)),
    0
  );
  if (state.students.length > totalCapacity) {
    warnings.push(
      `${state.students.length - totalCapacity} student(s) may remain unallocated because available faculty capacity is insufficient.`
    );
  }

  return { errors: unique(errors), warnings: unique(warnings) };
}

function findFaculty(faculty: Faculty[], reference?: string) {
  const ref = normalizedKey(reference);
  if (!ref) return undefined;
  return faculty.find(
    (member) => normalizedKey(member.id) === ref || normalizedKey(member.name) === ref
  );
}

function groupValue(student: Student, rules: AllocationRules) {
  if (rules.groupMode === 'none') return 'All students';
  return normalize(student[rules.groupMode]) || `Unspecified ${rules.groupMode}`;
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function preferenceScore(
  faculty: Faculty,
  student: Student,
  assignedSections: Map<string, Set<string>>,
  rules: AllocationRules
) {
  let score = 0;
  const preferred = normalizedKey(faculty.preferred);

  if (rules.groupMode === 'programme' && normalizedKey(faculty.programme) === normalizedKey(student.programme)) score += 6;
  if (preferred) {
    if (student.batch && preferred.includes(normalizedKey(student.batch))) score += 4;
    if (student.section && preferred.includes(normalizedKey(student.section))) score += 5;
    if (student.specialization && preferred.includes(normalizedKey(student.specialization))) score += 4;
    if (student.programme && preferred.includes(normalizedKey(student.programme))) score += 3;
  }
  if (
    rules.classTeacherPreference &&
    faculty.classTeacher &&
    (preferred.includes(normalizedKey(student.section)) || preferred.includes(normalizedKey(student.batch)))
  ) {
    score += 8;
  }
  if (rules.avoidMultiSection && student.section) {
    const sections = assignedSections.get(faculty.id) ?? new Set<string>();
    if (sections.size === 0 || sections.has(student.section)) score += 5;
    else score -= 10;
  }
  return score;
}

export function allocateStudents(state: AppState, onlyUnlocked = false): AllocationResult {
  const validation = validateState(state);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join(' '));
  }

  const faculty = deepClone(state.faculty);
  const students = deepClone(state.students);
  const warnings = [...validation.warnings];
  const rules = state.rules;

  if (onlyUnlocked) {
    students.forEach((student) => {
      if (!student.locked) student.mentorId = undefined;
    });
  } else {
    students.forEach((student) => {
      student.mentorId = undefined;
      student.locked = false;
    });
  }

  const available = faculty.filter(
    (member) => member.availability === 'Available' && safeNumber(member.maxCapacity) > safeNumber(member.currentMentees)
  );
  const assignedSections = new Map(available.map((member) => [member.id, new Set<string>()]));

  students
    .filter((student) => student.mentorId && student.locked)
    .forEach((student) => {
      if (student.section) assignedSections.get(student.mentorId as string)?.add(student.section);
    });

  const currentAssignedCount = (facultyId: string) => students.filter((student) => student.mentorId === facultyId).length;
  const currentLoad = (member: Faculty) => safeNumber(member.currentMentees) + currentAssignedCount(member.id);
  const hardRemaining = (member: Faculty) => Math.max(0, safeNumber(member.maxCapacity) - currentLoad(member));

  if (rules.retainExisting && !onlyUnlocked) {
    students.forEach((student) => {
      if (!student.existingMentor) return;
      const mentor = findFaculty(faculty, student.existingMentor);
      if (!mentor) {
        warnings.push(`Existing mentor not found for ${student.regNo}.`);
        return;
      }
      if (mentor.availability !== 'Available') {
        warnings.push(`${mentor.name} is unavailable; ${student.regNo} was not retained.`);
        return;
      }
      if (hardRemaining(mentor) <= 0) {
        warnings.push(`${mentor.name} has no remaining capacity; ${student.regNo} was not retained.`);
        return;
      }
      student.mentorId = mentor.id;
      student.locked = rules.lockExisting;
      if (student.section) assignedSections.get(mentor.id)?.add(student.section);
    });
  }

  const pending = students.filter((student) => !student.mentorId);
  const groups = new Map<string, Student[]>();
  pending.forEach((student) => {
    const group = groupValue(student, rules);
    groups.set(group, [...(groups.get(group) ?? []), student]);
  });

  const availableCapacity = available.reduce((sum, member) => sum + hardRemaining(member), 0);
  const assignableCount = Math.min(pending.length, availableCapacity);
  const computedEqualTarget = available.length > 0 ? Math.floor((students.length - pending.length + assignableCount) / available.length) : 0;

  const targetLimit = (member: Faculty) => {
    if (rules.targetPerFaculty > 0) {
      return Math.max(0, rules.targetPerFaculty - currentLoad(member));
    }
    if (!rules.allowUnequal) {
      return Math.max(0, computedEqualTarget - currentLoad(member));
    }
    return Number.POSITIVE_INFINITY;
  };

  const candidateRemaining = (member: Faculty) => Math.min(hardRemaining(member), targetLimit(member));

  [...groups.values()].forEach((groupStudents) => {
    const ordered = rules.randomize
      ? shuffled(groupStudents)
      : [...groupStudents].sort((a, b) => a.regNo.localeCompare(b.regNo, undefined, { numeric: true }));

    ordered.forEach((student) => {
      const candidates = available.filter((member) => candidateRemaining(member) > 0);
      if (candidates.length === 0) return;

      candidates.sort((first, second) => {
        const firstLoad = currentLoad(first);
        const secondLoad = currentLoad(second);
        if (rules.equalAllocation && firstLoad !== secondLoad) return firstLoad - secondLoad;

        const firstPreference = preferenceScore(first, student, assignedSections, rules);
        const secondPreference = preferenceScore(second, student, assignedSections, rules);
        if (firstPreference !== secondPreference) return secondPreference - firstPreference;

        const firstRemaining = hardRemaining(first);
        const secondRemaining = hardRemaining(second);
        if (firstRemaining !== secondRemaining) return secondRemaining - firstRemaining;
        return first.name.localeCompare(second.name);
      });

      let selected = candidates[0];
      if (rules.lowestWorkload) {
        const minimumLoad = Math.min(...candidates.map(currentLoad));
        const lowest = candidates.filter((member) => currentLoad(member) === minimumLoad);
        lowest.sort(
          (first, second) =>
            preferenceScore(second, student, assignedSections, rules) -
              preferenceScore(first, student, assignedSections, rules) ||
            first.name.localeCompare(second.name)
        );
        selected = lowest[0] ?? selected;
      }

      student.mentorId = selected.id;
      if (student.section) assignedSections.get(selected.id)?.add(student.section);
    });
  });

  const loads = available.map(currentLoad);
  const workloadDifference = loads.length > 0 ? Math.max(...loads) - Math.min(...loads) : 0;
  const unallocatedCount = students.filter((student) => !student.mentorId).length;

  if (unallocatedCount > 0) {
    warnings.push(
      `${unallocatedCount} student(s) remain unallocated because capacity or allocation-rule restrictions prevented assignment.`
    );
  }
  if (workloadDifference > rules.maxDifference) {
    warnings.push(
      `The final workload difference is ${workloadDifference}, above the permitted difference of ${rules.maxDifference}. Capacity, locked allocations, or preference rules may have made tighter balancing impossible.`
    );
  }

  return {
    students,
    warnings: unique(warnings),
    unallocatedCount,
    workloadDifference
  };
}

export function getSummary(faculty: Faculty[], students: Student[]): Summary {
  const available = faculty.filter((member) => member.availability === 'Available');
  const loads = available.map((member) => totalLoad(member, students));
  const allocated = students.filter((student) => student.mentorId).length;
  return {
    totalStudents: students.length,
    totalFaculty: faculty.length,
    availableFaculty: available.length,
    allocated,
    unallocated: students.length - allocated,
    average: loads.length ? loads.reduce((sum, load) => sum + load, 0) / loads.length : 0,
    highest: loads.length ? Math.max(...loads) : 0,
    lowest: loads.length ? Math.min(...loads) : 0,
    difference: loads.length ? Math.max(...loads) - Math.min(...loads) : 0,
    fullCapacity: available.filter((member) => totalLoad(member, students) >= member.maxCapacity).length
  };
}
