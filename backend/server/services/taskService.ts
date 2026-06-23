import { readJsonFile, writeJsonFile } from './storage'

/**
 * File-backed task model consumed by the tracker dashboard and summary layer.
 */
export interface Task {
  id: number
  title: string
  finishDate: string
  category: string
  hoursSpent: number
  focusLevel: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  title: string
  finishDate: string
  category: string
  hoursSpent: number
  focusLevel: number
  notes?: string
}

export interface TasksFilter {
  weekStart?: string
  weekEnd?: string
}

const tasksFilename = 'tasks.json'
const validCategories = new Set(['coding', 'planning', 'meeting', 'research', 'admin', 'other'])

// The dashboard always reads a week slice, so filtering happens server-side to
// keep the UI query payload small and deterministic.
/**
 * Reads persisted tasks and optionally filters them to a specific week range.
 *
 * @param filter Optional inclusive date window.
 * @returns Chronologically sorted task list.
 */
export function getTasks (filter: TasksFilter = {}): Task[] {
  validateTaskFilter(filter)
  const tasks = readTasks()

  return sortTasksChronologically(tasks.filter(task => matchesFilter(task, filter)))
}

/**
 * Looks up a single task by its persisted identifier.
 *
 * @param id Task identifier.
 * @returns Matching task.
 * @throws Error when the task does not exist.
 */
export function getTaskById (id: number): Task {
  const task = readTasks().find(candidateTask => candidateTask.id === id)

  if (task === undefined) {
    throw new Error('No such task with specified id')
  }

  return task
}

/**
 * Validates and persists a new completed task.
 *
 * @param task Raw task input from GraphQL.
 * @returns Newly created task with generated metadata.
 */
export function createTask (task: TaskInput): Task {
  const tasks = readTasks()
  const sanitizedTask = validateTaskInput(task)
  const now = (new Date()).toISOString()
  // IDs are local monotonic integers because repo-backed JSON storage does not
  // need globally unique identifiers for this single-user take-home scope.
  const nextTask: Task = {
    ...sanitizedTask,
    id: getNextTaskId(tasks),
    createdAt: now,
    updatedAt: now
  }

  tasks.unshift(nextTask)
  persistTasks(tasks)

  return nextTask
}

/**
 * Replaces the editable fields on an existing task.
 *
 * @param id Persisted task identifier.
 * @param task Replacement task payload.
 * @returns Updated task record.
 */
export function updateTask (id: number, task: TaskInput): Task {
  const tasks = readTasks()
  const taskIndex = tasks.findIndex(candidateTask => candidateTask.id === id)

  if (taskIndex === -1) {
    throw new Error('No such task with specified id')
  }

  const updatedTask: Task = {
    ...tasks[taskIndex],
    ...validateTaskInput(task),
    updatedAt: (new Date()).toISOString()
  }

  tasks[taskIndex] = updatedTask
  persistTasks(tasks)

  return updatedTask
}

// Deletion supports the "maintain my task list" workflow from the dashboard UI.
/**
 * Deletes a task from persistence.
 *
 * @param id Persisted task identifier.
 * @returns Deleted task record for downstream invalidation logic.
 */
export function deleteTask (id: number): Task {
  const tasks = readTasks()
  const taskIndex = tasks.findIndex(candidateTask => candidateTask.id === id)

  if (taskIndex === -1) {
    throw new Error('No such task with specified id')
  }

  const [deletedTask] = tasks.splice(taskIndex, 1)
  persistTasks(tasks)

  return deletedTask
}

/**
 * Normalizes and validates task input shared by create and update flows.
 *
 * @param task Raw task input.
 * @returns Sanitized task payload ready for persistence.
 */
export function validateTaskInput (task: TaskInput): TaskInput {
  const title = task.title.trim()
  const notes = task.notes?.trim()
  const finishDate = task.finishDate.trim()

  // Validation is kept in one place so GraphQL resolvers stay thin and both
  // create/update flows enforce the same business rules.
  if (title === '') {
    throw new Error('Task title is required.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(finishDate)) {
    throw new Error('Finish date must use YYYY-MM-DD format.')
  }

  if (!Number.isFinite(task.hoursSpent) || task.hoursSpent <= 0) {
    throw new Error('Hours spent must be greater than 0.')
  }

  if (!Number.isInteger(task.focusLevel) || task.focusLevel < 1 || task.focusLevel > 10) {
    throw new Error('Focus level must be a whole number from 1 to 10.')
  }

  if (!validCategories.has(task.category)) {
    throw new Error('Task category is invalid.')
  }

  return {
    ...task,
    title,
    finishDate,
    notes: notes === '' ? undefined : notes
  }
}

/**
 * Reads the complete persisted task list from disk.
 *
 * @returns Raw stored task array.
 */
function readTasks (): Task[] {
  return readJsonFile<Task[]>(tasksFilename, [])
}

/**
 * Writes the full task list back to disk.
 *
 * @param tasks Task array to persist.
 */
function persistTasks (tasks: Task[]): void {
  writeJsonFile(tasksFilename, tasks)
}

/**
 * Chooses the next monotonic integer identifier for a newly created task.
 *
 * @param tasks Existing persisted tasks.
 * @returns Next task identifier.
 */
function getNextTaskId (tasks: Task[]): number {
  return tasks.reduce((currentMax, task) => Math.max(currentMax, task.id), 0) + 1
}

/**
 * Checks whether a task belongs inside an optional inclusive week filter.
 *
 * @param task Candidate task.
 * @param filter Optional week filter.
 * @returns `true` when the task should be included.
 */
function matchesFilter (task: Task, filter: TasksFilter): boolean {
  if (filter.weekStart !== undefined && task.finishDate < filter.weekStart) {
    return false
  }

  if (filter.weekEnd !== undefined && task.finishDate > filter.weekEnd) {
    return false
  }

  return true
}

/**
 * Validates date-filter inputs before task queries run.
 *
 * @param filter Optional week filter to validate.
 */
function validateTaskFilter (filter: TasksFilter): void {
  if (filter.weekStart !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(filter.weekStart)) {
    throw new Error('Week start must use YYYY-MM-DD format.')
  }

  if (filter.weekEnd !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(filter.weekEnd)) {
    throw new Error('Week end must use YYYY-MM-DD format.')
  }

  if (
    filter.weekStart !== undefined &&
    filter.weekEnd !== undefined &&
    filter.weekStart > filter.weekEnd
  ) {
    throw new Error('Week start must be on or before week end.')
  }
}

/**
 * Orders tasks by completion date and then by title for stable rendering.
 *
 * @param tasks Task list to sort.
 * @returns Sorted copy of the task array.
 */
function sortTasksChronologically (tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const dateComparison = left.finishDate.localeCompare(right.finishDate)

    if (dateComparison !== 0) {
      return dateComparison
    }

    return left.title.localeCompare(right.title)
  })
}
