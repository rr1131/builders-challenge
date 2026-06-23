// The tracker treats Monday as the start of the reporting week everywhere.
/**
 * Normalizes a date to the Monday that starts its reporting week.
 *
 * @param date Any date inside the desired reporting week.
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
 * Expands a date into the seven calendar dates shown for its reporting week.
 *
 * @param date Any date inside the desired reporting week.
 * @returns Ordered array from Monday through Sunday.
 */
export function getWeekDates (date: Date): Date[] {
  const weekStart = getWeekStart(date)

  // Expand one anchor date into the exact seven dates rendered by the UI.
  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(weekStart)
    nextDate.setDate(weekStart.getDate() + index)
    return nextDate
  })
}

/**
 * Formats a `Date` into the `YYYY-MM-DD` shape used by storage and GraphQL.
 *
 * @param date Date to serialize.
 * @returns Date string in input-friendly format.
 */
export function formatDateInput (date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * Converts a stored date string into its weekday label for summaries.
 *
 * @param dateValue Date string in `YYYY-MM-DD` format.
 * @returns Weekday name in the current locale.
 */
export function formatWeekdayName (dateValue: string): string {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}
