import fs from 'fs'
import os from 'os'
import path from 'path'

import taskResolvers from './resolvers'
import { writeJsonFile } from '../../services/storage'
import { createTask } from '../../services/taskService'
import { getWeeklySummary } from '../../services/weeklySummaryService'

// These tests verify that task mutations clear any saved summaries for the
// weeks whose task data changed before the UI refetches them.
describe('taskResolvers', () => {
  const originalDataDirectory = process.env.PRODUCTIVITY_DATA_DIR
  let testDataDirectory: string

  beforeEach(() => {
    testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'task-resolver-data-'))
    process.env.PRODUCTIVITY_DATA_DIR = testDataDirectory
  })

  afterEach(() => {
    if (originalDataDirectory === undefined) {
      delete process.env.PRODUCTIVITY_DATA_DIR
    } else {
      process.env.PRODUCTIVITY_DATA_DIR = originalDataDirectory
    }

    fs.rmSync(testDataDirectory, { recursive: true, force: true })
  })

  test('createTask invalidates the saved summary for the created task week', async () => {
    seedWeeklySummaries([
      buildWeeklySummary({ weekStart: '2026-06-15', weekEnd: '2026-06-21' })
    ])

    const createdTask = await taskResolvers.Mutation.createTask(null, {
      task: buildTaskInput({ finishDate: '2026-06-18' })
    }, null)

    expect(createdTask.finishDate).toBe('2026-06-18')
    expect(getWeeklySummary('2026-06-15', '2026-06-21')).toBeNull()
  })

  test('updateTask invalidates both the original and destination weeks when the task moves', async () => {
    const existingTask = createTask(buildTaskInput({ finishDate: '2026-06-18' }))
    seedWeeklySummaries([
      buildWeeklySummary({ weekStart: '2026-06-15', weekEnd: '2026-06-21' }),
      buildWeeklySummary({
        weekStart: '2026-06-22',
        weekEnd: '2026-06-28',
        summaryParagraph: 'Next week focused on planning and handoff prep.'
      })
    ])

    const updatedTask = await taskResolvers.Mutation.updateTask(null, {
      id: String(existingTask.id),
      task: buildTaskInput({ finishDate: '2026-06-23', title: 'Moved to next week' })
    }, null)

    expect(updatedTask.finishDate).toBe('2026-06-23')
    expect(getWeeklySummary('2026-06-15', '2026-06-21')).toBeNull()
    expect(getWeeklySummary('2026-06-22', '2026-06-28')).toBeNull()
  })

  test('deleteTask invalidates the saved summary for the deleted task week', async () => {
    const existingTask = createTask(buildTaskInput({ finishDate: '2026-06-18' }))
    seedWeeklySummaries([
      buildWeeklySummary({ weekStart: '2026-06-15', weekEnd: '2026-06-21' })
    ])

    const deletedTask = await taskResolvers.Mutation.deleteTask(null, {
      id: String(existingTask.id)
    }, null)

    expect(deletedTask.id).toBe(existingTask.id)
    expect(getWeeklySummary('2026-06-15', '2026-06-21')).toBeNull()
  })
})

/**
 * Seeds the summary storage file for resolver invalidation tests.
 *
 * @param summaries Weekly summaries to persist before a test runs.
 */
function seedWeeklySummaries (summaries: Array<ReturnType<typeof buildWeeklySummary>>): void {
  writeJsonFile('weeklySummaries.json', summaries)
}

/**
 * Builds a minimal persisted weekly summary fixture for resolver tests.
 *
 * @param overrides Partial values to customize the summary.
 * @returns Weekly summary fixture.
 */
interface ResolverTestWeeklySummary {
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  generatedAt: string
  taskSignature: string
  metrics: {
    taskCount: number
    totalHours: number
    averageFocusLevel: number
    topCategory: string
    busiestDay: string
  }
}

function buildWeeklySummary (overrides: Partial<{
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  generatedAt: string
  taskSignature: string
  metrics: {
    taskCount: number
    totalHours: number
    averageFocusLevel: number
    topCategory: string
    busiestDay: string
  }
}> = {}): ResolverTestWeeklySummary {
  return {
    weekStart: '2026-06-15',
    weekEnd: '2026-06-21',
    summaryParagraph: 'This week centered on focused coding and steady execution.',
    suggestions: ['Protect deep work blocks.', 'Batch admin tasks together.'],
    generatedAt: '2026-06-21T12:00:00.000Z',
    taskSignature: '1:2026-06-21T12:00:00.000Z',
    metrics: {
      taskCount: 8,
      totalHours: 14.5,
      averageFocusLevel: 7.5,
      topCategory: 'coding',
      busiestDay: 'Thursday'
    },
    ...overrides
  }
}

/**
 * Builds a task input fixture shared by the task-resolver tests.
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
