import { writeJsonFile } from '../services/storage'
import { Task } from '../services/taskService'
import { getWeeklySummarySearchDocuments } from '../services/weeklySummarySearchService'
import { formatWeekdayName } from '../services/productivityWeek'

interface WeeklySummaryBlueprint {
  weekStart: string
  weekEnd: string
  generatedAt: string
  summaryParagraph: string
  suggestions: string[]
}

interface WeeklySummaryMetrics {
  taskCount: number
  totalHours: number
  averageFocusLevel: number
  topCategory: string
  busiestDay: string
}

interface WeeklySummary {
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  generatedAt: string
  taskSignature?: string
  metrics: WeeklySummaryMetrics
}

// This reviewer dataset covers the full month of June so the dashboard,
// GenAI summary flow, and historical search all have realistic data to use.
const seededTasks: Task[] = [
  buildTask(1, 'Sprint kickoff planning', '2026-06-01', 'planning', 1.5, 7, 'Defined priorities for the first June sprint.', 9),
  buildTask(2, 'Build filter panel layout', '2026-06-01', 'coding', 3, 8, 'Implemented the initial dashboard filter shell.', 11),
  buildTask(3, 'Team standup', '2026-06-02', 'meeting', 1, 5, 'Shared blockers and aligned on delivery targets.', 10),
  buildTask(4, 'Refactor task form validation', '2026-06-03', 'coding', 2.5, 9, 'Cleaned up validation so the add-task flow was easier to maintain.', 13),
  buildTask(5, 'Review search edge cases', '2026-06-04', 'research', 2, 7, 'Collected failure cases for historical summary search.', 14),
  buildTask(6, 'Polish tooltip copy', '2026-06-05', 'coding', 2, 8, 'Finished the chart tooltip wording and layout.', 15),
  buildTask(7, 'Weekly admin closeout', '2026-06-05', 'admin', 1, 6, 'Closed follow-ups and updated the task board.', 16),

  buildTask(8, 'Leadership sync', '2026-06-08', 'meeting', 1, 4, 'Reviewed milestones and upcoming stakeholder asks.', 10),
  buildTask(9, 'Vendor follow-up', '2026-06-09', 'admin', 1.5, 4, 'Resolved a tooling renewal and a billing question.', 11),
  buildTask(10, 'Roadmap review', '2026-06-09', 'meeting', 2, 5, 'Walked through next-quarter priorities with the broader team.', 14),
  buildTask(11, 'Inbox cleanup', '2026-06-10', 'admin', 1, 3, 'Cleared stale threads and documented the decisions that mattered.', 9),
  buildTask(12, 'Incident retro', '2026-06-11', 'meeting', 1.5, 4, 'Captured follow-up items from a small production issue.', 13),
  buildTask(13, 'Documentation catch-up', '2026-06-12', 'planning', 2, 6, 'Updated onboarding notes and current sprint goals.', 11),
  buildTask(14, 'Hiring sync', '2026-06-12', 'meeting', 1, 4, 'Met with recruiting to align on open role needs.', 15),
  buildTask(15, 'Expense reconciliation', '2026-06-13', 'admin', 1.5, 5, 'Closed end-of-week operational work before Monday.', 12),

  buildTask(16, 'Ship search ranking improvements', '2026-06-15', 'coding', 3, 9, 'Finished the ranking pass for workload and focus-based search queries.', 10),
  buildTask(17, 'Summary prompt tuning', '2026-06-16', 'research', 2, 7, 'Compared prompt variants for tighter recap output.', 12),
  buildTask(18, 'Demo prep checklist', '2026-06-17', 'planning', 1.5, 7, 'Prepared notes for the midweek product demo.', 13),
  buildTask(19, 'Fix historical search bug', '2026-06-18', 'coding', 3, 8, 'Resolved a stale-summary issue after task deletion.', 15),
  buildTask(20, 'Stakeholder sync', '2026-06-19', 'meeting', 1, 5, 'Reviewed progress and reset expectations for the next milestone.', 11),
  buildTask(21, 'Weekend deep work session', '2026-06-20', 'coding', 4, 9, 'Used a long uninterrupted block to close larger implementation work.', 10),
  buildTask(22, 'Review analytics notes', '2026-06-21', 'research', 1, 6, 'Captured observations from recent tracker usage patterns.', 14),

  buildTask(23, 'Investigate search precision', '2026-06-22', 'research', 2, 6, 'Looked into mismatch cases for vague workload queries.', 10),
  buildTask(24, 'README cleanup draft', '2026-06-23', 'admin', 1.5, 6, 'Restructured the reviewer instructions for clarity.', 11),
  buildTask(25, 'Portfolio planning', '2026-06-23', 'planning', 2, 7, 'Outlined the submission story and demo flow.', 15),
  buildTask(26, 'Pairing session', '2026-06-24', 'meeting', 1.5, 6, 'Walked through the remaining polish items with a teammate.', 12),
  buildTask(27, 'Prototype export view', '2026-06-25', 'coding', 2.5, 7, 'Explored a future export surface for weekly summaries.', 14),
  buildTask(28, 'Bug triage', '2026-06-26', 'admin', 1, 5, 'Sorted known issues and tagged the highest-priority fixes.', 11),
  buildTask(29, 'Retrospective notes', '2026-06-26', 'research', 1, 6, 'Wrote up what worked and what still felt clumsy in the flow.', 16),
  buildTask(30, 'Weekend inbox sweep', '2026-06-28', 'admin', 0.5, 3, 'Closed loose ends before starting the final week of June.', 18),

  buildTask(31, 'Sprint closeout', '2026-06-29', 'planning', 1.5, 7, 'Wrapped the month with a clean handoff into the next sprint.', 10),
  buildTask(32, 'Q3 roadmap notes', '2026-06-30', 'planning', 3, 8, 'Captured product themes and near-term roadmap tradeoffs.', 12),
  buildTask(33, 'End-of-month review', '2026-06-30', 'admin', 1, 6, 'Reviewed the June task log and final cleanup items.', 16)
]

const summaryBlueprints: WeeklySummaryBlueprint[] = [
  {
    weekStart: '2026-06-01',
    weekEnd: '2026-06-07',
    generatedAt: '2026-06-07T18:30:00.000Z',
    summaryParagraph: 'June opened with a strong execution week centered on coding. Product work moved forward early, and the mix of planning, research, and admin stayed contained enough that deep work still led the schedule.',
    suggestions: [
      'Protect early-week build time: Keep Monday and Wednesday clear for implementation-heavy work while momentum is highest.',
      'Keep coordination lightweight: Continue limiting meetings and admin work so they support execution instead of crowding it out.',
      'Capture repeatable UI patterns: Turn this week’s successful implementation choices into reusable notes for later iterations.'
    ]
  },
  {
    weekStart: '2026-06-08',
    weekEnd: '2026-06-14',
    generatedAt: '2026-06-14T18:30:00.000Z',
    summaryParagraph: 'This week skewed toward meetings and admin follow-through. Work kept moving, but the heavier coordination load pulled focus down and left less room for uninterrupted implementation time.',
    suggestions: [
      'Batch coordination work: Group meetings and admin follow-ups into tighter windows to create at least one protected focus block.',
      'Front-load the hardest task: Put your most technical work before collaboration begins so lower-focus work does not consume the whole day.',
      'Trim low-value check-ins: Shorten or combine recurring meetings that do not directly unblock execution.'
    ]
  },
  {
    weekStart: '2026-06-15',
    weekEnd: '2026-06-21',
    generatedAt: '2026-06-21T18:30:00.000Z',
    summaryParagraph: 'This was the clearest high-output week of the month. Coding dominated the workload, and a long weekend deep-work block helped push meaningful product work across the finish line without losing momentum during the weekdays.',
    suggestions: [
      'Repeat the weekend deep-work setup: Recreate the conditions that made the Saturday session productive whenever a large implementation push is needed.',
      'Protect high-focus coding time: Keep your biggest technical tasks anchored to the same focused windows that worked this week.',
      'Use lighter weekdays for support work: Keep meetings and prep tasks small so they do not dilute the momentum from deep implementation sessions.'
    ]
  },
  {
    weekStart: '2026-06-22',
    weekEnd: '2026-06-28',
    generatedAt: '2026-06-28T18:30:00.000Z',
    summaryParagraph: 'This week was more mixed and maintenance-heavy. Research, planning, and admin all showed up, which kept progress steady, but the workload felt more fragmented than the previous week.',
    suggestions: [
      'Cluster similar work together: Group research and admin tasks into dedicated blocks so context switching happens less often.',
      'Reserve one larger build window: Even in a mixed week, keep at least one uninterrupted session for hands-on product work.',
      'Use Friday for synthesis: End the week by consolidating findings and decisions instead of scattering small follow-ups.'
    ]
  },
  {
    weekStart: '2026-06-29',
    weekEnd: '2026-07-05',
    generatedAt: '2026-07-05T18:30:00.000Z',
    summaryParagraph: 'The month closed with a short planning-focused week. Even with only two June workdays in the reporting window, you wrapped up roadmap and review work with solid focus and a clean handoff into the next sprint.',
    suggestions: [
      'Keep closeout work structured: Use the same end-of-month checklist approach whenever you need a clean transition between planning cycles.',
      'Turn roadmap notes into next actions: Follow short planning weeks with clear build-ready tasks so momentum carries forward.',
      'Preserve review time: Keep a small end-of-month reflection block because it surfaced useful cleanup work without dominating the week.'
    ]
  }
]

/**
 * Resets the backend data files to the reviewer-friendly June dataset and
 * rebuilds the persisted historical-search index.
 */
async function main (): Promise<void> {
  const seededSummaries = summaryBlueprints.map(buildWeeklySummary)

  writeJsonFile<Task[]>('tasks.json', seededTasks)
  writeJsonFile<WeeklySummary[]>('weeklySummaries.json', seededSummaries)
  // Clear the old index first so each seed run produces the exact same vector state.
  writeJsonFile('weeklySummarySearchIndex.json', [])

  const searchDocuments = await getWeeklySummarySearchDocuments()

  process.stdout.write(
    `Seeded ${seededTasks.length} tasks, ${seededSummaries.length} weekly summaries, and ${searchDocuments.length} vector records.\n`
  )
}

/**
 * Converts one summary blueprint into a persisted weekly summary with computed
 * metrics and a task signature that matches the seeded June tasks.
 *
 * @param blueprint Summary text and date range for one week.
 * @returns Persisted weekly summary payload.
 */
function buildWeeklySummary (blueprint: WeeklySummaryBlueprint): WeeklySummary {
  const weeklyTasks = seededTasks.filter(task => task.finishDate >= blueprint.weekStart && task.finishDate <= blueprint.weekEnd)

  return {
    weekStart: blueprint.weekStart,
    weekEnd: blueprint.weekEnd,
    summaryParagraph: blueprint.summaryParagraph,
    suggestions: blueprint.suggestions,
    generatedAt: blueprint.generatedAt,
    taskSignature: buildTaskSignature(weeklyTasks),
    metrics: computeWeeklySummaryMetrics(weeklyTasks)
  }
}

/**
 * Builds one deterministic seeded task record for the reviewer dataset.
 *
 * @param id Persisted task identifier.
 * @param title Task title.
 * @param finishDate Completion date.
 * @param category Task category.
 * @param hoursSpent Logged duration.
 * @param focusLevel Numeric focus level.
 * @param notes Additional context.
 * @param updatedHourUtc Hour used to create a stable timestamp.
 * @returns Persisted seeded task.
 */
function buildTask (
  id: number,
  title: string,
  finishDate: string,
  category: Task['category'],
  hoursSpent: number,
  focusLevel: number,
  notes: string,
  updatedHourUtc: number
): Task {
  const timestamp = buildTimestamp(finishDate, updatedHourUtc)

  return {
    id,
    title,
    finishDate,
    category,
    hoursSpent,
    focusLevel,
    notes,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * Builds the task signature used by the frontend to detect stale summaries.
 *
 * @param tasks Tasks included in one weekly summary.
 * @returns Stable task signature string.
 */
function buildTaskSignature (tasks: Task[]): string {
  return tasks
    .map(task => `${task.id}:${task.updatedAt}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|')
}

/**
 * Creates a deterministic ISO timestamp for seeded records.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @param hourUtc Hour component to embed in the timestamp.
 * @returns ISO timestamp string.
 */
function buildTimestamp (dateValue: string, hourUtc: number): string {
  return `${dateValue}T${String(hourUtc).padStart(2, '0')}:00:00.000Z`
}

/**
 * Computes the week-level metrics used by the seeded summaries.
 *
 * @param tasks Seeded tasks that belong to one reporting week.
 * @returns Weekly summary metrics.
 */
function computeWeeklySummaryMetrics (tasks: Task[]): WeeklySummaryMetrics {
  const taskCount = tasks.length
  const totalHours = Number(tasks.reduce((sum, task) => sum + task.hoursSpent, 0).toFixed(1))
  const averageFocusLevel = Number((tasks.reduce((sum, task) => sum + task.focusLevel, 0) / taskCount).toFixed(1))
  const topCategory = computeTopCategory(tasks)
  const busiestDay = computeBusiestDay(tasks)

  return {
    taskCount,
    totalHours,
    averageFocusLevel,
    topCategory,
    busiestDay
  }
}

/**
 * Finds the dominant category in one seeded reporting week.
 *
 * @param tasks Seeded tasks to inspect.
 * @returns Category with the highest task count.
 */
function computeTopCategory (tasks: Task[]): string {
  const groupedCounts = tasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.category] = (counts[task.category] ?? 0) + 1
    return counts
  }, {})

  return Object.entries(groupedCounts).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })[0][0]
}

/**
 * Finds the busiest weekday in one seeded reporting week.
 *
 * @param tasks Seeded tasks to inspect.
 * @returns Weekday label with the highest logged hours.
 */
function computeBusiestDay (tasks: Task[]): string {
  const groupedHours = tasks.reduce<Record<string, number>>((hoursByDay, task) => {
    hoursByDay[task.finishDate] = (hoursByDay[task.finishDate] ?? 0) + task.hoursSpent
    return hoursByDay
  }, {})

  const busiestDate = Object.entries(groupedHours).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })[0][0]

  return formatWeekdayName(busiestDate)
}

void main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
