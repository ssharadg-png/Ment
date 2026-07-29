import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import type { AppState, Faculty, Student, Summary } from '../types';
import { assignedStudents, downloadBlob, facultyStatus, totalLoad } from './helpers';

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function facultyRows(state: AppState): Record<string, unknown>[] {
  return state.faculty.flatMap((faculty) => {
    const assigned = assignedStudents(state.students, faculty.id);
    if (assigned.length === 0) {
      return [{
        'Faculty ID': faculty.id,
        'Faculty Name': faculty.name,
        'Student Registration Number': '',
        'Student Name': '',
        Programme: faculty.programme,
        Batch: '',
        Section: '',
        Locked: '',
        'Total Workload': totalLoad(faculty, state.students),
        Capacity: faculty.maxCapacity,
        Status: facultyStatus(faculty, state.students).label
      }];
    }
    return assigned.map((student) => ({
      'Faculty ID': faculty.id,
      'Faculty Name': faculty.name,
      'Student Registration Number': student.regNo,
      'Student Name': student.name,
      Programme: student.programme,
      Batch: student.batch,
      Section: student.section,
      Locked: student.locked ? 'Yes' : 'No',
      'Total Workload': totalLoad(faculty, state.students),
      Capacity: faculty.maxCapacity,
      Status: facultyStatus(faculty, state.students).label
    }));
  });
}

export function studentRows(state: AppState): Record<string, unknown>[] {
  const facultyMap = new Map(state.faculty.map((faculty) => [faculty.id, faculty]));
  return state.students.map((student) => {
    const mentor = student.mentorId ? facultyMap.get(student.mentorId) : undefined;
    return {
      'Registration Number': student.regNo,
      'Student Name': student.name,
      Programme: student.programme,
      Batch: student.batch,
      Year: student.year,
      Semester: student.semester,
      Section: student.section,
      Specialization: student.specialization,
      'Faculty ID': mentor?.id ?? '',
      'Faculty Mentor': mentor?.name ?? 'Unallocated',
      Locked: student.locked ? 'Yes' : 'No',
      'Special Mentoring Requirement': student.specialRequirement ?? ''
    };
  });
}

export function downloadCsv(state: AppState) {
  const rows = studentRows(state);
  const headers = Object.keys(rows[0] ?? { Message: '' });
  const content = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\n');
  downloadBlob(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }), 'Student-wise_Mentor_Allocation.csv');
}

export function downloadExcel(state: AppState, summary: Summary) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(facultyRows(state)), 'Faculty-wise Allocation');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentRows(state)), 'Student-wise Allocation');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(studentRows(state).filter((row) => row['Faculty Mentor'] === 'Unallocated')),
    'Unallocated Students'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { Metric: 'Department', Value: state.meta.department },
      { Metric: 'Programme', Value: state.meta.programme },
      { Metric: 'Academic Year', Value: state.meta.academicYear },
      { Metric: 'Semester', Value: state.meta.semester },
      { Metric: 'Allocation Date', Value: state.meta.allocationDate },
      { Metric: 'Prepared By', Value: state.meta.preparedBy },
      { Metric: 'Total Students', Value: summary.totalStudents },
      { Metric: 'Total Faculty', Value: summary.totalFaculty },
      { Metric: 'Allocated Students', Value: summary.allocated },
      { Metric: 'Unallocated Students', Value: summary.unallocated },
      { Metric: 'Average Workload', Value: summary.average.toFixed(2) },
      { Metric: 'Workload Difference', Value: summary.difference }
    ]),
    'Allocation Summary'
  );
  XLSX.writeFile(workbook, 'Faculty_Mentor_Allocation_Report.xlsx');
}

function addWrappedLine(pdf: jsPDF, text: string, y: number, options?: { bold?: boolean; size?: number }) {
  pdf.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  pdf.setFontSize(options?.size ?? 10);
  const lines = pdf.splitTextToSize(text, 180) as string[];
  lines.forEach((line) => {
    if (y > 282) {
      pdf.addPage();
      y = 18;
    }
    pdf.text(line, 15, y);
    y += 5;
  });
  return y;
}

export function downloadPdf(state: AppState, summary: Summary) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  y = addWrappedLine(pdf, 'Faculty–Student Mentor Allocation Report', y, { bold: true, size: 16 });
  y += 2;
  y = addWrappedLine(pdf, `Department: ${state.meta.department}`, y);
  y = addWrappedLine(pdf, `Programme: ${state.meta.programme}`, y);
  y = addWrappedLine(pdf, `Academic Year: ${state.meta.academicYear} | Semester: ${state.meta.semester}`, y);
  y = addWrappedLine(pdf, `Allocation Date: ${state.meta.allocationDate} | Prepared By: ${state.meta.preparedBy}`, y);
  y += 3;
  y = addWrappedLine(
    pdf,
    `Total Students: ${summary.totalStudents} | Total Mentors: ${summary.totalFaculty} | Allocated: ${summary.allocated} | Unallocated: ${summary.unallocated}`,
    y,
    { bold: true }
  );
  y = addWrappedLine(
    pdf,
    `Average Workload: ${summary.average.toFixed(1)} | Highest: ${summary.highest} | Lowest: ${summary.lowest} | Difference: ${summary.difference}`,
    y
  );
  y += 5;

  state.faculty.forEach((faculty) => {
    y = addWrappedLine(
      pdf,
      `${faculty.name} (${faculty.id}) — ${totalLoad(faculty, state.students)}/${faculty.maxCapacity} — ${facultyStatus(faculty, state.students).label}`,
      y,
      { bold: true, size: 11 }
    );
    const students = assignedStudents(state.students, faculty.id);
    if (students.length === 0) y = addWrappedLine(pdf, 'No students allocated.', y);
    students.forEach((student) => {
      y = addWrappedLine(
        pdf,
        `• ${student.regNo} | ${student.name} | ${student.programme} | Batch ${student.batch} | Section ${student.section}${student.locked ? ' | Locked' : ''}`,
        y
      );
    });
    y += 2;
  });

  const unallocated = state.students.filter((student) => !student.mentorId);
  if (unallocated.length > 0) {
    y = addWrappedLine(pdf, 'Unallocated Students', y, { bold: true, size: 12 });
    unallocated.forEach((student) => {
      y = addWrappedLine(pdf, `• ${student.regNo} | ${student.name} | ${student.programme} | Section ${student.section}`, y);
    });
  }
  pdf.save('Faculty_Mentor_Allocation_Report.pdf');
}

export function printReport(state: AppState, mode: 'faculty' | 'student') {
  const rows = mode === 'faculty' ? facultyRows(state) : studentRows(state);
  const headers = Object.keys(rows[0] ?? { Message: 'No records' });
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('The browser blocked the print window. Please allow pop-ups and try again.');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Faculty–Student Mentor Allocation Report</title><style>body{font:12px Arial;margin:24px;color:#172033}h1{font-size:22px}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bcc3cf;padding:7px;text-align:left;vertical-align:top}th{background:#edf2f7}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print report</button><h1>Faculty–Student Mentor Allocation Report</h1><p><b>Department:</b> ${state.meta.department}<br><b>Programme:</b> ${state.meta.programme}<br><b>Academic year:</b> ${state.meta.academicYear} &nbsp; <b>Semester:</b> ${state.meta.semester}<br><b>Date:</b> ${state.meta.allocationDate} &nbsp; <b>Prepared by:</b> ${state.meta.preparedBy}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${String(row[header] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
}
