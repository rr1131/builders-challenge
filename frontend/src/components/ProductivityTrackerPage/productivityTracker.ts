import type {
  ProductivitySearchAgentResponse,
  FocusBucket,
  ProductivityTask,
  ProductivityWeeklySummary,
  ProductivityWeeklySummarySearchResult,
  TaskCategory
} from 'types/productivity'

// Shared tracker helpers keep date math, labels, derived metrics, and summary
// formatting logic out of the React rendering components.
/**
 * Utility types and helper functions shared by the productivity tracker UI.
 */
export type { FocusBucket, TaskCategory }
export type ViewMode = 'chronological' | 'category' | 'focus'
export type TaskRecord = ProductivityTask
export type WeeklySummaryRecord = ProductivityWeeklySummary
export type WeeklySummarySearchResultRecord = ProductivityWeeklySummarySearchResult
export type ProductivitySearchAgentResponseRecord = ProductivitySearchAgentResponse
export interface SummaryMetricItem {
  label: string
  value: string
}

export interface SummarySuggestionParts {
  lead: string
  detail: string
}

export interface WeekRange {
  weekStart: string
  weekEnd: string
}

export const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const categoryOrder: TaskCategory[] = ['coding', 'planning', 'meeting', 'research', 'admin', 'other']

/**
 * Returns today's date in the tracker storage format.
 *
 * @returns Current date in `YYYY-MM-DD` format.
 */
export function getTodayDate (): string {
  return formatDateInput(new Date())
}

/**
 * Normalizes a date to the Monday that starts its reporting week.
 *
 * @param date Any date inside the target reporting week.
 * @returns Monday at midnight for that week.
 */
export function getWeekStart (date: Date): Date {
  const normalizedDate = new Date(date)
  const currentDay = normalizedDate.getDay()
  const offset = currentDay === 0 ? -6 : 1 - currentDay

  normalizedDate.setDate(normalizedDate.getDate() + offset)
  normalizedDate.setHours(0, 0, 0, 0)

  return normalizedDate
}

/**
 * Expands a date into the seven dates shown by the weekly dashboard.
 *
 * @param date Any date inside the target reporting week.
 * @returns Monday-through-Sunday date array.
 */
export function getWeekDates (date: Date): Date[] {
  const weekStart = getWeekStart(date)

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(weekStart)
    nextDate.setDate(weekStart.getDate() + index)
    return nextDate
  })
}

/**
 * Converts a date into the inclusive week range used by GraphQL queries.
 *
 * @param date Any date inside the target reporting week.
 * @returns Inclusive `weekStart` and `weekEnd` values.
 */
export function getWeekRangeForDate (date: Date): WeekRange {
  const weekDates = getWeekDates(date)

  return {
    weekStart: formatDateInput(weekDates[0]),
    weekEnd: formatDateInput(weekDates[weekDates.length - 1])
  }
}

/**
 * Converts a stored date string into its inclusive week range.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @returns Inclusive week range containing that date.
 */
export function getWeekRangeForDateValue (dateValue: string): WeekRange {
  return getWeekRangeForDate(new Date(`${dateValue}T12:00:00`))
}

/**
 * Moves a date forward or backward by whole reporting weeks.
 *
 * @param date Anchor date.
 * @param weeks Number of weeks to shift, positive or negative.
 * @returns Shifted date.
 */
export function addWeeks (date: Date, weeks: number): Date {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + (weeks * 7))
  return nextDate
}

/**
 * Checks whether two dates belong to the same reporting week.
 *
 * @param left First date to compare.
 * @param right Second date to compare.
 * @returns `true` when both dates map to the same week range.
 */
export function isSameWeek (left: Date, right: Date): boolean {
  const leftWeekRange = getWeekRangeForDate(left)
  const rightWeekRange = getWeekRangeForDate(right)

  return leftWeekRange.weekStart === rightWeekRange.weekStart && leftWeekRange.weekEnd === rightWeekRange.weekEnd
}

/**
 * Formats a `Date` into the storage/query format used across the tracker.
 *
 * @param date Date to serialize.
 * @returns Date string in `YYYY-MM-DD` format.
 */
export function formatDateInput (date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * Parses a stored date string into a local `Date` instance.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @returns Parsed date or `null` when the value is invalid.
 */
export function parseDateInput (dateValue: string | null | undefined): Date | null {
  if (dateValue == null || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return null
  }

  const parsedDate = new Date(`${dateValue}T12:00:00`)

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

/**
 * Formats the short week label shown by the week selector.
 *
 * @param date Any date inside the target reporting week.
 * @returns Compact `Mon DD - Mon DD` style label.
 */
export function formatWeekLabel (date: Date): string {
  const weekDates = getWeekDates(date)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[weekDates.length - 1]

  return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })}`
}

/**
 * Formats an explicit week range for UI display and search results.
 *
 * @param weekStart Inclusive Monday date string.
 * @param weekEnd Inclusive Sunday date string.
 * @returns Human-readable week label.
 */
export function formatCanonicalWeekLabel (weekStart: string, weekEnd: string): string {
  const startDate = new Date(`${weekStart}T12:00:00`)
  const endDate = new Date(`${weekEnd}T12:00:00`)
  const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' })
  const startDay = startDate.toLocaleDateString('en-US', { day: 'numeric' })
  const endDay = endDate.toLocaleDateString('en-US', { day: 'numeric' })
  const startYear = startDate.toLocaleDateString('en-US', { year: 'numeric' })
  const endYear = endDate.toLocaleDateString('en-US', { year: 'numeric' })

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${startYear}`
    }

    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`
  }

  return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`
}

/**
 * Formats a stored date string as a full weekday-oriented label.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @returns Long date label.
 */
export function formatLongDate (dateValue: string): string {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Formats a stored date string as a compact month/day label.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @returns Short date label.
 */
export function formatShortDate (dateValue: string): string {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Converts a stored category key into a human-readable label.
 *
 * @param category Raw category key.
 * @returns Title-cased category label.
 */
export function formatCategoryLabel (category: string): string {
  return category
    .split('-')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

// Summary metrics are rendered as label/value pairs so the UI can reorder them cleanly.
/**
 * Builds the ordered metric rows shown in the weekly summary card.
 *
 * @param summary Saved weekly summary.
 * @returns Ordered metric label/value pairs.
 */
export function buildSummaryMetricItems (summary: WeeklySummaryRecord): SummaryMetricItem[] {
  return [
    { label: 'Tasks', value: `${summary.metrics.taskCount}` },
    { label: 'Hours', value: `${summary.metrics.totalHours}` },
    { label: 'Focus Level', value: `${summary.metrics.averageFocusLevel}/10` },
    { label: 'Top Category', value: formatCategoryLabel(summary.metrics.topCategory) }
  ]
}

// Suggestions are split into a bold lead and normal-weight detail when they use "Action: explanation".
/**
 * Splits a generated suggestion into its bold lead and regular explanation.
 *
 * @param suggestion Raw suggestion text from the backend.
 * @returns Parsed suggestion pieces for styled rendering.
 */
export function parseSummarySuggestion (suggestion: string): SummarySuggestionParts {
  const normalizedSuggestion = suggestion.trim()
  const separatorIndex = normalizedSuggestion.indexOf(':')

  if (separatorIndex > 0) {
    const lead = normalizedSuggestion.slice(0, separatorIndex).trim()
    const detail = normalizedSuggestion.slice(separatorIndex + 1).trim()

    if (lead !== '' && detail !== '') {
      return { lead, detail }
    }
  }

  return {
    lead: normalizedSuggestion,
    detail: ''
  }
}

/**
 * Returns the emoji associated with a task category.
 *
 * @param category Task category key.
 * @returns Display emoji for that category.
 */
export function getCategoryEmoji (category: string): string {
  const emojiMap: Record<string, string> = {
    coding: '💻',
    planning: '🗓️',
    meeting: '🤝',
    research: '🔎',
    admin: '✍️',
    other: '🧩'
  }

  return emojiMap[category] ?? '🧩'
}

// Simple emoji thresholds make dense metrics easier to scan without changing the underlying values.
/**
 * Adds a quick visual cue for unusually high or low metric values.
 *
 * @param label Metric label.
 * @param value Numeric metric value.
 * @returns Emoji hint or an empty string.
 */
export function getMetricEmoji (label: string, value: number): string {
  if ((label === 'Hours logged' && value > 15) || (label === 'Tasks completed' && value > 20)) {
    return '🔥'
  }

  if ((label === 'Hours logged' && value < 5) || (label === 'Tasks completed' && value < 5)) {
    return '🧊'
  }

  return ''
}

/**
 * Formats a metric value while appending any applicable emoji cue.
 *
 * @param label Metric label.
 * @param value Metric value.
 * @returns Display-ready metric text.
 */
export function formatMetricValue (label: string, value: string | number): string {
  if (typeof value === 'string') {
    return value
  }

  const emoji = getMetricEmoji(label, value)

  return emoji === '' ? `${value}` : `${value} ${emoji}`
}

// Search scores are intentionally shown as raw confidence-style values because
// the backend ranking can exceed 1.0 after intent-based boosts.
/**
 * Formats a raw historical-search score for display.
 *
 * @param score Backend search score.
 * @returns Two-decimal score string.
 */
export function formatSearchMatchScore (score: number): string {
  return Number.isFinite(score) ? score.toFixed(2) : '0.00'
}

// Criteria chips show the exact matched terms when available and fall back to
// semantic similarity when the vector result was relevant without token overlap.
/**
 * Builds the search-result criteria chips shown in the landing-page search UI.
 *
 * @param matchedTerms Direct query terms matched by the backend.
 * @returns Criteria chip labels.
 */
export function buildSearchMatchCriteria (matchedTerms: string[]): string[] {
  if (matchedTerms.length === 0) {
    return ['semantic similarity']
  }

  return matchedTerms
}

// Focus buckets drive both filtering and the UI color/emoji system.
/**
 * Buckets a numeric focus score into low, medium, or high.
 *
 * @param focusLevel Numeric focus level from the task.
 * @returns Focus bucket used by filters and colors.
 */
export function getFocusBucket (focusLevel: number): FocusBucket {
  if (focusLevel <= 3) {
    return 'low'
  }

  if (focusLevel <= 7) {
    return 'medium'
  }

  return 'high'
}

/**
 * Converts a focus bucket into its human-readable label.
 *
 * @param focusBucket Focus bucket value.
 * @returns Display label for that bucket.
 */
export function getFocusBucketLabel (focusBucket: FocusBucket): string {
  const labelMap: Record<FocusBucket, string> = {
    low: 'Low Focus',
    medium: 'Medium Focus',
    high: 'High Focus'
  }

  return labelMap[focusBucket]
}

/**
 * Converts a focus bucket into its corresponding emoji cue.
 *
 * @param focusBucket Focus bucket value.
 * @returns Display emoji for that bucket.
 */
export function getFocusBucketEmoji (focusBucket: FocusBucket): string {
  const emojiMap: Record<FocusBucket, string> = {
    low: '💤',
    medium: '⚡',
    high: '🧘‍♂️'
  }

  return emojiMap[focusBucket]
}

/**
 * Sorts tasks by date and title for stable calendar rendering.
 *
 * @param tasks Task list to sort.
 * @returns Sorted copy of the task array.
 */
export function sortTasksChronologically (tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    const leftDate = left.finishDate ?? ''
    const rightDate = right.finishDate ?? ''
    const dateComparison = leftDate.localeCompare(rightDate)

    if (dateComparison !== 0) {
      return dateComparison
    }

    return (left.title ?? '').localeCompare(right.title ?? '')
  })
}

/**
 * Sorts tasks from longest to shortest so the calendar view emphasizes the
 * largest blocks of work first.
 *
 * @param tasks Task list to sort.
 * @returns Sorted copy of the task array.
 */
export function sortTasksByHoursSpent (tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    if (right.hoursSpent !== left.hoursSpent) {
      return right.hoursSpent - left.hoursSpent
    }

    const dateComparison = (left.finishDate ?? '').localeCompare(right.finishDate ?? '')

    if (dateComparison !== 0) {
      return dateComparison
    }

    return (left.title ?? '').localeCompare(right.title ?? '')
  })
}

/**
 * Determines whether a saved summary no longer matches the current task set.
 *
 * @param summary Saved weekly summary, if one exists.
 * @param tasks Current tasks for the same week.
 * @returns `true` when the summary should be regenerated.
 */
export function isWeeklySummaryStale (summary: WeeklySummaryRecord | null | undefined, tasks: TaskRecord[]): boolean {
  if (summary == null) {
    return false
  }

  if (summary.taskSignature != null && summary.taskSignature !== '') {
    return buildTaskSignature(tasks) !== summary.taskSignature
  }

  const summaryGeneratedAt = Date.parse(summary.generatedAt)

  return tasks.some(task => {
    if (task.updatedAt == null) {
      return false
    }

    return Date.parse(task.updatedAt) > summaryGeneratedAt
  })
}

function buildTaskSignature (tasks: TaskRecord[]): string {
  return tasks
    .map(task => `${task.id}:${task.updatedAt ?? ''}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|')
}
