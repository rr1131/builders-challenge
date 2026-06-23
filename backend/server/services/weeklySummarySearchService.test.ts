import fs from 'fs'
import os from 'os'
import path from 'path'

import { readJsonFile, writeJsonFile } from './storage'
import {
  getWeeklySummarySearchDocuments,
  productivitySearchAgent,
  searchWeeklySummaries,
  WeeklySummarySearchDocument
} from './weeklySummarySearchService'
import { WeeklySummary } from './weeklySummaryService'

// These tests cover the local LangChain-style retrieval layer for past weeks.
describe('weeklySummarySearchService', () => {
  const originalDataDirectory = process.env.PRODUCTIVITY_DATA_DIR
  const originalVectorDimension = process.env.PRODUCTIVITY_VECTOR_DIMENSION
  const originalSearchResultLimit = process.env.PRODUCTIVITY_SEARCH_RESULT_LIMIT
  const originalSearchMinScore = process.env.PRODUCTIVITY_SEARCH_MIN_SCORE
  let testDataDirectory: string

  beforeEach(() => {
    testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-summary-search-data-'))
    process.env.PRODUCTIVITY_DATA_DIR = testDataDirectory
    process.env.PRODUCTIVITY_VECTOR_DIMENSION = '32'
    process.env.PRODUCTIVITY_SEARCH_RESULT_LIMIT = '5'
    process.env.PRODUCTIVITY_SEARCH_MIN_SCORE = '0'
  })

  afterEach(() => {
    if (originalDataDirectory === undefined) {
      delete process.env.PRODUCTIVITY_DATA_DIR
    } else {
      process.env.PRODUCTIVITY_DATA_DIR = originalDataDirectory
    }

    if (originalVectorDimension === undefined) {
      delete process.env.PRODUCTIVITY_VECTOR_DIMENSION
    } else {
      process.env.PRODUCTIVITY_VECTOR_DIMENSION = originalVectorDimension
    }

    if (originalSearchResultLimit === undefined) {
      delete process.env.PRODUCTIVITY_SEARCH_RESULT_LIMIT
    } else {
      process.env.PRODUCTIVITY_SEARCH_RESULT_LIMIT = originalSearchResultLimit
    }

    if (originalSearchMinScore === undefined) {
      delete process.env.PRODUCTIVITY_SEARCH_MIN_SCORE
    } else {
      process.env.PRODUCTIVITY_SEARCH_MIN_SCORE = originalSearchMinScore
    }

    fs.rmSync(testDataDirectory, { recursive: true, force: true })
  })

  test('creates and persists vector search documents from weekly summaries', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    const documents = await getWeeklySummarySearchDocuments()
    const persistedIndex = readJsonFile<WeeklySummarySearchDocument[]>('weeklySummarySearchIndex.json', [])

    expect(documents).toHaveLength(1)
    expect(documents[0].id).toBe('2026-06-15:2026-06-21')
    expect(documents[0].searchText).toContain('focused coding')
    expect(documents[0].keywordTokens).toContain('coding')
    expect(documents[0].embeddingModel).toBe('local-deterministic-langchain-v1')
    expect(documents[0].embedding).toHaveLength(32)
    expect(persistedIndex).toEqual(documents)
  })

  test('searches weekly summaries with vector similarity ranking', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        summaryParagraph: 'This week leaned heavily on planning and stakeholder alignment.',
        suggestions: ['Leave more room for focus work.', 'Shorten recurring meetings.'],
        topCategory: 'planning',
        busiestDay: 'Tuesday',
        taskCount: 6,
        totalHours: 11,
        averageFocusLevel: 5.5
      }),
      buildWeeklySummary({
        weekStart: '2026-06-10',
        weekEnd: '2026-06-16',
        summaryParagraph: 'This week had scattered admin work and a little focus time, but execution stayed uneven.',
        suggestions: ['Batch admin work.', 'Reduce context switching.'],
        topCategory: 'admin',
        busiestDay: 'Wednesday',
        taskCount: 9,
        totalHours: 13,
        averageFocusLevel: 5.8
      }),
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    const searchResults = await searchWeeklySummaries('coding focus')

    expect(searchResults).toHaveLength(3)
    expect(searchResults[0].weeklySummary.weekStart).toBe('2026-06-15')
    expect(searchResults[0].matchedTerms).toEqual(['coding', 'focus'])
    expect(searchResults[0].score).toBeGreaterThan(searchResults[1].score)
    expect(searchResults[1].weeklySummary.weekStart).toBe('2026-06-10')
    expect(searchResults[1].matchedTerms).toEqual(['focus'])
  })

  test('prefers coding-heavy, high-focus weeks for natural-language similarity queries', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-05-18',
        weekEnd: '2026-05-24',
        summaryParagraph: 'This was a strong coding week with consistent output, long focus stretches, and minimal context switching.',
        suggestions: ['Repeat the same deep-work scheduling pattern next week.', 'Capture reusable implementation notes.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 14,
        totalHours: 20.5,
        averageFocusLevel: 8.2
      }),
      buildWeeklySummary({
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        summaryParagraph: 'The week was heavier on meetings and admin than usual, which kept tasks moving but reduced concentration for higher-effort work.',
        suggestions: ['Reduce meeting sprawl by consolidating check-ins.', 'Front-load the highest-focus task before collaboration begins.'],
        topCategory: 'admin',
        busiestDay: 'Friday',
        taskCount: 10,
        totalHours: 13,
        averageFocusLevel: 5.2
      })
    ])

    const searchResults = await searchWeeklySummaries('Show me weeks when I completed a lot of coding tasks with high focus')

    expect(searchResults[0].weeklySummary.weekStart).toBe('2026-05-18')
    expect(searchResults[0].matchedTerms).toEqual(expect.arrayContaining(['coding', 'tasks', 'high', 'focus']))
    expect(searchResults[0].score).toBeGreaterThan(searchResults[1].score)
  })

  test('prefers genuinely high-workload weeks over semantically similar low-output weeks', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-05-18',
        weekEnd: '2026-05-24',
        summaryParagraph: 'This week delivered strong execution across multiple projects with sustained momentum.',
        suggestions: ['Protect deep work blocks.', 'Keep batching admin tasks.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 14,
        totalHours: 20.5,
        averageFocusLevel: 8.2
      }),
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week felt productive in moments, but only one task was fully completed.',
        suggestions: ['Reduce context switching.', 'Finish one priority task earlier.'],
        topCategory: 'research',
        busiestDay: 'Monday',
        taskCount: 1,
        totalHours: 2,
        averageFocusLevel: 6.5
      })
    ])

    const highWorkloadResults = await searchWeeklySummaries('high workload weeks')
    const productiveResults = await searchWeeklySummaries('very productive weeks')
    const taskHeavyResults = await searchWeeklySummaries('lots of tasks')

    expect(highWorkloadResults[0].weeklySummary.weekStart).toBe('2026-05-18')
    expect(productiveResults[0].weeklySummary.weekStart).toBe('2026-05-18')
    expect(taskHeavyResults[0].weeklySummary.weekStart).toBe('2026-05-18')
    expect(taskHeavyResults[0].score).toBeGreaterThan(taskHeavyResults[1].score)
  })

  test('ranks medium and low focus weeks correctly for explicit focus-level queries', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-01',
        weekEnd: '2026-06-07',
        summaryParagraph: 'This week had high concentration and long, uninterrupted stretches of work.',
        suggestions: ['Repeat the same deep-work schedule.'],
        topCategory: 'coding',
        busiestDay: 'Tuesday',
        taskCount: 11,
        totalHours: 17,
        averageFocusLevel: 8.4
      }),
      buildWeeklySummary({
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        summaryParagraph: 'This week had balanced focus with solid but not exceptional concentration.',
        suggestions: ['Keep the same pacing.'],
        topCategory: 'planning',
        busiestDay: 'Wednesday',
        taskCount: 7,
        totalHours: 11.5,
        averageFocusLevel: 6.1
      }),
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week was fragmented and easily interrupted.',
        suggestions: ['Cut back on meetings.', 'Protect one quiet block.'],
        topCategory: 'admin',
        busiestDay: 'Friday',
        taskCount: 5,
        totalHours: 9,
        averageFocusLevel: 2.8
      })
    ])

    const mediumFocusResults = await searchWeeklySummaries('medium focus weeks')
    const lowFocusResults = await searchWeeklySummaries('low focus weeks')

    expect(mediumFocusResults[0].weeklySummary.weekStart).toBe('2026-06-08')
    expect(lowFocusResults[0].weeklySummary.weekStart).toBe('2026-06-15')
    expect(lowFocusResults[0].score).toBeGreaterThan(lowFocusResults[1].score)
  })

  test('reuses stored embeddings for unchanged summaries', async () => {
    writeJsonFile<WeeklySummarySearchDocument[]>('weeklySummarySearchIndex.json', [
      {
        id: '2026-06-15:2026-06-21',
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        generatedAt: '2026-06-21T12:00:00.000Z',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        metrics: {
          taskCount: 8,
          totalHours: 14.5,
          averageFocusLevel: 7.5,
          topCategory: 'coding',
          busiestDay: 'Thursday'
        },
        searchText: 'This week centered on focused coding and steady execution. Protect deep work blocks. Batch admin tasks together. Top category coding. The week was coding heavy. Busiest day Thursday. 8 completed tasks. 14.5 total hours. Average focus level 7.5. This was a high focus week. This was a productive week. Task volume was some tasks. The week had a medium workload.',
        keywordTokens: ['centered', 'focused', 'coding', 'steady', 'execution', 'protect', 'deep', 'blocks', 'batch', 'admin', 'tasks', 'together', 'top', 'category', 'heavy', 'busiest', 'day', 'thursday', 'completed', 'total', 'hours', 'average', 'focus', 'level', 'high', 'productive', 'task', 'volume', 'some', 'medium', 'workload'],
        embeddingModel: 'local-deterministic-langchain-v1',
        embedding: Array.from({ length: 32 }, (_, index) => index / 32)
      }
    ])

    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    const documents = await getWeeklySummarySearchDocuments()

    expect(documents[0].embedding).toEqual(Array.from({ length: 32 }, (_, index) => index / 32))
  })

  test('rejects empty search queries', async () => {
    await expect(searchWeeklySummaries('   ')).rejects.toThrow('Search query is required.')
  })

  test('rejects queries with no meaningful search terms after normalization', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    await expect(searchWeeklySummaries('show me the weeks')).rejects.toThrow('Search query must include at least one meaningful term.')
  })

  test('builds an agent-style response from matching weeks', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        summaryParagraph: 'This week leaned heavily on planning and stakeholder alignment.',
        suggestions: ['Leave more room for focus work.', 'Shorten recurring meetings.'],
        topCategory: 'planning',
        busiestDay: 'Tuesday',
        taskCount: 6,
        totalHours: 11,
        averageFocusLevel: 5.5
      }),
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    const response = await productivitySearchAgent('coding focus')

    expect(response.query).toBe('coding focus')
    expect(response.interpretedQuery).toContain('category:coding')
    expect(response.interpretedQuery).toContain('metric:focus')
    expect(response.matchedWeeks).toHaveLength(2)
    expect(response.answer).toContain('strongest match was 2026-06-15 to 2026-06-21')
  })

  test('returns a guided no-match answer when no direct terms match', async () => {
    writeJsonFile<WeeklySummary[]>('weeklySummaries.json', [
      buildWeeklySummary({
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        summaryParagraph: 'This week centered on focused coding and steady execution.',
        suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
        topCategory: 'coding',
        busiestDay: 'Thursday',
        taskCount: 8,
        totalHours: 14.5,
        averageFocusLevel: 7.5
      })
    ])

    const response = await productivitySearchAgent('exercise streak')

    expect(response.matchedWeeks).toHaveLength(0)
    expect(response.answer).toContain('couldn\'t find a direct keyword match')
  })
})

/**
 * Builds a weekly summary fixture for vector-search tests.
 *
 * @param overrides Partial values to customize the summary payload.
 * @returns Weekly summary fixture.
 */
function buildWeeklySummary (overrides: {
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  topCategory: string
  busiestDay: string
  taskCount: number
  totalHours: number
  averageFocusLevel: number
}): WeeklySummary {
  return {
    weekStart: overrides.weekStart,
    weekEnd: overrides.weekEnd,
    summaryParagraph: overrides.summaryParagraph,
    suggestions: overrides.suggestions,
    generatedAt: '2026-06-21T12:00:00.000Z',
    metrics: {
      taskCount: overrides.taskCount,
      totalHours: overrides.totalHours,
      averageFocusLevel: overrides.averageFocusLevel,
      topCategory: overrides.topCategory,
      busiestDay: overrides.busiestDay
    }
  }
}
