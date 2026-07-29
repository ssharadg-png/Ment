import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import { allocateStudents, getSummary, validateState } from '../lib/allocation';
import { createSampleState, defaultState } from '../data/sampleData';

function createState(facultyCount = 3, studentCount = 6, capacity = 3): AppState {
  return {
    faculty: Array.from({ length: facultyCount }, (_, index) => ({
      id: `F${index + 1}`,
      name: `Faculty ${index + 1}`,
      department: 'Commerce',
      designation: 'Assistant Professor',
      programme: 'B.Com',
      maxCapacity: capacity,
      currentMentees: 0,
      availability: 'Available',
      preferred: '',
      classTeacher: false
    })),
    students: Array.from({ length: studentCount }, (_, index) => ({
      id: `S${index + 1}`,
      regNo: `R${index + 1}`,
      name: `Student ${index + 1}`,
      programme: 'B.Com',
      batch: '2026',
      year: 'I',
      semester: 'I',
      section: index % 2 ? 'B' : 'A',
      specialization: '',
      locked: false
    })),
    rules: { ...defaultState.rules, groupMode: 'none', retainExisting: false, lockExisting: false },
    meta: { ...defaultState.meta }
  };
}

describe('faculty mentor allocation engine', () => {
  it('allocates students when total capacity is larger', () => {
    const state = createState(3, 5, 4);
    const result = allocateStudents(state);
    expect(result.unallocatedCount).toBe(0);
    expect(getSummary(state.faculty, result.students).difference).toBeLessThanOrEqual(1);
  });

  it('fills capacity exactly', () => {
    const state = createState(3, 9, 3);
    const result = allocateStudents(state);
    expect(result.unallocatedCount).toBe(0);
    expect(state.faculty.map((faculty) => result.students.filter((student) => student.mentorId === faculty.id).length)).toEqual([3, 3, 3]);
  });

  it('leaves students unallocated when capacity is insufficient', () => {
    const result = allocateStudents(createState(2, 7, 3));
    expect(result.unallocatedCount).toBe(1);
  });

  it('balances uneven student-to-faculty ratios', () => {
    const state = createState(4, 11, 5);
    const result = allocateStudents(state);
    expect(result.unallocatedCount).toBe(0);
    expect(getSummary(state.faculty, result.students).difference).toBeLessThanOrEqual(1);
  });

  it('respects different capacities', () => {
    const state = createState(3, 8, 3);
    state.faculty[0].maxCapacity = 1;
    state.faculty[1].maxCapacity = 3;
    state.faculty[2].maxCapacity = 5;
    const result = allocateStudents(state);
    expect(result.unallocatedCount).toBe(0);
    expect(result.students.filter((student) => student.mentorId === 'F1')).toHaveLength(1);
  });

  it('excludes unavailable faculty', () => {
    const state = createState(3, 6, 3);
    state.faculty[1].availability = 'Unavailable';
    const result = allocateStudents(state);
    expect(result.students.every((student) => student.mentorId !== 'F2')).toBe(true);
  });

  it('retains and locks existing allocations', () => {
    const state = createState(3, 6, 3);
    state.rules.retainExisting = true;
    state.rules.lockExisting = true;
    state.students[0].existingMentor = 'F3';
    const result = allocateStudents(state);
    expect(result.students[0].mentorId).toBe('F3');
    expect(result.students[0].locked).toBe(true);

    const regenerated = allocateStudents({ ...state, students: result.students }, true);
    expect(regenerated.students[0].mentorId).toBe('F3');
  });

  it('detects duplicate registration numbers', () => {
    const state = createState(2, 3, 3);
    state.students[1].regNo = state.students[0].regNo;
    expect(validateState(state).errors.some((error) => error.includes('Duplicate student'))).toBe(true);
  });

  it('rejects zero and negative inputs', () => {
    const state = createState(2, 3, 3);
    state.faculty[0].maxCapacity = 0;
    state.faculty[1].currentMentees = -1;
    const validation = validateState(state);
    expect(validation.errors.some((error) => error.includes('maximum capacity'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('cannot be negative'))).toBe(true);
  });

  it('handles large datasets', () => {
    const state = createState(50, 2000, 45);
    const result = allocateStudents(state);
    expect(result.unallocatedCount).toBe(0);
    expect(getSummary(state.faculty, result.students).difference).toBeLessThanOrEqual(1);
  });

  it('allocates the supplied 103-student sample', () => {
    const state = createSampleState();
    const result = allocateStudents(state);
    expect(result.students).toHaveLength(103);
    expect(result.unallocatedCount).toBe(0);
    expect(getSummary(state.faculty, result.students).difference).toBeLessThanOrEqual(1);
  });
});
