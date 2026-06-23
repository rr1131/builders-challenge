import generateResolver from '../../utils/generateResolver'
import { invalidateWeeklySummariesForDateValues } from '../../services/weeklySummaryService'
import { createTask, deleteTask, getTaskById, getTasks, updateTask } from '../../services/taskService'

/**
 * GraphQL resolvers for task queries and mutations. Mutations also invalidate
 * any saved weekly summaries whose underlying task set changed.
 */
export default {
  Query: {
    // Week filtering is passed straight through to the service layer.
    tasks: generateResolver(({ args }) => getTasks({ weekStart: args.weekStart, weekEnd: args.weekEnd }))
  },
  Mutation: {
    // Task mutations invalidate any saved weekly summaries for the touched
    // weeks so search never serves stale AI output after the task set changes.
    createTask: generateResolver(async ({ args }) => {
      const createdTask = createTask(args.task)
      await invalidateWeeklySummariesForDateValues([createdTask.finishDate])
      return createdTask
    }),
    updateTask: generateResolver(async ({ args }) => {
      const taskId = Number(args.id)
      const originalTask = getTaskById(taskId)
      const updatedTask = updateTask(taskId, args.task)

      await invalidateWeeklySummariesForDateValues([originalTask.finishDate, updatedTask.finishDate])
      return updatedTask
    }),
    deleteTask: generateResolver(async ({ args }) => {
      const taskId = Number(args.id)
      const originalTask = getTaskById(taskId)
      const deletedTask = deleteTask(taskId)

      await invalidateWeeklySummariesForDateValues([originalTask.finishDate])
      return deletedTask
    })
  }
}
