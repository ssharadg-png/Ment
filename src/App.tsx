import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { AllocationRules, AppState, Faculty, GroupMode, Student } from './types';
import { allocateStudents, getSummary, validateState } from './lib/allocation';
import {
  assignedStudents,
  createId,
  deepClone,
  facultyStatus,
  remainingCapacity,
  safeNumber,
  today,
  totalLoad
} from './lib/helpers';
import { createSampleState, defaultState } from './data/sampleData';
import { importFacultyFile, importStudentFile } from './lib/files';
import { downloadCsv, downloadExcel, downloadPdf, printReport } from './lib/export';

const STORAGE_KEY = 'facultyMentorAllocationSystemReact_v2';

type View = 'overview' | 'faculty' | 'students' | 'rules' | 'allocation' | 'reports';
type Notice = { type: 'success' | 'error' | 'info' | 'warning'; text: string } | null;

const navItems: { id: View; label: string; icon: string; description: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⌂', description: 'Readiness and workload summary' },
  { id: 'faculty', label: 'Faculty', icon: 'F', description: 'Mentor records and capacity' },
  { id: 'students', label: 'Students', icon: 'S', description: 'Student records and requirements' },
  { id: 'rules', label: 'Allocation Rules', icon: 'R', description: 'Balancing and preference settings' },
  { id: 'allocation', label: 'Allocation Workspace', icon: 'A', description: 'Generate and manually adjust' },
  { id: 'reports', label: 'Reports', icon: '⇩', description: 'Export and print final lists' }
];

const toneClasses = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200'
};

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(defaultState);
    const parsed = JSON.parse(raw) as AppState;
    return {
      faculty: parsed.faculty ?? [],
      students: (parsed.students ?? []).map((student) => ({ ...student, id: student.id || createId() })),
      rules: { ...defaultState.rules, ...(parsed.rules ?? {}) },
      meta: { ...defaultState.meta, ...(parsed.meta ?? {}), allocationDate: parsed.meta?.allocationDate || today() }
    };
  } catch {
    return deepClone(defaultState);
  }
}

function App() {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [view, setView] = useState<View>('overview');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [history, setHistory] = useState<AppState[]>([]);
  const [facultyModal, setFacultyModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [studentModal, setStudentModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [targetFaculty, setTargetFaculty] = useState('');
  const [allocationWarnings, setAllocationWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [programmeFilter, setProgrammeFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const summary = useMemo(() => getSummary(state.faculty, state.students), [state.faculty, state.students]);
  const validation = useMemo(() => validateState(state), [state]);
  const chartData = useMemo(
    () => state.faculty
      .filter((faculty) => faculty.availability === 'Available')
      .map((faculty) => ({
        name: faculty.name.replace(/^Dr\.\s*/, '').split(' ')[0],
        workload: totalLoad(faculty, state.students),
        capacity: faculty.maxCapacity
      })),
    [state.faculty, state.students]
  );

  const setupScore = useMemo(() => {
    const checks = [
      state.faculty.length > 0,
      state.students.length > 0,
      state.faculty.every((faculty) => faculty.maxCapacity > 0),
      state.meta.department.trim().length > 0,
      state.meta.programme.trim().length > 0,
      validation.errors.length === 0
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [state, validation.errors.length]);

  const pushHistory = () => {
    setHistory((previous) => [...previous.slice(-19), deepClone(state)]);
  };

  const mutate = (updater: (draft: AppState) => void) => {
    pushHistory();
    setState((previous) => {
      const draft = deepClone(previous);
      updater(draft);
      return draft;
    });
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) {
      setNotice({ type: 'info', text: 'There is no previous change to undo.' });
      return;
    }
    setState(deepClone(previous));
    setHistory((items) => items.slice(0, -1));
    setSelectedStudents([]);
    setNotice({ type: 'success', text: 'The most recent change was undone.' });
  };

  const generateAllocation = async (onlyUnlocked = false) => {
    setBusy(true);
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    try {
      const result = allocateStudents(state, onlyUnlocked);
      pushHistory();
      setState((previous) => ({ ...previous, students: result.students }));
      setAllocationWarnings(result.warnings);
      setSelectedStudents([]);
      setView('allocation');
      setNotice({
        type: result.unallocatedCount ? 'warning' : 'success',
        text: result.unallocatedCount
          ? `${result.unallocatedCount} student(s) remain unallocated. Review the capacity and warning panel.`
          : `All ${state.students.length} students have been successfully allocated.`
      });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Allocation could not be completed.' });
    } finally {
      setBusy(false);
    }
  };

  const loadSample = async () => {
    setBusy(true);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    try {
      const sample = createSampleState();
      const result = allocateStudents(sample);
      pushHistory();
      setState({ ...sample, students: result.students });
      setAllocationWarnings(result.warnings);
      setView('allocation');
      setNotice({ type: 'success', text: 'Sample data loaded and allocated. Expand a mentor card or drag a student to another mentor.' });
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    if (!window.confirm('Clear all faculty, student, allocation, and locally saved browser data?')) return;
    pushHistory();
    setState(deepClone(defaultState));
    setSelectedStudents([]);
    setAllocationWarnings([]);
    localStorage.removeItem(STORAGE_KEY);
    setNotice({ type: 'info', text: 'All data has been cleared.' });
  };

  const resetAllocation = () => {
    if (!window.confirm('Remove all mentor assignments while keeping faculty and student data?')) return;
    mutate((draft) => {
      draft.students.forEach((student) => {
        student.mentorId = undefined;
        student.locked = false;
      });
    });
    setSelectedStudents([]);
    setAllocationWarnings([]);
    setNotice({ type: 'info', text: 'The allocation has been reset.' });
  };

  const capacityAvailableForMove = (facultyId: string, movingIds: string[]) => {
    const faculty = state.faculty.find((member) => member.id === facultyId);
    if (!faculty || faculty.availability !== 'Available') return 0;
    const alreadyAssignedMoving = state.students.filter(
      (student) => movingIds.includes(student.id) && student.mentorId === facultyId
    ).length;
    return remainingCapacity(faculty, state.students) + alreadyAssignedMoving;
  };

  const moveStudents = (studentIds: string[], facultyId: string) => {
    if (!facultyId) {
      setNotice({ type: 'error', text: 'Select a destination faculty mentor.' });
      return;
    }
    const faculty = state.faculty.find((member) => member.id === facultyId);
    if (!faculty || faculty.availability !== 'Available') {
      setNotice({ type: 'error', text: 'The selected faculty member is unavailable.' });
      return;
    }
    const moving = state.students.filter((student) => studentIds.includes(student.id) && student.mentorId !== facultyId);
    if (moving.length > capacityAvailableForMove(facultyId, studentIds)) {
      setNotice({ type: 'error', text: `${faculty.name} has insufficient remaining capacity for this reassignment.` });
      return;
    }
    mutate((draft) => {
      draft.students.forEach((student) => {
        if (studentIds.includes(student.id)) student.mentorId = facultyId;
      });
    });
    setSelectedStudents([]);
    setNotice({ type: 'success', text: `${moving.length || studentIds.length} student(s) moved to ${faculty.name}.` });
  };

  const swapSelected = () => {
    if (selectedStudents.length !== 2) {
      setNotice({ type: 'error', text: 'Select exactly two students to swap.' });
      return;
    }
    const [first, second] = state.students.filter((student) => selectedStudents.includes(student.id));
    if (!first || !second || !first.mentorId || !second.mentorId) {
      setNotice({ type: 'error', text: 'Both selected students must already have faculty mentors.' });
      return;
    }
    if (first.mentorId === second.mentorId) {
      setNotice({ type: 'info', text: 'Both students already have the same mentor.' });
      return;
    }
    mutate((draft) => {
      const draftFirst = draft.students.find((student) => student.id === first.id)!;
      const draftSecond = draft.students.find((student) => student.id === second.id)!;
      [draftFirst.mentorId, draftSecond.mentorId] = [draftSecond.mentorId, draftFirst.mentorId];
    });
    setSelectedStudents([]);
    setNotice({ type: 'success', text: 'The selected students were swapped between mentors.' });
  };

  const toggleSelectedLocks = () => {
    if (selectedStudents.length === 0) {
      setNotice({ type: 'error', text: 'Select at least one student to lock or unlock.' });
      return;
    }
    const shouldLock = state.students.some((student) => selectedStudents.includes(student.id) && !student.locked);
    mutate((draft) => {
      draft.students.forEach((student) => {
        if (selectedStudents.includes(student.id)) student.locked = shouldLock;
      });
    });
    setNotice({ type: 'success', text: `${selectedStudents.length} allocation(s) ${shouldLock ? 'locked' : 'unlocked'}.` });
  };

  const programmes = useMemo(
    () => [...new Set(state.students.map((student) => student.programme).filter(Boolean))].sort(),
    [state.students]
  );
  const sections = useMemo(
    () => [...new Set(state.students.map((student) => student.section).filter(Boolean))].sort(),
    [state.students]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {busy && <LoadingOverlay />}
      <div className="flex min-h-screen">
        <aside className={`no-print fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-200 bg-slate-950 text-white transition lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-university-500 text-lg font-bold">FM</div>
                <div>
                  <p className="font-semibold">Mentor Allocation</p>
                  <p className="text-xs text-slate-400">University coordination workspace</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Main navigation">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
                  className={`w-full rounded-2xl px-3 py-3 text-left transition ${view === item.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <span className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${view === item.id ? 'bg-university-100 text-university-700' : 'bg-white/10'}`}>{item.icon}</span>
                    <span>
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={`mt-0.5 block text-xs ${view === item.id ? 'text-slate-500' : 'text-slate-500'}`}>{item.description}</span>
                    </span>
                  </span>
                </button>
              ))}
            </nav>
            <div className="border-t border-white/10 p-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Setup readiness</span><span>{setupScore}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-university-400 transition-all" style={{ width: `${setupScore}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-400">Data is saved automatically in this browser.</p>
              </div>
            </div>
          </div>
        </aside>

        {mobileMenuOpen && <button type="button" aria-label="Close navigation" className="no-print fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

        <main className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" className="btn-secondary px-3 lg:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation">☰</button>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">Faculty Mentor Allocation System</h1>
                  <p className="hidden text-sm text-slate-500 sm:block">Balanced, capacity-aware student mentoring allocation</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={undo} disabled={history.length === 0}>↶ Undo</button>
                <button type="button" className="btn-secondary" onClick={loadSample}>Try Sample</button>
                <button type="button" className="btn-primary" onClick={() => generateAllocation(false)}>Generate</button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
            {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

            {view === 'overview' && (
              <Overview
                state={state}
                summary={summary}
                setupScore={setupScore}
                validation={validation}
                chartData={chartData}
                onNavigate={setView}
                onSample={loadSample}
                onGenerate={() => generateAllocation(false)}
              />
            )}

            {view === 'faculty' && (
              <FacultySection
                faculty={state.faculty}
                students={state.students}
                defaultCapacity={state.rules.defaultCapacity}
                onAdd={() => setFacultyModal({ open: true, index: null })}
                onEdit={(index) => setFacultyModal({ open: true, index })}
                onDelete={(index) => {
                  const member = state.faculty[index];
                  if (!window.confirm(`Delete ${member.name}? Assigned students will become unallocated.`)) return;
                  mutate((draft) => {
                    const removed = draft.faculty.splice(index, 1)[0];
                    draft.students.forEach((student) => {
                      if (student.mentorId === removed.id) {
                        student.mentorId = undefined;
                        student.locked = false;
                      }
                    });
                  });
                }}
                onImport={async (file) => {
                  try {
                    const imported = await importFacultyFile(file, state.rules.defaultCapacity);
                    mutate((draft) => { draft.faculty = imported; });
                    setNotice({ type: 'success', text: `${imported.length} faculty record(s) imported.` });
                  } catch (error) {
                    setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Faculty file could not be imported.' });
                  }
                }}
              />
            )}

            {view === 'students' && (
              <StudentSection
                students={state.students}
                faculty={state.faculty}
                onAdd={() => setStudentModal({ open: true, index: null })}
                onEdit={(index) => setStudentModal({ open: true, index })}
                onDelete={(index) => {
                  const student = state.students[index];
                  if (!window.confirm(`Delete ${student.name}?`)) return;
                  mutate((draft) => { draft.students.splice(index, 1); });
                }}
                onImport={async (file) => {
                  try {
                    const imported = await importStudentFile(file);
                    mutate((draft) => { draft.students = imported; });
                    setNotice({ type: 'success', text: `${imported.length} student record(s) imported.` });
                  } catch (error) {
                    setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Student file could not be imported.' });
                  }
                }}
              />
            )}

            {view === 'rules' && (
              <RulesSection
                rules={state.rules}
                onChange={(rules) => setState((previous) => ({ ...previous, rules }))}
                onGenerate={() => generateAllocation(false)}
              />
            )}

            {view === 'allocation' && (
              <AllocationWorkspace
                state={state}
                summary={summary}
                warnings={allocationWarnings}
                selectedStudents={selectedStudents}
                setSelectedStudents={setSelectedStudents}
                targetFaculty={targetFaculty}
                setTargetFaculty={setTargetFaculty}
                search={search}
                setSearch={setSearch}
                programmeFilter={programmeFilter}
                setProgrammeFilter={setProgrammeFilter}
                sectionFilter={sectionFilter}
                setSectionFilter={setSectionFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                programmes={programmes}
                sections={sections}
                onMove={() => moveStudents(selectedStudents, targetFaculty)}
                onSwap={swapSelected}
                onToggleLock={toggleSelectedLocks}
                onClearSelection={() => setSelectedStudents([])}
                onDragMove={(studentId, facultyId) => moveStudents([studentId], facultyId)}
                onGenerate={() => generateAllocation(false)}
                onRegenerate={() => generateAllocation(true)}
                onUndo={undo}
                onReset={resetAllocation}
                historyAvailable={history.length > 0}
              />
            )}

            {view === 'reports' && (
              <ReportsSection
                state={state}
                summary={summary}
                onMetaChange={(meta) => setState((previous) => ({ ...previous, meta }))}
                onExcel={() => downloadExcel(state, summary)}
                onCsv={() => downloadCsv(state)}
                onPdf={() => downloadPdf(state, summary)}
                onPrintFaculty={() => {
                  try { printReport(state, 'faculty'); } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Print report could not be opened.' }); }
                }}
                onPrintStudent={() => {
                  try { printReport(state, 'student'); } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Print report could not be opened.' }); }
                }}
                onClearAll={clearAll}
              />
            )}
          </div>
        </main>
      </div>

      {facultyModal.open && (
        <FacultyModal
          initial={facultyModal.index === null ? undefined : state.faculty[facultyModal.index]}
          defaultCapacity={state.rules.defaultCapacity}
          onClose={() => setFacultyModal({ open: false, index: null })}
          onSave={(faculty) => {
            mutate((draft) => {
              if (facultyModal.index === null) draft.faculty.push(faculty);
              else {
                const previousId = draft.faculty[facultyModal.index].id;
                draft.faculty[facultyModal.index] = faculty;
                if (previousId !== faculty.id) {
                  draft.students.forEach((student) => {
                    if (student.mentorId === previousId) student.mentorId = faculty.id;
                  });
                }
              }
            });
            setFacultyModal({ open: false, index: null });
          }}
        />
      )}

      {studentModal.open && (
        <StudentModal
          initial={studentModal.index === null ? undefined : state.students[studentModal.index]}
          faculty={state.faculty}
          onClose={() => setStudentModal({ open: false, index: null })}
          onSave={(student) => {
            mutate((draft) => {
              if (studentModal.index === null) draft.students.push(student);
              else draft.students[studentModal.index] = student;
            });
            setStudentModal({ open: false, index: null });
          }}
        />
      )}
    </div>
  );
}

function NoticeBar({ notice, onClose }: { notice: Exclude<Notice, null>; onClose: () => void }) {
  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800'
  };
  return (
    <div className={`mb-5 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${styles[notice.type]}`} role="status" aria-live="polite">
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} className="font-bold" aria-label="Dismiss message">×</button>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="rounded-2xl bg-white px-7 py-6 text-center shadow-2xl">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-university-100 border-t-university-600" />
        <p className="mt-3 font-semibold">Processing allocation…</p>
        <p className="mt-1 text-sm text-slate-500">Validating records, capacity, and workload balance.</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'default' }: { label: string; value: string | number; detail?: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const accent = {
    default: 'bg-university-100 text-university-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700'
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 h-2 w-10 rounded-full ${accent[tone]}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function Overview({ state, summary, setupScore, validation, chartData, onNavigate, onSample, onGenerate }: {
  state: AppState;
  summary: ReturnType<typeof getSummary>;
  setupScore: number;
  validation: ReturnType<typeof validateState>;
  chartData: { name: string; workload: number; capacity: number }[];
  onNavigate: (view: View) => void;
  onSample: () => void;
  onGenerate: () => void;
}) {
  const steps = [
    { title: 'Add faculty mentors', done: state.faculty.length > 0, detail: `${state.faculty.length} record(s)`, action: () => onNavigate('faculty') },
    { title: 'Add students', done: state.students.length > 0, detail: `${state.students.length} record(s)`, action: () => onNavigate('students') },
    { title: 'Review allocation rules', done: true, detail: `Grouped by ${state.rules.groupMode}`, action: () => onNavigate('rules') },
    { title: 'Generate and review', done: summary.allocated > 0, detail: `${summary.allocated} allocated`, action: () => onNavigate('allocation') }
  ];
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr] lg:items-center">
          <div>
            <span className="chip bg-white/10 text-white">Interactive allocation workspace</span>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Allocate every student fairly, without exceeding faculty capacity.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Upload faculty and student records, configure balancing rules, generate allocations, then drag, lock, swap, and export the final mentor lists.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={onGenerate}>Generate Allocation</button>
              <button type="button" className="btn border border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={onSample}>Try 103-student sample</button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-end justify-between">
              <div><p className="text-sm text-slate-400">Setup readiness</p><p className="mt-1 text-4xl font-semibold">{setupScore}%</p></div>
              <span className={`chip ${validation.errors.length ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'}`}>{validation.errors.length ? `${validation.errors.length} issue(s)` : 'Ready'}</span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-university-400" style={{ width: `${setupScore}%` }} /></div>
            <p className="mt-4 text-sm text-slate-400">The system validates IDs, capacities, availability, duplicates, and unallocated students before reporting.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total students" value={summary.totalStudents} detail={`${summary.allocated} currently allocated`} />
        <MetricCard label="Available mentors" value={summary.availableFaculty} detail={`${summary.totalFaculty} faculty records`} />
        <MetricCard label="Unallocated" value={summary.unallocated} tone={summary.unallocated ? 'warning' : 'success'} detail="Students needing a mentor" />
        <MetricCard label="Average workload" value={summary.average.toFixed(1)} detail="Includes current mentees" />
        <MetricCard label="Workload difference" value={summary.difference} tone={summary.difference > state.rules.maxDifference ? 'warning' : 'success'} detail={`Permitted: ${state.rules.maxDifference}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <div className="panel p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Guided setup</h3><p className="mt-1 text-sm text-slate-500">Complete these steps in sequence.</p></div><span className="chip bg-university-50 text-university-700">4 steps</span></div>
          <div className="mt-5 space-y-3">
            {steps.map((step, index) => (
              <button key={step.title} type="button" onClick={step.action} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-university-300 hover:bg-university-50/40">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{step.done ? '✓' : index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{step.title}</span><span className="mt-1 block text-sm text-slate-500">{step.detail}</span></span>
                <span className="text-slate-400">→</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Faculty workload</h3><p className="mt-1 text-sm text-slate-500">Assigned students plus each faculty member’s existing workload.</p></div><span className="chip bg-slate-100 text-slate-600">Capacity-aware</span></div>
          <div className="mt-5 h-72">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="capacity" fill="#dbeafe" radius={[7, 7, 0, 0]} />
                  <Bar dataKey="workload" fill="#356df5" radius={[7, 7, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No workload data" text="Add faculty and generate an allocation to display the chart." />}
          </div>
        </div>
      </section>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <section className="panel p-5">
          <h3 className="font-semibold">Data readiness review</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <IssueList title="Blocking issues" items={validation.errors} tone="danger" empty="No blocking issues found." />
            <IssueList title="Warnings" items={validation.warnings} tone="warning" empty="No warnings found." />
          </div>
        </section>
      )}
    </div>
  );
}

function IssueList({ title, items, tone, empty }: { title: string; items: string[]; tone: 'danger' | 'warning'; empty: string }) {
  const styles = tone === 'danger' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="font-semibold">{title}</p>
      {items.length ? <ul className="mt-2 space-y-1 text-sm">{items.slice(0, 6).map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-sm">{empty}</p>}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">＋</div><p className="mt-3 font-medium">{title}</p><p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p></div>;
}

function UploadZone({ title, description, accept, onFile, templateHref }: { title: string; description: string; accept: string; onFile: (file: File) => void; templateHref: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-5 text-center transition ${dragOver ? 'drag-over' : 'border-slate-300 bg-slate-50'}`}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ''; }} />
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-university-100 text-university-700">⇧</div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>Choose file</button>
        <a className="btn-secondary" href={templateHref} download>Download template</a>
      </div>
    </div>
  );
}

function FacultySection({ faculty, students, defaultCapacity, onAdd, onEdit, onDelete, onImport }: {
  faculty: Faculty[]; students: Student[]; defaultCapacity: number; onAdd: () => void; onEdit: (index: number) => void; onDelete: (index: number) => void; onImport: (file: File) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = faculty.filter((member) => `${member.id} ${member.name} ${member.department} ${member.programme}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-6">
      <SectionHeading title="Faculty information" subtitle="Maintain mentor availability, current workload, programme preference, and maximum capacity." actions={<button type="button" className="btn-primary" onClick={onAdd}>＋ Add Faculty</button>} />
      <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <div className="space-y-4">
          <UploadZone title="Upload faculty records" description="Drag a CSV, XLSX, or XLS file here." accept=".csv,.xlsx,.xls" onFile={onImport} templateHref="./sample-data/faculty-upload-template.csv" />
          <div className="panel p-5">
            <h3 className="font-semibold">Capacity guidance</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">The default capacity is currently <strong>{defaultCapacity}</strong>. Individual faculty capacity always takes priority. Existing mentees are counted before new students are assigned.</p>
          </div>
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-header"><div><h3 className="font-semibold">Faculty directory</h3><p className="mt-1 text-sm text-slate-500">{faculty.length} faculty record(s)</p></div><input className="input max-w-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search faculty…" aria-label="Search faculty" /></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Faculty</th><th className="px-4 py-3">Programme</th><th className="px-4 py-3">Workload</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((member) => {
                  const originalIndex = faculty.findIndex((item) => item.id === member.id);
                  const status = facultyStatus(member, students);
                  const load = totalLoad(member, students);
                  return <tr key={member.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-medium">{member.name}</div><div className="mt-1 text-xs text-slate-500">{member.id} · {member.designation}</div></td><td className="px-4 py-4"><div>{member.programme || 'Not specified'}</div><div className="mt-1 text-xs text-slate-500">{member.preferred || 'No preference'}</div></td><td className="px-4 py-4"><div className="font-medium">{load}/{member.maxCapacity}</div><div className="mt-2 h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-university-500" style={{ width: `${Math.min(100, member.maxCapacity ? (load / member.maxCapacity) * 100 : 0)}%` }} /></div></td><td className="px-4 py-4"><span className={`chip border ${toneClasses[status.tone]}`}>{status.label}</span></td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><button type="button" className="btn-secondary px-3 py-2" onClick={() => onEdit(originalIndex)}>Edit</button><button type="button" className="btn-danger px-3 py-2" onClick={() => onDelete(originalIndex)}>Delete</button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="p-5"><EmptyState title="No faculty found" text="Add faculty manually or upload the faculty template." /></div>}
        </div>
      </div>
    </div>
  );
}

function StudentSection({ students, faculty, onAdd, onEdit, onDelete, onImport }: {
  students: Student[]; faculty: Faculty[]; onAdd: () => void; onEdit: (index: number) => void; onDelete: (index: number) => void; onImport: (file: File) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = students.filter((student) => `${student.regNo} ${student.name} ${student.programme} ${student.section}`.toLowerCase().includes(query.toLowerCase()));
  const facultyMap = new Map(faculty.map((member) => [member.id, member.name]));
  const visible = filtered.slice(0, 300);
  return (
    <div className="space-y-6">
      <SectionHeading title="Student information" subtitle="Upload or maintain student details, existing mentors, and special mentoring requirements." actions={<button type="button" className="btn-primary" onClick={onAdd}>＋ Add Student</button>} />
      <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <div className="space-y-4">
          <UploadZone title="Upload student records" description="Drag a CSV, XLSX, or XLS file here." accept=".csv,.xlsx,.xls" onFile={onImport} templateHref="./sample-data/student-upload-template.csv" />
          <div className="panel p-5"><h3 className="font-semibold">Import safeguard</h3><p className="mt-2 text-sm leading-6 text-slate-500">Uploaded data replaces the current student list. Duplicate registration numbers and blank names are blocked during allocation.</p></div>
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-header"><div><h3 className="font-semibold">Student register</h3><p className="mt-1 text-sm text-slate-500">{students.length} student record(s)</p></div><input className="input max-w-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, ID, section…" aria-label="Search students" /></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-4 py-3">Programme</th><th className="px-4 py-3">Batch / Section</th><th className="px-4 py-3">Mentor</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((student) => {
                  const originalIndex = students.findIndex((item) => item.id === student.id);
                  return <tr key={student.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-medium">{student.name}</div><div className="mt-1 text-xs text-slate-500">{student.regNo}{student.locked ? ' · Locked' : ''}</div></td><td className="px-4 py-4"><div>{student.programme || 'Not specified'}</div><div className="mt-1 text-xs text-slate-500">{student.specialization}</div></td><td className="px-4 py-4">{student.batch || '—'} / {student.section || '—'}</td><td className="px-4 py-4"><span className={`chip ${student.mentorId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{student.mentorId ? facultyMap.get(student.mentorId) ?? student.mentorId : 'Unallocated'}</span></td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><button type="button" className="btn-secondary px-3 py-2" onClick={() => onEdit(originalIndex)}>Edit</button><button type="button" className="btn-danger px-3 py-2" onClick={() => onDelete(originalIndex)}>Delete</button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 300 && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">Showing the first 300 matching records. Refine the search to locate a specific student.</p>}
          {visible.length === 0 && <div className="p-5"><EmptyState title="No students found" text="Add students manually or upload the student template." /></div>}
        </div>
      </div>
    </div>
  );
}

function RulesSection({ rules, onChange, onGenerate }: { rules: AllocationRules; onChange: (rules: AllocationRules) => void; onGenerate: () => void }) {
  const update = <K extends keyof AllocationRules>(key: K, value: AllocationRules[K]) => onChange({ ...rules, [key]: value });
  const switches: { key: keyof AllocationRules; title: string; text: string }[] = [
    { key: 'equalAllocation', title: 'Balance workloads equally', text: 'Assign the next student to the faculty member with the lowest total workload.' },
    { key: 'classTeacherPreference', title: 'Prefer class teachers', text: 'Increase priority when the faculty preference matches the student batch or section.' },
    { key: 'retainExisting', title: 'Retain existing mentors', text: 'Keep valid existing mentor references before allocating remaining students.' },
    { key: 'lockExisting', title: 'Lock retained allocations', text: 'Protect retained allocations when unlocked records are regenerated.' },
    { key: 'avoidMultiSection', title: 'Avoid multiple sections', text: 'Prefer keeping a faculty member within the same section where possible.' },
    { key: 'randomize', title: 'Randomize students within groups', text: 'Shuffle students before allocation rather than processing registration order.' },
    { key: 'allowUnequal', title: 'Allow remainder distribution', text: 'Permit a one-student difference when totals are not perfectly divisible.' },
    { key: 'lowestWorkload', title: 'Assign remainder to lowest workload', text: 'Use current mentees plus new assignments when distributing additional students.' }
  ];
  return (
    <div className="space-y-6">
      <SectionHeading title="Allocation rules" subtitle="Control grouping, capacity, preferences, and permitted workload variation." actions={<button type="button" className="btn-primary" onClick={onGenerate}>Generate with these rules</button>} />
      <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
        <div className="panel p-5">
          <h3 className="font-semibold">Core settings</h3>
          <div className="mt-5 space-y-4">
            <label><span className="field-label">Group students by</span><select className="input" value={rules.groupMode} onChange={(event) => update('groupMode', event.target.value as GroupMode)}><option value="none">No grouping</option><option value="programme">Programme</option><option value="batch">Batch</option><option value="section">Section</option><option value="specialization">Specialization</option></select></label>
            <label><span className="field-label">Default faculty capacity</span><input className="input" type="number" min="1" value={rules.defaultCapacity} onChange={(event) => update('defaultCapacity', safeNumber(event.target.value, 15))} /></label>
            <label><span className="field-label">Target new students per faculty <span className="text-slate-400">(0 = automatic)</span></span><input className="input" type="number" min="0" value={rules.targetPerFaculty} onChange={(event) => update('targetPerFaculty', Math.max(0, safeNumber(event.target.value)))} /></label>
            <label><span className="field-label">Maximum permitted workload difference</span><input className="input" type="number" min="0" value={rules.maxDifference} onChange={(event) => update('maxDifference', Math.max(0, safeNumber(event.target.value, 1)))} /></label>
          </div>
          <div className="mt-5 rounded-2xl bg-university-50 p-4 text-sm text-university-900"><strong>Balancing principle:</strong> total students requiring allocation ÷ available faculty. Remaining students are assigned to mentors with the lowest total workload, subject to capacity and locked records.</div>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Allocation behaviour</h3><p className="mt-1 text-sm text-slate-500">Switch rules on or off according to departmental policy.</p></div><span className="chip bg-university-50 text-university-700">Interactive</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {switches.map((item) => (
              <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${rules[item.key] ? 'border-university-300 bg-university-50/50' : 'border-slate-200 bg-white'}`}>
                <input type="checkbox" checked={Boolean(rules[item.key])} onChange={(event) => update(item.key, event.target.checked as never)} className="mt-1 h-4 w-4 accent-university-600" />
                <span><span className="block font-medium">{item.title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{item.text}</span></span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AllocationWorkspace(props: {
  state: AppState;
  summary: ReturnType<typeof getSummary>;
  warnings: string[];
  selectedStudents: string[];
  setSelectedStudents: (ids: string[]) => void;
  targetFaculty: string;
  setTargetFaculty: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  programmeFilter: string;
  setProgrammeFilter: (value: string) => void;
  sectionFilter: string;
  setSectionFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  programmes: string[];
  sections: string[];
  onMove: () => void;
  onSwap: () => void;
  onToggleLock: () => void;
  onClearSelection: () => void;
  onDragMove: (studentId: string, facultyId: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onUndo: () => void;
  onReset: () => void;
  historyAvailable: boolean;
}) {
  const [openCards, setOpenCards] = useState<string[]>([]);
  const [draggedStudent, setDraggedStudent] = useState<string | null>(null);
  const availableFaculty = props.state.faculty.filter((faculty) => faculty.availability === 'Available');
  const facultyMap = new Map(props.state.faculty.map((faculty) => [faculty.id, faculty]));
  const unallocated = props.state.students.filter((student) => !student.mentorId);

  const matches = (student: Student) => {
    const query = props.search.toLowerCase();
    const faculty = student.mentorId ? facultyMap.get(student.mentorId) : undefined;
    const queryMatch = !query || `${student.regNo} ${student.name} ${student.programme} ${student.section} ${faculty?.name ?? ''}`.toLowerCase().includes(query);
    const programmeMatch = props.programmeFilter === 'all' || student.programme === props.programmeFilter;
    const sectionMatch = props.sectionFilter === 'all' || student.section === props.sectionFilter;
    return queryMatch && programmeMatch && sectionMatch;
  };

  const filteredFaculty = props.state.faculty.filter((faculty) => {
    const status = facultyStatus(faculty, props.state.students).label.toLowerCase();
    if (props.statusFilter === 'all') return true;
    if (props.statusFilter === 'available') return faculty.availability === 'Available' && status !== 'full capacity';
    if (props.statusFilter === 'full') return status === 'full capacity';
    if (props.statusFilter === 'unavailable') return faculty.availability === 'Unavailable';
    return true;
  });

  const toggleSelected = (studentId: string) => {
    props.setSelectedStudents(props.selectedStudents.includes(studentId)
      ? props.selectedStudents.filter((id) => id !== studentId)
      : [...props.selectedStudents, studentId]);
  };

  return (
    <div className="space-y-6">
      <SectionHeading title="Allocation workspace" subtitle="Expand mentor cards, select students, or drag students between mentors. Capacity is checked before every move." actions={<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={props.onRegenerate}>Regenerate unlocked</button><button type="button" className="btn-primary" onClick={props.onGenerate}>Generate allocation</button></div>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Allocated" value={props.summary.allocated} tone="success" />
        <MetricCard label="Unallocated" value={props.summary.unallocated} tone={props.summary.unallocated ? 'warning' : 'success'} />
        <MetricCard label="Average workload" value={props.summary.average.toFixed(1)} />
        <MetricCard label="Highest / Lowest" value={`${props.summary.highest} / ${props.summary.lowest}`} />
        <MetricCard label="At full capacity" value={props.summary.fullCapacity} tone={props.summary.fullCapacity ? 'warning' : 'default'} />
      </div>

      <div className="panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <input className="input" value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search student, registration number, or mentor…" aria-label="Search allocations" />
          <select className="input" value={props.programmeFilter} onChange={(event) => props.setProgrammeFilter(event.target.value)} aria-label="Filter by programme"><option value="all">All programmes</option>{props.programmes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}</select>
          <select className="input" value={props.sectionFilter} onChange={(event) => props.setSectionFilter(event.target.value)} aria-label="Filter by section"><option value="all">All sections</option>{props.sections.map((section) => <option key={section} value={section}>Section {section}</option>)}</select>
          <select className="input" value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value)} aria-label="Filter mentors by status"><option value="all">All mentor statuses</option><option value="available">Available</option><option value="full">Full capacity</option><option value="unavailable">Unavailable</option></select>
        </div>
      </div>

      <div className="panel p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="font-semibold">Manual allocation actions</p><p className="mt-1 text-sm text-slate-500"><strong>{props.selectedStudents.length}</strong> student(s) selected.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input min-w-56" value={props.targetFaculty} onChange={(event) => props.setTargetFaculty(event.target.value)} aria-label="Destination faculty mentor"><option value="">Select destination mentor</option>{availableFaculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name} ({remainingCapacity(faculty, props.state.students)} spaces)</option>)}</select>
            <button type="button" className="btn-primary" onClick={props.onMove} disabled={!props.selectedStudents.length}>Move selected</button>
            <button type="button" className="btn-secondary" onClick={props.onSwap}>Swap two</button>
            <button type="button" className="btn-secondary" onClick={props.onToggleLock}>Lock / Unlock</button>
            <button type="button" className="btn-secondary" onClick={props.onClearSelection}>Clear selection</button>
            <button type="button" className="btn-secondary" onClick={props.onUndo} disabled={!props.historyAvailable}>Undo</button>
            <button type="button" className="btn-danger" onClick={props.onReset}>Reset</button>
          </div>
        </div>
      </div>

      {props.warnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-semibold">Allocation warnings</p><ul className="mt-2 space-y-1 text-sm">{props.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>}

      {unallocated.length > 0 && (
        <div className="panel overflow-hidden">
          <button type="button" className="flex w-full items-center justify-between px-5 py-4 text-left" onClick={() => setOpenCards((cards) => cards.includes('__unallocated__') ? cards.filter((id) => id !== '__unallocated__') : [...cards, '__unallocated__'])}><span><span className="font-semibold text-amber-800">Unallocated students</span><span className="ml-2 chip bg-amber-50 text-amber-700">{unallocated.length}</span></span><span>{openCards.includes('__unallocated__') ? '−' : '+'}</span></button>
          {openCards.includes('__unallocated__') && <div className="border-t border-slate-100 p-4"><StudentList students={unallocated.filter(matches)} selected={props.selectedStudents} onToggle={toggleSelected} onDragStart={setDraggedStudent} /></div>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredFaculty.map((faculty) => {
          const assigned = assignedStudents(props.state.students, faculty.id).filter(matches);
          const allAssigned = assignedStudents(props.state.students, faculty.id);
          const load = totalLoad(faculty, props.state.students);
          const capacity = faculty.maxCapacity;
          const status = facultyStatus(faculty, props.state.students);
          const open = openCards.includes(faculty.id);
          return (
            <article
              key={faculty.id}
              className={`panel overflow-hidden transition ${draggedStudent ? 'border-university-300' : ''}`}
              onDragOver={(event) => { if (faculty.availability === 'Available') event.preventDefault(); }}
              onDrop={(event) => {
                event.preventDefault();
                const studentId = event.dataTransfer.getData('text/student-id') || draggedStudent;
                setDraggedStudent(null);
                if (studentId && faculty.availability === 'Available') props.onDragMove(studentId, faculty.id);
              }}
            >
              <button type="button" className="w-full p-5 text-left" onClick={() => setOpenCards((cards) => open ? cards.filter((id) => id !== faculty.id) : [...cards, faculty.id])} aria-expanded={open}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{faculty.name}</h3><span className={`chip border ${toneClasses[status.tone]}`}>{status.label}</span></div><p className="mt-1 text-sm text-slate-500">{faculty.id} · {faculty.designation} · {faculty.programme || 'Programme not specified'}</p></div>
                  <span className="text-xl text-slate-400">{open ? '−' : '+'}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-slate-500">Assigned</p><p className="mt-1 font-semibold">{allAssigned.length}</p></div><div><p className="text-slate-500">Total workload</p><p className="mt-1 font-semibold">{load}/{capacity}</p></div><div><p className="text-slate-500">Remaining</p><p className="mt-1 font-semibold">{Math.max(0, capacity - load)}</p></div></div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${load >= capacity ? 'bg-red-500' : load / capacity >= 0.85 ? 'bg-amber-500' : 'bg-university-500'}`} style={{ width: `${Math.min(100, capacity ? (load / capacity) * 100 : 0)}%` }} /></div>
              </button>
              {open && <div className="border-t border-slate-100 p-4"><StudentList students={assigned} selected={props.selectedStudents} onToggle={toggleSelected} onDragStart={setDraggedStudent} />{assigned.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No students match the current filters.</p>}</div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function StudentList({ students, selected, onToggle, onDragStart }: { students: Student[]; selected: string[]; onToggle: (id: string) => void; onDragStart: (id: string | null) => void }) {
  return <div className="space-y-2">{students.map((student) => <div key={student.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/student-id', student.id); onDragStart(student.id); }} onDragEnd={() => onDragStart(null)} className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 active:cursor-grabbing"><input type="checkbox" checked={selected.includes(student.id)} onChange={() => onToggle(student.id)} className="h-4 w-4 accent-university-600" aria-label={`Select ${student.name}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{student.name}</p>{student.locked && <span className="chip bg-slate-100 text-slate-600">Locked</span>}{student.specialRequirement && <span className="chip bg-amber-50 text-amber-700">Special support</span>}</div><p className="mt-1 text-xs text-slate-500">{student.regNo} · {student.programme} · Batch {student.batch || '—'} · Section {student.section || '—'}</p></div><span className="text-slate-300" title="Drag to another mentor">⋮⋮</span></div>)}</div>;
}

function ReportsSection({ state, summary, onMetaChange, onExcel, onCsv, onPdf, onPrintFaculty, onPrintStudent, onClearAll }: {
  state: AppState; summary: ReturnType<typeof getSummary>; onMetaChange: (meta: AppState['meta']) => void; onExcel: () => void; onCsv: () => void; onPdf: () => void; onPrintFaculty: () => void; onPrintStudent: () => void; onClearAll: () => void;
}) {
  const update = (key: keyof AppState['meta'], value: string) => onMetaChange({ ...state.meta, [key]: value });
  return (
    <div className="space-y-6">
      <SectionHeading title="Reports and exports" subtitle="Complete report metadata, then download Excel, CSV, PDF, or print-ready mentor lists." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel p-5"><h3 className="font-semibold">Report information</h3><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="field-label">Department</span><input className="input" value={state.meta.department} onChange={(event) => update('department', event.target.value)} /></label><label><span className="field-label">Programme</span><input className="input" value={state.meta.programme} onChange={(event) => update('programme', event.target.value)} /></label><label><span className="field-label">Academic year</span><input className="input" value={state.meta.academicYear} onChange={(event) => update('academicYear', event.target.value)} /></label><label><span className="field-label">Semester</span><input className="input" value={state.meta.semester} onChange={(event) => update('semester', event.target.value)} /></label><label><span className="field-label">Allocation date</span><input className="input" type="date" value={state.meta.allocationDate} onChange={(event) => update('allocationDate', event.target.value)} /></label><label><span className="field-label">Prepared by</span><input className="input" value={state.meta.preparedBy} onChange={(event) => update('preparedBy', event.target.value)} /></label></div></div>
        <div className="panel p-5"><h3 className="font-semibold">Allocation summary</h3><div className="mt-5 grid grid-cols-2 gap-3"><MetricCard label="Students" value={summary.totalStudents} /><MetricCard label="Mentors" value={summary.totalFaculty} /><MetricCard label="Allocated" value={summary.allocated} tone="success" /><MetricCard label="Unallocated" value={summary.unallocated} tone={summary.unallocated ? 'warning' : 'success'} /></div></div>
      </div>
      <div className="panel p-5"><h3 className="font-semibold">Download final reports</h3><p className="mt-1 text-sm text-slate-500">The Excel workbook contains separate faculty-wise, student-wise, unallocated, and summary sheets.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><button type="button" className="btn-primary" onClick={onExcel}>Excel workbook</button><button type="button" className="btn-secondary" onClick={onCsv}>Student CSV</button><button type="button" className="btn-secondary" onClick={onPdf}>PDF report</button><button type="button" className="btn-secondary" onClick={onPrintFaculty}>Print faculty-wise</button><button type="button" className="btn-secondary" onClick={onPrintStudent}>Print student-wise</button></div></div>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-red-900">Reset application data</h3><p className="mt-1 text-sm text-red-700">This removes faculty, students, allocations, and locally stored browser data.</p></div><button type="button" className="btn-danger" onClick={onClearAll}>Clear all data</button></div></div>
    </div>
  );
}

function SectionHeading({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p></div>{actions && <div className="shrink-0">{actions}</div>}</div>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2><button type="button" className="btn-secondary px-3 py-2" onClick={onClose} aria-label="Close dialog">×</button></div>{children}</div></div>;
}

function FacultyModal({ initial, defaultCapacity, onClose, onSave }: { initial?: Faculty; defaultCapacity: number; onClose: () => void; onSave: (faculty: Faculty) => void }) {
  const [form, setForm] = useState<Faculty>(initial ?? { id: '', name: '', department: 'Commerce', designation: 'Assistant Professor', programme: 'B.Com Financial Analytics', maxCapacity: defaultCapacity, currentMentees: 0, availability: 'Available', preferred: '', classTeacher: false });
  const update = <K extends keyof Faculty>(key: K, value: Faculty[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  return <ModalShell title={initial ? 'Edit faculty mentor' : 'Add faculty mentor'} onClose={onClose}><form className="p-5" onSubmit={(event) => { event.preventDefault(); if (!form.id.trim() || !form.name.trim() || form.maxCapacity <= 0) return; onSave(form); }}><div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">Faculty ID *</span><input className="input" required value={form.id} onChange={(event) => update('id', event.target.value)} /></label><label><span className="field-label">Faculty name *</span><input className="input" required value={form.name} onChange={(event) => update('name', event.target.value)} /></label><label><span className="field-label">Department</span><input className="input" value={form.department} onChange={(event) => update('department', event.target.value)} /></label><label><span className="field-label">Designation</span><input className="input" value={form.designation} onChange={(event) => update('designation', event.target.value)} /></label><label><span className="field-label">Programme</span><input className="input" value={form.programme} onChange={(event) => update('programme', event.target.value)} /></label><label><span className="field-label">Availability</span><select className="input" value={form.availability} onChange={(event) => update('availability', event.target.value as Faculty['availability'])}><option>Available</option><option>Unavailable</option></select></label><label><span className="field-label">Maximum mentees *</span><input className="input" type="number" min="1" required value={form.maxCapacity} onChange={(event) => update('maxCapacity', safeNumber(event.target.value, defaultCapacity))} /></label><label><span className="field-label">Current mentees</span><input className="input" type="number" min="0" value={form.currentMentees} onChange={(event) => update('currentMentees', Math.max(0, safeNumber(event.target.value)))} /></label><label className="sm:col-span-2"><span className="field-label">Preferred batch, class, or specialization</span><input className="input" value={form.preferred} onChange={(event) => update('preferred', event.target.value)} /></label><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2"><input type="checkbox" checked={form.classTeacher} onChange={(event) => update('classTeacher', event.target.checked)} className="h-4 w-4 accent-university-600" /><span className="text-sm font-medium">This faculty member is a class teacher</span></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary">Save faculty</button></div></form></ModalShell>;
}

function StudentModal({ initial, faculty, onClose, onSave }: { initial?: Student; faculty: Faculty[]; onClose: () => void; onSave: (student: Student) => void }) {
  const [form, setForm] = useState<Student>(initial ?? { id: createId(), regNo: '', name: '', programme: 'B.Com Financial Analytics', batch: '', year: '', semester: '', section: '', specialization: 'Financial Analytics', gender: '', existingMentor: '', specialRequirement: '', mentorId: undefined, locked: false });
  const update = <K extends keyof Student>(key: K, value: Student[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  return <ModalShell title={initial ? 'Edit student' : 'Add student'} onClose={onClose}><form className="p-5" onSubmit={(event) => { event.preventDefault(); if (!form.regNo.trim() || !form.name.trim()) return; onSave(form); }}><div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">Registration number *</span><input className="input" required value={form.regNo} onChange={(event) => update('regNo', event.target.value)} /></label><label><span className="field-label">Student name *</span><input className="input" required value={form.name} onChange={(event) => update('name', event.target.value)} /></label><label><span className="field-label">Programme</span><input className="input" value={form.programme} onChange={(event) => update('programme', event.target.value)} /></label><label><span className="field-label">Batch</span><input className="input" value={form.batch} onChange={(event) => update('batch', event.target.value)} /></label><label><span className="field-label">Year</span><input className="input" value={form.year} onChange={(event) => update('year', event.target.value)} /></label><label><span className="field-label">Semester</span><input className="input" value={form.semester} onChange={(event) => update('semester', event.target.value)} /></label><label><span className="field-label">Section</span><input className="input" value={form.section} onChange={(event) => update('section', event.target.value)} /></label><label><span className="field-label">Specialization</span><input className="input" value={form.specialization} onChange={(event) => update('specialization', event.target.value)} /></label><label><span className="field-label">Gender (optional)</span><input className="input" value={form.gender} onChange={(event) => update('gender', event.target.value)} /></label><label><span className="field-label">Existing faculty mentor</span><select className="input" value={form.existingMentor} onChange={(event) => update('existingMentor', event.target.value)}><option value="">None</option>{faculty.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.id})</option>)}</select></label><label className="sm:col-span-2"><span className="field-label">Special mentoring requirement</span><textarea className="input min-h-24" value={form.specialRequirement} onChange={(event) => update('specialRequirement', event.target.value)} /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary">Save student</button></div></form></ModalShell>;
}

export default App;
