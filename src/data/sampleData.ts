import type { AppState, Faculty, Student } from '../types';
import { createId, today } from '../lib/helpers';

const facultyNames = [
  'Dr. Aditi Mehra',
  'Dr. Bharat Nair',
  'Dr. Charu Iyer',
  'Dr. Dev Malhotra',
  'Dr. Esha Kulkarni',
  'Dr. Farhan Khan',
  'Dr. Gauri Menon',
  'Dr. Harish Rao'
];

const firstNames = [
  'Aarav', 'Aditi', 'Advait', 'Aisha', 'Akash', 'Amrita', 'Ananya', 'Aniket', 'Arjun', 'Aryan',
  'Avni', 'Bhavya', 'Charvi', 'Darsh', 'Devika', 'Dhruv', 'Diya', 'Eshan', 'Fatima', 'Gaurav',
  'Harsh', 'Ira', 'Ishaan', 'Janhavi', 'Kabir', 'Kavya', 'Krish', 'Laksh', 'Mahika', 'Manav',
  'Meera', 'Mihir', 'Myra', 'Naina', 'Naksh', 'Navya', 'Neel', 'Niharika', 'Om', 'Pari',
  'Pranav', 'Radhika', 'Rahul', 'Rhea', 'Rishi', 'Riya', 'Rohan', 'Saanvi', 'Saksham', 'Samaira',
  'Samar', 'Sanya', 'Shaurya', 'Shivani', 'Shreya', 'Siddharth', 'Siya', 'Tanvi', 'Tara', 'Trisha',
  'Utkarsh', 'Vaanya', 'Ved', 'Vihaan', 'Yash', 'Zara'
];

const lastNames = [
  'Agarwal', 'Bansal', 'Chauhan', 'Desai', 'Gupta', 'Iyer', 'Jain', 'Kapoor', 'Kulkarni',
  'Mehta', 'Menon', 'Nair', 'Patel', 'Rao', 'Shah', 'Sharma', 'Singh', 'Verma'
];

export const defaultState: AppState = {
  faculty: [],
  students: [],
  rules: {
    targetPerFaculty: 0,
    defaultCapacity: 15,
    maxDifference: 1,
    groupMode: 'section',
    equalAllocation: true,
    classTeacherPreference: true,
    retainExisting: true,
    avoidMultiSection: false,
    randomize: false,
    allowUnequal: true,
    lowestWorkload: true,
    lockExisting: true
  },
  meta: {
    department: 'Department of Commerce',
    programme: 'B.Com Financial Analytics',
    academicYear: '2026–27',
    semester: 'III',
    allocationDate: today(),
    preparedBy: 'Faculty Mentoring Coordinator'
  }
};

export function createSampleState(): AppState {
  const faculty: Faculty[] = facultyNames.map((name, index) => ({
    id: `FAC${String(index + 1).padStart(2, '0')}`,
    name,
    department: 'Commerce',
    designation: index < 3 ? 'Associate Professor' : 'Assistant Professor',
    programme: 'B.Com Financial Analytics',
    maxCapacity: index === 7 ? 12 : index === 6 ? 14 : 15,
    currentMentees: 0,
    availability: index === 7 ? 'Unavailable' : 'Available',
    preferred: index < 3 ? `Section ${String.fromCharCode(65 + index)}` : 'B.Com Financial Analytics',
    classTeacher: index < 3
  }));

  const students: Student[] = Array.from({ length: 103 }, (_, index) => {
    const section = index < 35 ? 'A' : index < 69 ? 'B' : 'C';
    return {
      id: createId(),
      regNo: `BCOMFA26${String(index + 1).padStart(3, '0')}`,
      name: `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]}`,
      programme: 'B.Com Financial Analytics',
      batch: '2026–29',
      year: 'I',
      semester: 'III',
      section,
      specialization: 'Financial Analytics',
      gender: '',
      existingMentor: index < 5 ? faculty[index].id : '',
      specialRequirement: index === 17 ? 'Requires additional academic transition support' : '',
      mentorId: undefined,
      locked: false
    };
  });

  return {
    ...defaultState,
    faculty,
    students,
    rules: { ...defaultState.rules },
    meta: { ...defaultState.meta, allocationDate: today() }
  };
}
