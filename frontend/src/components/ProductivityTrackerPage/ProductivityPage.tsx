import { useLazyQuery, useMutation, useQuery } from '@apollo/client'
import ProjectPage, { getProductivityTrackerEditTaskPath } from 'components/App/ProjectPages'
import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  GENERATE_WEEKLY_SUMMARY_MUTATION,
  GET_WEEKLY_SUMMARY_SEARCH_QUERY,
  GET_TASKS_QUERY,
  GET_WEEKLY_SUMMARY_QUERY
} from 'components/ProductivityTrackerPage/graphql'
import {
  addWeeks,
  buildSearchMatchCriteria,
  categoryOrder,
  FocusBucket,
  formatSearchMatchScore,
  formatMetricValue,
  formatCanonicalWeekLabel,
  formatCategoryLabel,
  formatDateInput,
  buildSummaryMetricItems,
  getCategoryEmoji,
  getFocusBucketEmoji,
  getFocusBucket,
  getFocusBucketLabel,
  getMetricEmoji,
  getWeekDates,
  getWeekRangeForDate,
  isSameWeek,
  parseDateInput,
  parseSummarySuggestion,
  isWeeklySummaryStale,
  sortTasksByHoursSpent,
  TaskCategory,
  TaskRecord,
  WeeklySummaryRecord,
  WeeklySummarySearchResultRecord,
  weekDayLabels
} from 'components/ProductivityTrackerPage/productivityTracker'

import styles from './ProductivityPage.module.css'

// Query response types mirror the GraphQL contract used by the tracker dashboard.
interface TasksQueryResponse {
  tasks: TaskRecord[]
}

// Weekly summary generation returns a paragraph plus a list of next-step suggestions.
interface WeeklySummaryQueryResponse {
  weeklySummary: WeeklySummaryRecord | null
}

// The backend returns a JSON object with a summary paragraph and an array of suggestions.
interface GenerateWeeklySummaryResponse {
  generateWeeklySummary: WeeklySummaryRecord
}

// Search results return a list of matching weekly summaries with their week range and top category.
interface WeeklySummarySearchQueryResponse {
  searchWeeklySummaries: WeeklySummarySearchResultRecord[]
}

// The backend returns a JSON object with a summary paragraph and an array of suggestions.
interface CalendarDayGroup {
  dateKey: string
  dayLabel: string
  calendarLabel: string
  tasks: TaskRecord[]
}

// The chart is built from stacked segments so the chart and tooltip can both explain how that day’s time was distributed.
interface ChartSegment {
  key: string
  label: string
  hours: number
  color: string
}

// A chart day represents a day in the calendar view with its associated tasks and time distribution.
interface ChartDay {
  key: string
  dayLabel: string
  totalHours: number
  taskCount: number
  segments: ChartSegment[]
}

// Enumerate calendar view and week at a glance view as the two display modes for the tracker page.
type DisplayMode = 'glance' | 'calendar'

// Enumerate filters for the current dashboard lens.
type FilterMode = 'category' | 'focus'

// Enumerate task categories and focus buckets in a consistent order for rendering filters and chart segments.
const focusBucketOrder: FocusBucket[] = ['low', 'medium', 'high']

const categoryColors: Record<TaskCategory, string> = {
  coding: '#795df9',
  planning: '#53b89e',
  meeting: '#eb29aaff',
  research: '#eae73dff',
  admin: '#ff7c7c',
  other: '#8493a3'
}

const focusColors: Record<FocusBucket, string> = {
  low: '#ff7c7c',
  medium: '#f2c94c',
  high: '#34a853'
}

const summarySearchDiscoveryQuery = 'week'

/**
 * Renders the main productivity tracker dashboard.
 *
 * @returns Weekly dashboard with summary generation and historical search.
 */
const ProductivityPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = React.useMemo(() => new Date(), [])
  const selectedDateParam = searchParams.get('date')
  const [selectedDate, setSelectedDate] = React.useState(() => parseDateInput(selectedDateParam) ?? today)
  const [displayMode, setDisplayMode] = React.useState<DisplayMode>('glance')
  const [filterMode, setFilterMode] = React.useState<FilterMode>('category')
  const [selectedCategories, setSelectedCategories] = React.useState<TaskCategory[]>(categoryOrder)
  const [selectedFocusBuckets, setSelectedFocusBuckets] = React.useState<FocusBucket[]>(focusBucketOrder)
  const [searchText, setSearchText] = React.useState('')
  const [submittedSearchTerm, setSubmittedSearchTerm] = React.useState('')
  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const [activeChartKey, setActiveChartKey] = React.useState<string | null>(null)
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null)
  const weekDates = React.useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekRange = React.useMemo(() => getWeekRangeForDate(selectedDate), [selectedDate])
  const isViewingCurrentWeek = React.useMemo(() => isSameWeek(selectedDate, today), [selectedDate, today])

  // Tasks and summaries are fetched independently so task failures do not mask
  // summary errors and summary generation can refetch cleanly.
  const {
    data: tasksData,
    loading: tasksLoading,
    error: tasksError
  } = useQuery<TasksQueryResponse>(GET_TASKS_QUERY, {
    variables: weekRange
  })
  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError
  } = useQuery<WeeklySummaryQueryResponse>(GET_WEEKLY_SUMMARY_QUERY, {
    variables: weekRange,
    skip: tasksError != null
  })
  const [generateWeeklySummary, { loading: generateLoading, error: generateError }] = useMutation<
  GenerateWeeklySummaryResponse,
  { weekStart: string, weekEnd: string }
  >(GENERATE_WEEKLY_SUMMARY_MUTATION)
  const [
    checkSearchAvailability,
    {
      data: searchAvailabilityData,
      loading: searchAvailabilityLoading,
      error: searchAvailabilityError,
      called: searchAvailabilityCalled
    }
  ] = useLazyQuery<
  WeeklySummarySearchQueryResponse,
  { query: string }
  >(GET_WEEKLY_SUMMARY_SEARCH_QUERY, {
    fetchPolicy: 'no-cache'
  })
  const [
    runWeeklySummarySearch,
    {
      data: searchData,
      loading: searchLoading,
      error: searchError
    }
  ] = useLazyQuery<
  WeeklySummarySearchQueryResponse,
  { query: string }
  >(GET_WEEKLY_SUMMARY_SEARCH_QUERY, {
    fetchPolicy: 'no-cache'
  })

  const weeklyTasks = React.useMemo(() => tasksData?.tasks ?? [], [tasksData?.tasks])
  const weeklySummary = summaryData?.weeklySummary ?? null
  const summaryIsStale = isWeeklySummaryStale(weeklySummary, weeklyTasks)
  const searchResults = searchData?.searchWeeklySummaries ?? []
  const hasSearchableSummaries = (searchAvailabilityData?.searchWeeklySummaries.length ?? 0) > 0
  const generatedSummaryDate = weeklySummary == null
    ? null
    : new Date(weeklySummary.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const visibleTasks = React.useMemo(() => {
    // The same dataset can be filtered either by task category or by derived
    // focus buckets depending on the lens selected above the chart.
    if (filterMode === 'category') {
      return weeklyTasks.filter(task => selectedCategories.includes(task.category))
    }

    return weeklyTasks.filter(task => selectedFocusBuckets.includes(getFocusBucket(task.focusLevel)))
  }, [filterMode, selectedCategories, selectedFocusBuckets, weeklyTasks])

  const filteredTaskCount = visibleTasks.length
  const filteredHours = React.useMemo(() => Number(visibleTasks.reduce((sum, task) => sum + task.hoursSpent, 0).toFixed(1)), [visibleTasks])
  // These totals stay week-wide regardless of the active chart filter so the
  // top summary strip always answers "how did the week go overall?"
  const totalTaskCount = weeklyTasks.length
  const totalHours = React.useMemo(() => Number(weeklyTasks.reduce((sum, task) => sum + task.hoursSpent, 0).toFixed(1)), [weeklyTasks])
  const totalFocusLevel = React.useMemo(() => {
    if (weeklyTasks.length === 0) {
      return 0
    }

    return Number((weeklyTasks.reduce((sum, task) => sum + task.focusLevel, 0) / weeklyTasks.length).toFixed(1))
  }, [weeklyTasks])
  const totalHoursEmoji = tasksLoading ? '' : getMetricEmoji('Hours logged', totalHours)
  const totalFocusEmoji = totalTaskCount === 0 ? '' : getFocusBucketEmoji(getFocusBucket(totalFocusLevel))
  const totalTasksValue = tasksLoading ? '...' : formatMetricValue('Tasks completed', totalTaskCount)
  const totalHoursValue = tasksLoading
    ? '...'
    : `${totalHours}h${totalHoursEmoji === '' ? '' : ` ${totalHoursEmoji}`}`
  const totalFocusValue = tasksLoading
    ? '...'
    : `${totalFocusLevel}/10${totalFocusEmoji === '' ? '' : ` ${totalFocusEmoji}`}`
  const totalTopCategory = React.useMemo(() => getTopCategory(weeklyTasks), [weeklyTasks])
  const topCategory = React.useMemo(() => {
    return getTopCategory(visibleTasks)
  }, [visibleTasks])
  // These values stay filter-aware because the chart row should mirror the
  // currently selected category or focus lens.
  const visibleTasksValue = tasksLoading ? '...' : `${filteredTaskCount}`
  const visibleHoursValue = tasksLoading
    ? '...'
    : `${filteredHours}h`

  const chartDays = React.useMemo<ChartDay[]>(() => {
    // Each chart bar is built from stacked segments so the chart and tooltip
    // can give visibility into how that day's time was distributed. 
    return weekDates.map((date, index) => {
      const dateKey = formatDateInput(date)
      const tasksForDay = visibleTasks.filter(task => task.finishDate === dateKey)
      const totalHours = Number(tasksForDay.reduce((sum, task) => sum + task.hoursSpent, 0).toFixed(1))
      const segments = buildChartSegments(tasksForDay, filterMode, selectedCategories, selectedFocusBuckets)

      return {
        key: dateKey,
        dayLabel: weekDayLabels[index],
        totalHours,
        taskCount: tasksForDay.length,
        segments
      }
    })
  }, [filterMode, selectedCategories, selectedFocusBuckets, visibleTasks, weekDates])

  const maxChartHours = React.useMemo(() => Math.max(...chartDays.map(day => day.totalHours), 0), [chartDays])

  const calendarDays = React.useMemo<CalendarDayGroup[]>(() => {
    // Calendar mode is for raw task visibility so users can see what they actually did each day. 
    return weekDates.map((date, index) => {
      const dateKey = formatDateInput(date)

      return {
        dateKey,
        dayLabel: weekDayLabels[index],
        calendarLabel: new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tasks: sortTasksByHoursSpent(visibleTasks.filter(task => task.finishDate === dateKey))
      }
    })
  }, [visibleTasks, weekDates])

  const summaryStateMessage = React.useMemo(() => {
    if (tasksLoading) {
      return 'Loading completed tasks for the selected week.'
    }

    if (tasksError != null) {
      return 'The weekly summary is unavailable right now because tasks could not be loaded from the backend.'
    }

    if (weeklyTasks.length === 0) {
      return `No completed tasks were logged for ${formatCanonicalWeekLabel(weekRange.weekStart, weekRange.weekEnd)}.`
    }

    if (summaryLoading && weeklySummary == null) {
      return 'Checking whether a saved weekly summary already exists for this week.'
    }

    if (summaryError != null) {
      return 'We could not load the saved summary for this week. You can try generating a fresh one below.'
    }

    if (weeklySummary == null) {
      return 'No AI summary has been generated for this week yet. Generate one when you want a one-paragraph recap plus next-step suggestions.'
    }

    if (summaryIsStale) {
      return 'Tasks changed after the latest summary was generated. Regenerate it to keep the paragraph and suggestions aligned with the selected week.'
    }

    return null
  }, [summaryError, summaryIsStale, summaryLoading, tasksError, tasksLoading, weekRange.weekEnd, weekRange.weekStart, weeklySummary, weeklyTasks.length])

  const filterSummary = filterMode === 'category'
    ? selectedCategories.map(formatCategoryLabel).join(', ')
    : selectedFocusBuckets.map(getFocusBucketLabel).join(', ')

  const emptyFilteredState = weeklyTasks.length > 0 && filteredTaskCount === 0
  const normalizedSearchText = searchText.trim()

  React.useEffect(() => {
    if (selectedDateParam !== weekRange.weekStart) {
      setSearchParams({ date: weekRange.weekStart }, { replace: true })
    }
  }, [selectedDateParam, setSearchParams, weekRange.weekStart])

  React.useEffect(() => {
    if (normalizedSearchText !== '') {
      return
    }

    setSubmittedSearchTerm('')
  }, [normalizedSearchText])

  React.useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent): void => {
      if (searchContainerRef.current?.contains(event.target as Node) === true) {
        return
      }

      setIsSearchOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('touchstart', handleOutsideInteraction)

    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('touchstart', handleOutsideInteraction)
    }
  }, [isSearchOpen])

  const handleGenerateSummary = async (): Promise<void> => {
    await generateWeeklySummary({
      variables: weekRange,
      refetchQueries: [{ query: GET_WEEKLY_SUMMARY_QUERY, variables: weekRange }],
      awaitRefetchQueries: true
    })

    if (searchAvailabilityCalled) {
      void checkSearchAvailability({
        variables: {
          query: summarySearchDiscoveryQuery
        }
      })
    }
  }

  const ensureSearchAvailability = (): void => {
    if (!searchAvailabilityCalled) {
      void checkSearchAvailability({
        variables: {
          query: summarySearchDiscoveryQuery
        }
      })
    }
  }

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    ensureSearchAvailability()
    setIsSearchOpen(true)

    if (normalizedSearchText === '') {
      return
    }

    setSubmittedSearchTerm(normalizedSearchText)

    await runWeeklySummarySearch({
      variables: {
        query: normalizedSearchText
      }
    })
  }

  const handleSelectWeek = (nextDate: Date): void => {
    setSelectedDate(nextDate)
    setIsSearchOpen(false)
  }

  const handleSelectSearchResult = (result: WeeklySummarySearchResultRecord): void => {
    const nextDate = parseDateInput(result.weeklySummary.weekStart)

    if (nextDate != null) {
      handleSelectWeek(nextDate)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Productivity Tracker</h1>
          <p className={styles.subtitle}>
            Track your tasking and get full visibility into what you&apos;ve accomplished this week.
          </p>
          <div className={styles.titleActions}>
            <Link className={styles.actionButtonPrimary} to={ProjectPage.ProductivityTrackerAddTask}>
              Log task
            </Link>
          </div>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.weekSelector} aria-label='Week selector'>
            <button
              className={styles.iconButton}
              type='button'
              onClick={() => handleSelectWeek(addWeeks(selectedDate, -1))}
              aria-label='View previous week'
            >
              <span aria-hidden='true'>&larr;</span>
            </button>

            <div className={styles.weekRangeCard}>
              <span className={styles.weekRangeLabel}>Week</span>
              <span className={styles.weekRangeValue}>{formatCanonicalWeekLabel(weekRange.weekStart, weekRange.weekEnd)}</span>
            </div>

            <button
              className={styles.iconButton}
              type='button'
              onClick={() => handleSelectWeek(addWeeks(selectedDate, 1))}
              aria-label='View next week'
            >
              <span aria-hidden='true'>&rarr;</span>
            </button>

            {!isViewingCurrentWeek && (
              <button className={styles.actionButton} type='button' onClick={() => handleSelectWeek(today)}>
                This week
              </button>
            )}
          </div>

          <div className={styles.primaryActions}>
            <div className={styles.searchShell} ref={searchContainerRef}>
              <form className={styles.searchForm} onSubmit={(event) => { void handleSearchSubmit(event) }}>
                <label className={styles.searchField}>
                  <span className={styles.searchLabel}>Search saved weeks</span>
                  <input
                    className={styles.searchInput}
                    type='search'
                    aria-label='Search saved summaries'
                    placeholder='Search saved weekly summaries'
                    value={searchText}
                    onFocus={() => {
                      setIsSearchOpen(true)
                      ensureSearchAvailability()
                    }}
                    onChange={event => {
                      setSearchText(event.target.value)
                      setIsSearchOpen(true)
                    }}
                  />
                </label>

                {searchText !== '' && (
                  <button
                    className={styles.searchUtilityButton}
                    type='button'
                    onClick={() => {
                      setSearchText('')
                      setSubmittedSearchTerm('')
                      setIsSearchOpen(false)
                    }}
                    aria-label='Clear search'
                  >
                    Clear
                  </button>
                )}

                <button className={styles.searchSubmitButton} type='submit'>
                  Search
                </button>
              </form>

              {isSearchOpen && (
                <div className={styles.searchDropdown}>
                  {searchAvailabilityLoading && <p className={styles.searchState}>Checking saved weekly summaries...</p>}

                  {searchAvailabilityError != null && <p className={styles.searchStateError}>{searchAvailabilityError.message}</p>}

                  {!searchAvailabilityLoading && searchAvailabilityError == null && searchAvailabilityCalled && !hasSearchableSummaries && (
                    <div className={styles.searchEmptyState}>
                      <p className={styles.searchEmptyTitle}>No summaries yet</p>
                      <p className={styles.searchEmptyCopy}>
                        Generate a weekly summary from Week at a Glance to make that week searchable here.
                      </p>
                    </div>
                  )}

                  {!searchAvailabilityLoading && searchAvailabilityError == null && hasSearchableSummaries && submittedSearchTerm === '' && (
                    <p className={styles.searchState}>
                      Search saved summaries by category, focus pattern, or workload, then jump straight into that week.
                    </p>
                  )}

                  {!searchAvailabilityLoading && hasSearchableSummaries && submittedSearchTerm !== '' && searchLoading && (
                    <p className={styles.searchState}>Searching saved weekly summaries...</p>
                  )}

                  {!searchAvailabilityLoading && hasSearchableSummaries && submittedSearchTerm !== '' && searchError != null && (
                    <p className={styles.searchStateError}>{searchError.message}</p>
                  )}

                  {!searchAvailabilityLoading && hasSearchableSummaries && submittedSearchTerm !== '' && searchError == null && !searchLoading && searchResults.length === 0 && (
                    <div className={styles.searchEmptyState}>
                      <p className={styles.searchEmptyTitle}>No matching weeks</p>
                      <p className={styles.searchEmptyCopy}>
                        No saved weeks matched &quot;{submittedSearchTerm}&quot;. Try a category like coding or a pattern like high focus.
                      </p>
                    </div>
                  )}

                  {!searchAvailabilityLoading && hasSearchableSummaries && submittedSearchTerm !== '' && searchError == null && !searchLoading && searchResults.length > 0 && (
                    <div className={styles.searchResultsList}>
                      {searchResults.map(result => {
                        const weekLabel = formatCanonicalWeekLabel(result.weeklySummary.weekStart, result.weeklySummary.weekEnd)
                        const matchCriteria = buildSearchMatchCriteria(result.matchedTerms)

                        return (
                          <button
                            key={`${result.weeklySummary.weekStart}:${result.weeklySummary.weekEnd}`}
                            className={styles.searchResultButton}
                            type='button'
                            onClick={() => handleSelectSearchResult(result)}
                            aria-label={`Open week ${weekLabel}`}
                          >
                            <div className={styles.searchResultHeader}>
                              <span className={styles.searchResultWeek}>{weekLabel}</span>
                              <span className={styles.searchResultBadge}>
                                {formatCategoryLabel(result.weeklySummary.metrics.topCategory)}
                              </span>
                            </div>
                            <div className={styles.searchResultMeta}>
                              <span className={styles.searchResultScore}>
                                Match score {formatSearchMatchScore(result.score)}
                              </span>
                            </div>
                            <div className={styles.searchResultTerms}>
                              {matchCriteria.map(term => (
                                <span key={`${result.weeklySummary.weekStart}:${term}`} className={styles.searchResultTerm}>
                                  {term}
                                </span>
                              ))}
                            </div>
                            <p className={styles.searchResultPreview}>{result.weeklySummary.summaryParagraph}</p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.stage}>
        <div className={styles.stageHeader}>
          <div className={styles.stageHeaderLeft}>
            <div className={styles.toggleRail} role='tablist' aria-label='Tracker display mode'>
              <button
                className={displayMode === 'glance' ? styles.toggleActive : styles.toggleButton}
                type='button'
                onClick={() => setDisplayMode('glance')}
              >
                Week at a Glance
              </button>
              <button
                className={displayMode === 'calendar' ? styles.toggleActive : styles.toggleButton}
                type='button'
                onClick={() => setDisplayMode('calendar')}
              >
                Calendar view
              </button>
            </div>

          </div>

          <div className={styles.filterStack}>
            <div className={styles.filterModeRail}>
              <button
                className={filterMode === 'category' ? styles.filterModeActive : styles.filterModeButton}
                type='button'
                onClick={() => setFilterMode('category')}
              >
                Category
              </button>
              <button
                className={filterMode === 'focus' ? styles.filterModeActive : styles.filterModeButton}
                type='button'
                onClick={() => setFilterMode('focus')}
              >
                Focus level
              </button>
            </div>

            <div className={styles.filterTokens}>
              {filterMode === 'category' && categoryOrder.map(category => {
                const isSelected = selectedCategories.includes(category)

                return (
                  <button
                    key={category}
                    className={isSelected ? styles.filterTokenActive : styles.filterToken}
                    type='button'
                    onClick={() => setSelectedCategories(toggleSelection(selectedCategories, categoryOrder, category))}
                  >
                    <span className={styles.tokenDot} style={{ backgroundColor: categoryColors[category] }} />
                    {formatCategoryLabel(category)}
                  </button>
                )
              })}

              {filterMode === 'focus' && focusBucketOrder.map(focusBucket => {
                const isSelected = selectedFocusBuckets.includes(focusBucket)

                return (
                  <button
                    key={focusBucket}
                    className={isSelected ? styles.filterTokenActive : styles.filterToken}
                    type='button'
                    onClick={() => setSelectedFocusBuckets(toggleSelection(selectedFocusBuckets, focusBucketOrder, focusBucket))}
                  >
                    <span className={styles.tokenDot} style={{ backgroundColor: focusColors[focusBucket] }} />
                    {getFocusBucketLabel(focusBucket)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className={styles.stageMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total tasks</span>
            <span className={styles.metaValue}>{totalTasksValue}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total hours</span>
            <span className={styles.metaValue}>{totalHoursValue}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Focus level</span>
            <span className={styles.metaValue}>{totalFocusValue}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Top category</span>
            <span className={styles.metaValue}>{tasksLoading ? '...' : totalTopCategory == null ? 'None yet' : formatCategoryLabel(totalTopCategory)}</span>
          </div>
        </div>

        {tasksLoading && <p className={styles.stateCard}>Loading selected-week tasks...</p>}
        {tasksError != null && <p className={styles.stateCard}>Unable to load tasks for this week right now.</p>}

        {!tasksLoading && tasksError == null && weeklyTasks.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No completed tasks in this week yet.</p>
            <p className={styles.emptyCopy}>
              {isViewingCurrentWeek
                ? 'Use Log task to start building this week’s calendar and summary.'
                : 'Try another week or jump back to the current week to review recent completed work.'}
            </p>
          </div>
        )}

        {!tasksLoading && tasksError == null && emptyFilteredState && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No tasks match the current filter.</p>
            <p className={styles.emptyCopy}>
              Expand the selected {filterMode === 'category' ? 'categories' : 'focus levels'} to bring tasks back into view.
            </p>
          </div>
        )}

        {!tasksLoading && tasksError == null && weeklyTasks.length > 0 && !emptyFilteredState && (
          <div className={styles.stageBody}>
            {displayMode === 'glance' && (
              <div className={styles.glanceLayout}>
                <section className={styles.chartPanel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <p className={styles.panelLabel}>Week at a Glance</p>
                      <h2 className={styles.panelTitle}>Filtered productivity trend</h2>
                    </div>
                    <span className={styles.panelTag}>{filterMode === 'category' ? 'Color by category' : 'Color by focus level'}</span>
                  </div>

                  <div className={styles.chartGrid}>
                    {chartDays.map(day => {
                      const columnHeight = maxChartHours === 0 ? 18 : Math.max(18, Math.round((day.totalHours / maxChartHours) * 220))

                      return (
                        <div key={day.key} className={styles.chartColumn}>
                          <span className={styles.chartTotal}>{day.totalHours.toFixed(1)}h</span>
                          <div className={styles.chartTrack}>
                            <button
                              className={styles.chartBarButton}
                              type='button'
                              aria-label={`Show breakdown for ${day.dayLabel}`}
                              onMouseEnter={() => setActiveChartKey(day.key)}
                              onMouseLeave={() => setActiveChartKey(currentKey => (currentKey === day.key ? null : currentKey))}
                              onFocus={() => setActiveChartKey(day.key)}
                              onBlur={() => setActiveChartKey(currentKey => (currentKey === day.key ? null : currentKey))}
                            >
                              <div className={styles.chartStack} style={{ height: `${columnHeight}px` }}>
                                {day.segments.map(segment => {
                                  const segmentHeight = day.totalHours === 0 ? 0 : (segment.hours / day.totalHours) * 100

                                  return (
                                    <span
                                      key={segment.key}
                                      className={styles.chartSegment}
                                      style={{
                                        height: `${segmentHeight}%`,
                                        backgroundColor: segment.color
                                      }}
                                    />
                                  )
                                })}
                              </div>

                              {activeChartKey === day.key && (
                                <div className={styles.chartTooltip} role='tooltip'>
                                  <p className={styles.chartTooltipTitle}>{day.dayLabel} · {day.totalHours.toFixed(1)}h</p>

                                  {day.segments.length === 0 && (
                                    <p className={styles.chartTooltipEmpty}>No completed work in this view.</p>
                                  )}

                                  {day.segments.length > 0 && (
                                    <ul className={styles.chartTooltipList}>
                                      {day.segments.map(segment => {
                                        const tooltipEmoji = filterMode === 'category'
                                          ? getCategoryEmoji(segment.key)
                                          : getFocusBucketEmoji(segment.key as FocusBucket)
                                        const proportion = Number(((segment.hours / day.totalHours) * 100).toFixed(1))

                                        return (
                                          <li key={segment.key} className={styles.chartTooltipItem}>
                                            <span className={styles.chartTooltipItemLabel}>{tooltipEmoji} {segment.label}</span>
                                            <span className={styles.chartTooltipItemValue}>{proportion}% · {segment.hours}h</span>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </button>
                          </div>
                          <span className={styles.chartDay}>{day.dayLabel}</span>
                          <span className={styles.chartFoot}>{day.taskCount} task{day.taskCount === 1 ? '' : 's'}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className={styles.chartSummaryMeta}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Visible tasks</span>
                      <span className={styles.metaValue}>{visibleTasksValue}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Visible hours</span>
                      <span className={styles.metaValue}>{visibleHoursValue}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Top category</span>
                      <span className={styles.metaValue}>{tasksLoading ? '...' : topCategory == null ? 'None yet' : formatCategoryLabel(topCategory)}</span>
                    </div>
                    <div className={styles.metaItemWide}>
                      <span className={styles.metaLabel}>Current filter</span>
                      <span className={styles.metaValue}>{filterSummary === '' ? 'Nothing selected' : filterSummary}</span>
                    </div>
                  </div>
                </section>

                <section className={styles.summaryPanel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <p className={styles.panelLabel}>AI Summary</p>
                      <h2 className={styles.panelTitle}>Weekly summary</h2>
                      {weeklySummary != null && <p className={styles.summaryMeta}>Generated {generatedSummaryDate}</p>}
                    </div>
                    {weeklyTasks.length > 0 && (
                      <button
                        className={styles.generateButton}
                        type='button'
                        onClick={() => { void handleGenerateSummary() }}
                        disabled={generateLoading || tasksLoading}
                      >
                        {generateLoading ? 'Generating...' : weeklySummary == null ? 'Generate summary' : 'Regenerate summary'}
                      </button>
                    )}
                  </div>

                  {summaryStateMessage != null && <p className={styles.summaryState}>{summaryStateMessage}</p>}
                  {generateError != null && <p className={styles.summaryError}>{generateError.message}</p>}

                  {weeklySummary != null && (
                    <>
                      <div className={styles.summaryMetrics}>
                        {buildSummaryMetricItems(weeklySummary).map(item => (
                          <p key={item.label} className={styles.summaryMetric}>
                            <strong>{item.label}:</strong> {item.value}
                          </p>
                        ))}
                      </div>

                      <p className={styles.summaryParagraph}>{weeklySummary.summaryParagraph}</p>

                      <div className={styles.summarySuggestionsSection}>
                        <p className={styles.summarySuggestionsTitle}>Suggestions</p>
                        <ul className={styles.summaryList}>
                          {weeklySummary.suggestions.map(suggestion => {
                            const suggestionParts = parseSummarySuggestion(suggestion)

                            return (
                              <li key={suggestion} className={styles.summaryListItem}>
                                <strong className={styles.summarySuggestionLead}>{suggestionParts.lead}</strong>
                                {suggestionParts.detail !== '' && (
                                  <span className={styles.summarySuggestionDetail}>: {suggestionParts.detail}</span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {displayMode === 'calendar' && (
              <section className={styles.calendarPanel}>
                <div className={styles.panelHeading}>
                  <div>
                    <p className={styles.panelLabel}>Calendar View</p>
                    <h2 className={styles.panelTitle}>Monday through Sunday task log</h2>
                  </div>
                  <span className={styles.panelTag}>Sorted by hours spent. Click any task to edit it.</span>
                </div>

                <div className={styles.calendarScroller}>
                  <div className={styles.calendarGrid}>
                    {calendarDays.map(day => (
                      <section key={day.dateKey} className={styles.calendarDay}>
                        <div className={styles.calendarDayHeader}>
                          <span className={styles.calendarDayName}>{day.dayLabel}</span>
                          <span className={styles.calendarDayDate}>{day.calendarLabel}</span>
                        </div>

                        {day.tasks.length === 0 && <p className={styles.calendarEmpty}>No completed tasks</p>}

                        {day.tasks.length > 0 && (
                          <div className={styles.calendarTaskList}>
                            {day.tasks.map(task => {
                              const accentColor = filterMode === 'category'
                                ? categoryColors[task.category]
                                : focusColors[getFocusBucket(task.focusLevel)]

                              return (
                                <Link
                                  key={task.id}
                                  className={`${styles.calendarTask} ${styles.calendarTaskLink}`}
                                  to={getProductivityTrackerEditTaskPath(task.id)}
                                  state={{ task }}
                                  style={{ borderLeftColor: accentColor }}
                                >
                                  <p className={styles.calendarTaskTitle}>{task.title}</p>
                                  <p className={styles.calendarTaskMeta}>
                                    {task.hoursSpent}h · {formatCategoryLabel(task.category)} · {getFocusBucketLabel(getFocusBucket(task.focusLevel))}
                                  </p>
                                  <p className={styles.calendarTaskMeta}>{task.finishDate}</p>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

/**
 * Builds the stacked chart segments for one day based on the active filter
 * mode and visible filters.
 *
 * @param tasks Visible tasks for one calendar day.
 * @param filterMode Active segmentation mode.
 * @param selectedCategories Visible task categories.
 * @param selectedFocusBuckets Visible focus buckets.
 * @returns Stacked chart segments for that day.
 */
function buildChartSegments (
  tasks: TaskRecord[],
  filterMode: FilterMode,
  selectedCategories: TaskCategory[],
  selectedFocusBuckets: FocusBucket[]
): ChartSegment[] {
  if (filterMode === 'category') {
    return selectedCategories
      .map(category => {
        const hours = Number(tasks
          .filter(task => task.category === category)
          .reduce((sum, task) => sum + task.hoursSpent, 0)
          .toFixed(1))

        return {
          key: category,
          label: formatCategoryLabel(category),
          hours,
          color: categoryColors[category]
        }
      })
      .filter(segment => segment.hours > 0)
  }

  return selectedFocusBuckets
    .map(focusBucket => {
      const hours = Number(tasks
        .filter(task => getFocusBucket(task.focusLevel) === focusBucket)
        .reduce((sum, task) => sum + task.hoursSpent, 0)
        .toFixed(1))

      return {
        key: focusBucket,
        label: getFocusBucketLabel(focusBucket),
        hours,
        color: focusColors[focusBucket]
      }
    })
    .filter(segment => segment.hours > 0)
}

/**
 * Finds the dominant category in a task subset.
 *
 * @param tasks Task list to inspect.
 * @returns Dominant category or `null` when no tasks exist.
 */
function getTopCategory (tasks: TaskRecord[]): string | null {
  const counts = tasks.reduce<Record<string, number>>((accumulator, task) => {
    accumulator[task.category] = (accumulator[task.category] ?? 0) + 1
    return accumulator
  }, {})

  return Object.entries(counts).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })[0]?.[0] ?? null
}

/**
 * Toggles one value in a multi-select filter while preserving the canonical
 * display order of the selected items.
 *
 * @template T Filter value type.
 * @param current Currently selected values.
 * @param order Canonical display order.
 * @param value Value to toggle.
 * @returns Updated selection list.
 */
function toggleSelection<T extends string> (current: T[], order: T[], value: T): T[] {
  if (current.includes(value)) {
    return current.filter(item => item !== value)
  }

  return order.filter(item => current.includes(item) || item === value)
}

export default ProductivityPage
