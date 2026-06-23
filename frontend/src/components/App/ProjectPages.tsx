/**
 * When navigating between different pages on the project,
 * use this enum to maintain consistency
 */
enum ProjectPage {
  Root = '/',
  Button = '/button',
  ProductivityTracker = '/productivity',
  ProductivityTrackerAddTask = '/productivity/add-task',
  ProductivityTrackerEditTask = '/productivity/tasks/:taskId/edit',
  Sample01 = '/01',
  Sample02 = '/02',
  Quiz = '/quiz',
  None = '*'
}

export default ProjectPage

/**
 * Builds the concrete edit-task route for a specific persisted task.
 *
 * @param taskId Persisted task identifier.
 * @returns Absolute edit route for that task.
 */
export function getProductivityTrackerEditTaskPath (taskId: string): string {
  return ProjectPage.ProductivityTrackerEditTask.replace(':taskId', taskId)
}
