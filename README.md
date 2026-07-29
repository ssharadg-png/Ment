# Faculty Mentor Allocation System

A responsive, browser-based university application for allocating students to faculty mentors while respecting workload balance, faculty capacity, availability, existing mentor relationships, locked allocations, programme/batch/section grouping, and manual adjustments.

## Main features

- Interactive dashboard with setup readiness and live workload metrics
- Faculty and student data entry, editing, deletion, search, CSV/XLSX/XLS upload
- Capacity-aware balanced allocation engine
- Existing mentor retention and optional allocation locking
- Programme, batch, section, or specialization grouping
- Class-teacher and faculty-preference scoring
- Expandable mentor cards and drag-and-drop student reassignment
- Bulk move, swap, lock/unlock, regenerate unlocked, undo, and reset
- Workload chart and clear capacity/status indicators
- Excel workbook, CSV, PDF, faculty-wise print, and student-wise print reports
- Browser local storage to protect data after page refresh
- Automated tests for ten required allocation scenarios
- Automatic GitHub Pages deployment workflow

## Project structure

```text
faculty-mentor-allocation-system/
├── .github/workflows/deploy.yml
├── public/sample-data/
│   ├── faculty-upload-template.csv
│   └── student-upload-template.csv
├── src/
│   ├── data/sampleData.ts
│   ├── lib/
│   │   ├── allocation.ts
│   │   ├── export.ts
│   │   ├── files.ts
│   │   └── helpers.ts
│   ├── tests/allocation.test.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Run locally

Install Node.js 20 or later, then run:

```bash
npm install
npm run dev
```

Open the local address displayed by Vite.

## Test and build

```bash
npm run test
npm run build
npm run preview
```

The production build is generated in the `dist` folder.

## Publish online using GitHub Pages

1. Create a new GitHub repository.
2. Upload **all files and folders** from this project to the repository root.
3. Commit the files to the `main` branch.
4. Open the repository’s **Settings → Pages**.
5. Under **Build and deployment**, select **GitHub Actions** as the source.
6. Open the **Actions** tab and allow the `Deploy Faculty Mentor App to GitHub Pages` workflow to finish.
7. The published link will appear in the deployment job and in **Settings → Pages**.

The normal URL format is:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY-NAME/
```

## Where to modify allocation rules

The primary allocation logic is in:

```text
src/lib/allocation.ts
```

Key functions:

- `validateState()` — validates faculty, student, capacity, and duplicate data
- `preferenceScore()` — controls class-teacher, programme, section, batch, and specialization preferences
- `allocateStudents()` — retains locked/existing assignments, chooses eligible faculty, balances workloads, enforces capacity, and flags unallocated students
- `getSummary()` — calculates dashboard metrics

Default rule values and the 103-student sample are in:

```text
src/data/sampleData.ts
```

## Allocation method

1. Validate faculty and student records.
2. Exclude unavailable faculty and faculty without remaining capacity.
3. Retain valid existing mentor allocations when enabled.
4. Lock retained allocations when enabled.
5. Group pending students according to the selected rule.
6. Compare eligible mentors by total workload, faculty preferences, class-teacher preference, and remaining capacity.
7. Assign each student to the most suitable eligible faculty member without exceeding capacity.
8. Distribute remainders to the lowest-workload faculty members.
9. Flag unallocated students and workload differences above the permitted limit.

## Data privacy

The app is client-side. Faculty and student data remains in the user’s browser unless the user explicitly downloads a report. No server or database is used in this version.
