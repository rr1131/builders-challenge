import fs from 'fs'
import os from 'os'
import path from 'path'

import * as anthropicService from './anthropicService'
import { readJsonFile } from './storage'
import { createTask } from './taskService'
import {
  computeWeeklySummaryMetrics,
  generateWeeklySummary,
  getWeeklySummary,
  invalidateWeeklySummary,
  invalidateWeeklySummariesForDateValues
} from './weeklySummaryService'
import { searchWeeklySummaries, WeeklySummarySearchDocument } from './weeklySummarySearchService'

// These tests verify deterministic metrics, summary persistence, and index sync.
describe('weeklySummaryService', () => {
  const originalDataDirectory = process.env.PRODUCTIVITY_DATA_DIR
  let testDataDirectory: string

  beforeEach(() => {
    testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-summary-data-'))
    process.env.PRODUCTIVITY_DATA_DIR = testDataDirectory
  })

  afterEach(() => {
    if (originalDataDirectory === undefined) {
      delete process.env.PRODUCTIVITY_DATA_DIR
    } else {
      process.env.PRODUCTIVITY_DATA_DIR = originalDataDirectory
    }

    fs.rmSync(testDataDirectory, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  test('computes deterministic weekly metrics', () => {
    const metrics = computeWeeklySummaryMetrics([
      createTask(buildTaskInput({ title: 'Coding 1', finishDate: '2026-06-16', category: 'coding', hoursSpent: 2, focusLevel: 8 })),
      createTask(buildTaskInput({ title: 'Coding 2', finishDate: '2026-06-16', category: 'coding', hoursSpent: 1, focusLevel: 6 })),
      createTask(buildTaskInput({ title: 'Planning', finishDate: '2026-06-18', category: 'planning', hoursSpent: 3, focusLevel: 7 }))
    ])

    expect(metrics).toEqual({
      taskCount: 3,
      totalHours: 6,
      averageFocusLevel: 7,
      topCategory: 'coding',
      busiestDay: 'Tuesday'
    })
  })

  test('generates and persists a weekly summary', async () => {
    createTask(buildTaskInput({ title: 'Coding 1', finishDate: '2026-06-17', category: 'coding', hoursSpent: 2, focusLevel: 8 }))
    jest.spyOn(anthropicService, 'generateSummaryContent').mockResolvedValue({
      summaryParagraph: 'This week featured focused coding work and steady execution.',
      suggestions: ['Keep protecting deep work blocks.', 'Front-load the highest-focus tasks.']
    })

    const summary = await generateWeeklySummary('2026-06-15', '2026-06-21')

    expect(summary.summaryParagraph).toContain('focused coding work')
    expect(summary.suggestions).toHaveLength(2)
    expect(getWeeklySummary('2026-06-15', '2026-06-21')?.summaryParagraph).toBe(summary.summaryParagraph)

    const searchIndex = readJsonFile<WeeklySummarySearchDocument[]>('weeklySummarySearchIndex.json', [])
    expect(searchIndex).toHaveLength(1)
    expect(searchIndex[0].id).toBe('2026-06-15:2026-06-21')
    expect(searchIndex[0].searchText).toContain('coding')
  })

  test('regenerating a summary overwrites the stored week entry', async () => {
    createTask(buildTaskInput({ title: 'Coding 1', finishDate: '2026-06-17', category: 'coding', hoursSpent: 2, focusLevel: 8 }))
    const mockGenerateSummaryContent = jest.spyOn(anthropicService, 'generateSummaryContent')

    mockGenerateSummaryContent.mockResolvedValueOnce({
      summaryParagraph: 'First version of the summary.',
      suggestions: ['Keep deep work protected.', 'Review planning time on Friday.']
    })

    await generateWeeklySummary('2026-06-15', '2026-06-21')

    mockGenerateSummaryContent.mockResolvedValueOnce({
      summaryParagraph: 'Second version of the summary.',
      suggestions: ['Front-load coding work.', 'Reserve one admin block.']
    })

    const refreshedSummary = await generateWeeklySummary('2026-06-15', '2026-06-21')

    expect(refreshedSummary.summaryParagraph).toBe('Second version of the summary.')
    expect(getWeeklySummary('2026-06-15', '2026-06-21')?.summaryParagraph).toBe('Second version of the summary.')
  })

  test('rejects generating a summary with no tasks', async () => {
    await expect(generateWeeklySummary('2026-06-15', '2026-06-21'))
      .rejects
      .toThrow('Cannot generate a weekly summary without completed tasks in the selected week.')
  })

  test('invalidates a stored summary and removes it from search', async () => {
    createTask(buildTaskInput({ title: 'Coding 1', finishDate: '2026-06-17', category: 'coding', hoursSpent: 2, focusLevel: 8 }))
    jest.spyOn(anthropicService, 'generateSummaryContent').mockResolvedValue({
      summaryParagraph: 'This week featured focused coding work and steady execution.',
      suggestions: ['Keep protecting deep work blocks.', 'Front-load the highest-focus tasks.']
    })

    await generateWeeklySummary('2026-06-15', '2026-06-21')

    expect((await searchWeeklySummaries('coding focus')).map(result => result.weeklySummary.weekStart)).toContain('2026-06-15')

    const didInvalidate = await invalidateWeeklySummary('2026-06-15', '2026-06-21')

    expect(didInvalidate).toBe(true)
    expect(getWeeklySummary('2026-06-15', '2026-06-21')).toBeNull()
    expect(readJsonFile<WeeklySummarySearchDocument[]>('weeklySummarySearchIndex.json', [])).toHaveLength(0)
    expect(await searchWeeklySummaries('coding focus')).toHaveLength(0)
  })

  test('deduplicates affected weeks when invalidating summaries from task dates', async () => {
    createTask(buildTaskInput({ title: 'Coding 1', finishDate: '2026-06-17', category: 'coding', hoursSpent: 2, focusLevel: 8 }))
    jest.spyOn(anthropicService, 'generateSummaryContent').mockResolvedValue({
      summaryParagraph: 'This week featured focused coding work and steady execution.',
      suggestions: ['Keep protecting deep work blocks.', 'Front-load the highest-focus tasks.']
    })

    await generateWeeklySummary('2026-06-15', '2026-06-21')

    const didInvalidate = await invalidateWeeklySummariesForDateValues(['2026-06-17', '2026-06-18'])

    expect(didInvalidate).toBe(true)
    expect(getWeeklySummary('2026-06-15', '2026-06-21')).toBeNull()
  })

  test('treats invalidation with no stored summary as a no-op', async () => {
    const didInvalidate = await invalidateWeeklySummariesForDateValues(['2026-06-17'])

    expect(didInvalidate).toBe(false)
    expect(readJsonFile<WeeklySummarySearchDocument[]>('weeklySummarySearchIndex.json', [])).toHaveLength(0)
  })

  test('rejects invalid weekly summary ranges', () => {
    expect(() => getWeeklySummary('2026-06-22', '2026-06-15')).toThrow('Week start must be on or before week end.')
    expect(() => getWeeklySummary('06-15-2026', '2026-06-21')).toThrow('Week range must use YYYY-MM-DD format.')
  })
})

/**
 * Builds a task input fixture shared by the weekly-summary tests.
 *
 * @param overrides Partial values to customize the task input.
 * @returns Task input fixture.
 */
function buildTaskInput (overrides: Partial<Parameters<typeof createTask>[0]> = {}): Parameters<typeof createTask>[0] {
  return {
    title: 'Ship dashboard filters',
    finishDate: '2026-06-18',
    category: 'coding',
    hoursSpent: 1.5,
    focusLevel: 6,
    notes: 'Completed during deep work block.',
    ...overrides
  }
}
