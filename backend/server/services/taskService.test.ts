import fs from 'fs'
import os from 'os'
import path from 'path'

import { createTask, deleteTask, getTaskById, getTasks, TaskInput, updateTask } from './taskService'

// These tests validate the file-backed task layer that powers the tracker UI.
describe('taskService', () => {
  const originalDataDirectory = process.env.PRODUCTIVITY_DATA_DIR
  let testDataDirectory: string

  beforeEach(() => {
    testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'productivity-data-'))
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

  test('creates and persists a task', () => {
    const createdTask = createTask(buildTaskInput())

    expect(createdTask.id).toBe(1)
    expect(getTaskById(createdTask.id).title).toBe('Ship dashboard filters')
    expect(getTasks()).toHaveLength(1)
  })

  test('filters tasks by week range', () => {
    createTask(buildTaskInput({ title: 'Earlier', finishDate: '2026-06-02' }))
    createTask(buildTaskInput({ title: 'Current', finishDate: '2026-06-18' }))
    createTask(buildTaskInput({ title: 'Later', finishDate: '2026-06-29' }))

    const filteredTasks = getTasks({ weekStart: '2026-06-16', weekEnd: '2026-06-22' })

    expect(filteredTasks).toHaveLength(1)
    expect(filteredTasks[0].title).toBe('Current')
  })

  test('updates an existing task', () => {
    const createdTask = createTask(buildTaskInput())

    const updatedTask = updateTask(createdTask.id, buildTaskInput({
      title: 'Polish dashboard filters',
      hoursSpent: 2.5,
      focusLevel: 8
    }))

    expect(updatedTask.title).toBe('Polish dashboard filters')
    expect(updatedTask.hoursSpent).toBe(2.5)
    expect(updatedTask.focusLevel).toBe(8)
    expect(getTaskById(createdTask.id).updatedAt >= createdTask.updatedAt).toBe(true)
  })

  test('deletes an existing task', () => {
    const createdTask = createTask(buildTaskInput())

    const deletedTask = deleteTask(createdTask.id)

    expect(deletedTask.id).toBe(createdTask.id)
    expect(getTasks()).toHaveLength(0)
    expect(() => getTaskById(createdTask.id)).toThrow('No such task with specified id')
  })

  test('rejects invalid task input', () => {
    expect(() => createTask(buildTaskInput({ focusLevel: 12 }))).toThrow('Focus level must be a whole number from 1 to 10.')
    expect(() => createTask(buildTaskInput({ hoursSpent: 0 }))).toThrow('Hours spent must be greater than 0.')
    expect(() => createTask(buildTaskInput({ category: 'exercise' } as unknown as Partial<TaskInput>))).toThrow('Task category is invalid.')
  })

  test('rejects invalid week filters', () => {
    createTask(buildTaskInput())

    expect(() => getTasks({ weekStart: '06-18-2026' })).toThrow('Week start must use YYYY-MM-DD format.')
    expect(() => getTasks({ weekEnd: '06-18-2026' })).toThrow('Week end must use YYYY-MM-DD format.')
    expect(() => getTasks({ weekStart: '2026-06-20', weekEnd: '2026-06-18' })).toThrow('Week start must be on or before week end.')
  })
})

/**
 * Builds a task input fixture shared by the task-service tests.
 *
 * @param overrides Partial values to customize the task input.
 * @returns Task input fixture.
 */
function buildTaskInput (overrides: Partial<TaskInput> = {}): TaskInput {
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
