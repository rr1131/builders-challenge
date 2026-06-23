import { generateSummaryContent } from './anthropicService'
import { formatDateInput, formatWeekdayName, getWeekStart } from './productivityWeek'
import { rebuildWeeklySummarySearchIndex } from './weeklySummarySearchService'
import { readJsonFile, writeJsonFile } from './storage'
import { getTasks, Task } from './taskService'

/**
 * Deterministic week-level metrics used by both the dashboard UI and the
 * historical-search ranking layer.
 */
export interface WeeklySummaryMetrics {
  taskCount: number
  totalHours: number
  averageFocusLevel: number
  topCategory: string
  busiestDay: string
}

export interface WeeklySummary {
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  generatedAt: string
  taskSignature?: string
  metrics: WeeklySummaryMetrics
}

const summariesFilename = 'weeklySummaries.json'

/**
 * Retrieves the persisted summary for a specific reporting week.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @returns Saved weekly summary or `null` when none exists.
 */
export function getWeeklySummary (weekStart: string, weekEnd: string): WeeklySummary | null {
  validateWeekRange(weekStart, weekEnd)
  return readSummaries().find(summary => summary.weekStart === weekStart && summary.weekEnd === weekEnd) ?? null
}

// Task mutations use this helper to remove stale summaries from both persisted
// storage and the search index without triggering a new AI generation step.
/**
 * Removes the persisted summary for one reporting week and rebuilds the search
 * index when a deletion actually occurred.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @returns `true` when a stored summary was removed.
 */
export async function invalidateWeeklySummary (weekStart: string, weekEnd: string): Promise<boolean> {
  validateWeekRange(weekStart, weekEnd)

  return await invalidateWeeklySummariesByKey(new Set([buildWeekKey(weekStart, weekEnd)]))
}

// Date-based invalidation lets create, edit, and delete flows pass the task
// dates they touched while the service deduplicates the affected weeks.
/**
 * Invalidates any saved summaries touched by a set of task dates.
 *
 * @param dateValues Task finish dates that may span one or more weeks.
 * @returns `true` when at least one stored summary was removed.
 */
export async function invalidateWeeklySummariesForDateValues (dateValues: Array<string | undefined>): Promise<boolean> {
  const weekKeys = new Set<string>()

  dateValues.forEach(dateValue => {
    if (dateValue == null) {
      return
    }

    const { weekStart, weekEnd } = getWeekRangeForDateValue(dateValue)
    weekKeys.add(buildWeekKey(weekStart, weekEnd))
  })

  return await invalidateWeeklySummariesByKey(weekKeys)
}

/**
 * Generates, persists, and indexes a fresh weekly summary from the stored task
 * data for a given reporting week.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @returns Saved weekly summary payload.
 */
export async function generateWeeklySummary (weekStart: string, weekEnd: string): Promise<WeeklySummary> {
  validateWeekRange(weekStart, weekEnd)

  // Summaries are generated from completed tasks already stored for the week.
  const tasks = getTasks({ weekStart, weekEnd })

  if (tasks.length === 0) {
    throw new Error('Cannot generate a weekly summary without completed tasks in the selected week.')
  }

  const metrics = computeWeeklySummaryMetrics(tasks)
  const generatedContent = await generateSummaryContent(weekStart, weekEnd, tasks, metrics)
  const nextSummary: WeeklySummary = {
    weekStart,
    weekEnd,
    summaryParagraph: generatedContent.summaryParagraph,
    suggestions: generatedContent.suggestions,
    generatedAt: (new Date()).toISOString(),
    taskSignature: buildTaskSignature(tasks),
    metrics
  }

  await persistSummary(nextSummary)

  return nextSummary
}

/**
 * Computes the deterministic weekly metrics shown in the UI and search index.
 *
 * @param tasks Completed tasks inside one reporting week.
 * @returns Weekly metrics derived from those tasks.
 */
export function computeWeeklySummaryMetrics (tasks: Task[]): WeeklySummaryMetrics {
  if (tasks.length === 0) {
    throw new Error('Cannot compute weekly summary metrics without tasks.')
  }

  // These deterministic metrics are shown directly in the UI and also seeded
  // into the Part 2 search index for better retrieval quality.
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
 * Reads all persisted summaries from disk.
 *
 * @returns Stored weekly summaries.
 */
function readSummaries (): WeeklySummary[] {
  return readJsonFile<WeeklySummary[]>(summariesFilename, [])
}

/**
 * Removes summaries by precomputed week keys and rebuilds the vector index.
 *
 * @param weekKeys Set of `weekStart:weekEnd` identifiers to remove.
 * @returns `true` when at least one summary was deleted.
 */
async function invalidateWeeklySummariesByKey (weekKeys: Set<string>): Promise<boolean> {
  if (weekKeys.size === 0) {
    return false
  }

  const summaries = readSummaries()
  const nextSummaries = summaries.filter(summary => !weekKeys.has(buildWeekKey(summary.weekStart, summary.weekEnd)))

  if (nextSummaries.length === summaries.length) {
    return false
  }

  writeJsonFile(summariesFilename, nextSummaries)
  await rebuildWeeklySummarySearchIndex()

  return true
}

// A simple task signature lets the frontend detect additions, edits, and
// deletions against the exact task set used to generate a summary.
/**
 * Builds a stable signature for the exact task set represented by a summary.
 *
 * @param tasks Tasks included in the summary.
 * @returns Sorted task signature string.
 */
function buildTaskSignature (tasks: Task[]): string {
  return tasks
    .map(task => `${task.id}:${task.updatedAt}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|')
}

/**
 * Writes a summary back to disk and synchronizes the historical-search index.
 *
 * @param nextSummary Weekly summary to persist.
 */
async function persistSummary (nextSummary: WeeklySummary): Promise<void> {
  const summaries = readSummaries().filter(summary => !(summary.weekStart === nextSummary.weekStart && summary.weekEnd === nextSummary.weekEnd))
  summaries.unshift(nextSummary)
  writeJsonFile(summariesFilename, summaries)

  // Keep the Part 2 search index in sync as soon as a summary is generated.
  await rebuildWeeklySummarySearchIndex()
}

/**
 * Validates that a week range uses the expected storage format and ordering.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 */
function validateWeekRange (weekStart: string, weekEnd: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
    throw new Error('Week range must use YYYY-MM-DD format.')
  }

  if (weekStart > weekEnd) {
    throw new Error('Week start must be on or before week end.')
  }
}

/**
 * Derives the reporting-week bounds for a single task date.
 *
 * @param dateValue Task finish date in `YYYY-MM-DD` format.
 * @returns Inclusive week range containing that date.
 */
function getWeekRangeForDateValue (dateValue: string): { weekStart: string, weekEnd: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error('Date value must use YYYY-MM-DD format.')
  }

  const weekStartDate = getWeekStart(new Date(`${dateValue}T12:00:00`))
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 6)

  return {
    weekStart: formatDateInput(weekStartDate),
    weekEnd: formatDateInput(weekEndDate)
  }
}

/**
 * Builds the canonical persistence key for a reporting week.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @returns Stable `weekStart:weekEnd` key.
 */
function buildWeekKey (weekStart: string, weekEnd: string): string {
  return `${weekStart}:${weekEnd}`
}

/**
 * Determines the dominant task category for a summary.
 *
 * @param tasks Completed tasks inside one reporting week.
 * @returns Category with the highest task count.
 */
function computeTopCategory (tasks: Task[]): string {
  // Category dominance is measured by completed task count rather than hours
  // because the dashboard presents categories primarily as task groupings.
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
 * Finds the day with the highest logged hours inside a reporting week.
 *
 * @param tasks Completed tasks inside one reporting week.
 * @returns Weekday label for the busiest day.
 */
function computeBusiestDay (tasks: Task[]): string {
  // Busiest day is hour-based so the summary describes workload concentration.
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
