import { PureQueryOptions, useMutation, useQuery } from '@apollo/client'
import ProjectPage from 'components/App/ProjectPages'
import MenuWrap from 'components/Menu/MenuWrap'
import React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  CREATE_TASK_MUTATION,
  DELETE_TASK_MUTATION,
  GET_TASKS_QUERY,
  GET_WEEKLY_SUMMARY_QUERY,
  UPDATE_TASK_MUTATION
} from './graphql'
import {
  getTodayDate,
  getWeekRangeForDateValue,
  TaskRecord
} from './productivityTracker'

import styles from './AddTaskPage.module.css'

interface TaskFormState {
  title: string
  finishDate: string
  category: string
  hoursSpent: string
  focusLevel: string
  notes: string
}

interface TaskMutationInput {
  title: string
  finishDate: string
  category: string
  hoursSpent: number
  focusLevel: number
  notes?: string
}

interface TasksQueryResponse {
  tasks: TaskRecord[]
}

interface TaskMutationResponse {
  createTask?: TaskRecord
  updateTask?: TaskRecord
  deleteTask?: TaskRecord
}

interface TaskMutationVariables {
  id?: string
  task: TaskMutationInput
}

type FormErrors = Partial<Record<keyof TaskFormState, string>>

const defaultFormState: TaskFormState = {
  title: '',
  finishDate: getTodayDate(),
  category: 'coding',
  hoursSpent: '1.5',
  focusLevel: '6',
  notes: ''
}

// This form powers both task creation and task editing so the tracker keeps one
// consistent path for maintaining the completed-work dataset.
/**
 * Renders the shared create/edit task form used by the productivity tracker.
 *
 * @returns Task form page with create, update, and delete flows.
 */
const AddTaskPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { taskId } = useParams<{ taskId: string }>()
  const isEditMode = taskId != null
  const stateTask = (location.state as { task?: TaskRecord } | null)?.task
  const [formState, setFormState] = React.useState(defaultFormState)
  const [formErrors, setFormErrors] = React.useState<FormErrors>({})
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [originalTask, setOriginalTask] = React.useState<TaskRecord | null>(stateTask ?? null)
  const shouldFetchTaskList = isEditMode && stateTask == null
  const { data: tasksData, loading: taskLoading } = useQuery<TasksQueryResponse>(GET_TASKS_QUERY, {
    skip: !shouldFetchTaskList
  })
  const [createTask, { loading: createLoading }] = useMutation<TaskMutationResponse, TaskMutationVariables>(CREATE_TASK_MUTATION)
  const [updateTask, { loading: updateLoading }] = useMutation<TaskMutationResponse, TaskMutationVariables>(UPDATE_TASK_MUTATION)
  const [deleteTask, { loading: deleteLoading }] = useMutation<TaskMutationResponse, { id: string }>(DELETE_TASK_MUTATION)
  const isSaving = createLoading || updateLoading || deleteLoading

  const selectedTask = React.useMemo(() => {
    if (!isEditMode) {
      return null
    }

    if (stateTask != null && stateTask.id === taskId) {
      return stateTask
    }

    return tasksData?.tasks.find(task => task.id === taskId) ?? null
  }, [isEditMode, stateTask, taskId, tasksData?.tasks])

  React.useEffect(() => {
    if (selectedTask == null) {
      return
    }

    setOriginalTask(selectedTask)
    setFormState(buildFormState(selectedTask))
  }, [selectedTask])

  const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value } = event.target

    setFormState(currentFormState => ({
      ...currentFormState,
      [name]: value
    }))
    setFormErrors(currentErrors => {
      if (!(name in currentErrors)) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      nextErrors[name as keyof TaskFormState] = undefined
      return nextErrors
    })
  }

  // Resetting preserves the original task when editing and the default template when creating.
  const handleClear = (): void => {
    setFormState(originalTask == null ? defaultFormState : buildFormState(originalTask))
    setFormErrors({})
    setSubmitError(null)
  }

  // Validation stays local so users get feedback before the mutation round trip.
  const validateForm = (): FormErrors => {
    const nextErrors: FormErrors = {}
    const hoursSpent = Number(formState.hoursSpent)
    const focusLevel = Number(formState.focusLevel)

    if (formState.title.trim() === '') {
      nextErrors.title = 'Please enter a task title.'
    }

    if (formState.finishDate === '') {
      nextErrors.finishDate = 'Please choose a finish date.'
    }

    if (!Number.isFinite(hoursSpent) || hoursSpent <= 0) {
      nextErrors.hoursSpent = 'Hours spent must be greater than 0.'
    }

    if (!Number.isInteger(focusLevel) || focusLevel < 1 || focusLevel > 10) {
      nextErrors.focusLevel = 'Focus level must be a whole number from 1 to 10.'
    }

    return nextErrors
  }

  // Saving always refetches the affected week so the dashboard and summary stay in sync.
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitError(null)

    const nextErrors = validateForm()

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      return
    }

    const taskInput: TaskMutationInput = {
      title: formState.title.trim(),
      finishDate: formState.finishDate,
      category: formState.category,
      hoursSpent: Number(formState.hoursSpent),
      focusLevel: Number(formState.focusLevel),
      notes: formState.notes.trim() === '' ? undefined : formState.notes.trim()
    }

    try {
      const refetchQueries = buildRefetchQueries([
        taskInput.finishDate,
        originalTask?.finishDate
      ])

      if (isEditMode && taskId != null) {
        await updateTask({
          variables: {
            id: taskId,
            task: taskInput
          },
          refetchQueries,
          awaitRefetchQueries: true
        })

        navigate(ProjectPage.ProductivityTracker)
        return
      }

      await createTask({
        variables: {
          task: taskInput
        },
        refetchQueries,
        awaitRefetchQueries: true
      })

      setFormState(defaultFormState)
      navigate(ProjectPage.ProductivityTracker)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the task right now.')
    }
  }

  // Deletion lives on the edit screen so the dense calendar cards can stay clean and fully clickable.
  const handleDelete = async (): Promise<void> => {
    if (!isEditMode || taskId == null || originalTask == null) {
      return
    }

    const shouldDelete = window.confirm(`Delete "${originalTask.title}"?`)

    if (!shouldDelete) {
      return
    }

    try {
      await deleteTask({
        variables: {
          id: taskId
        },
        refetchQueries: buildRefetchQueries([originalTask.finishDate]),
        awaitRefetchQueries: true
      })

      navigate(ProjectPage.ProductivityTracker)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to delete the task right now.')
    }
  }

  if (isEditMode && !taskLoading && selectedTask == null) {
    return (
      <MenuWrap active='ProductivityTracker'>
        <main className={styles.page}>
          <section className={styles.header}>
            <div className={styles.headerCopy}>
              <h1 className={styles.title}>We couldn&apos;t find that task.</h1>
              <p className={styles.subtitle}>
                The edit link may be stale, or the task no longer exists in local storage. Head back to the tracker
                and choose a current task from there.
              </p>
            </div>
            <div className={styles.headerControls}>
              <Link className={styles.backLink} to={ProjectPage.ProductivityTracker}>
                Back to tracker
              </Link>
            </div>
          </section>
        </main>
      </MenuWrap>
    )
  }

  return (
    <MenuWrap active='ProductivityTracker'>
      <main className={styles.page}>
        <section className={styles.header}>
          <div className={styles.headerCopy}>
            <h1 className={styles.title}>{isEditMode ? 'Edit task' : 'Log task'}</h1>
            <p className={styles.subtitle}>
              {isEditMode
                ? 'Adjust the task details if the original entry needs cleaner metadata before it feeds the weekly dashboard and AI summary.'
                : 'Use this form to log work once it is finished. That keeps the tracker centered on completed output for the week and gives the summary layer cleaner data to work with.'}
            </p>
          </div>
          <div className={styles.headerControls}>
            <Link className={styles.backLink} to={ProjectPage.ProductivityTracker}>
              Back to tracker
            </Link>
          </div>
        </section>

        <section className={styles.stage}>
          <div className={styles.stageHeader}>
            <div>
              <p className={styles.panelLabel}>Task entry</p>
              <h2 className={styles.sectionTitle}>{isEditMode ? 'Edit task details' : 'Task details'}</h2>
              <p className={styles.sectionCopy}>
                Start with the essentials we&apos;ll persist for completed work: title, finish date, category, time
                spent, focus level, and notes.
              </p>
            </div>
            <span className={styles.headerBadge}>
              {taskLoading ? 'Loading task...' : isSaving ? 'Saving...' : 'Ready to save'}
            </span>
          </div>

          {submitError != null && <p className={styles.errorMessage}>{submitError}</p>}

          <form className={styles.formGrid} onSubmit={(event) => { void handleSubmit(event) }}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Task title</span>
              <input
                className={formErrors.title != null ? `${styles.input} ${styles.inputError}` : styles.input}
                type='text'
                name='title'
                value={formState.title}
                onChange={handleFieldChange}
                placeholder='Ship dashboard filters'
                required
                disabled={taskLoading || isSaving}
              />
              {formErrors.title != null && <span className={styles.fieldError}>{formErrors.title}</span>}
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Finish Date</span>
              <input
                className={formErrors.finishDate != null ? `${styles.input} ${styles.inputError}` : styles.input}
                type='date'
                name='finishDate'
                value={formState.finishDate}
                onChange={handleFieldChange}
                required
                disabled={taskLoading || isSaving}
              />
              {formErrors.finishDate != null && <span className={styles.fieldError}>{formErrors.finishDate}</span>}
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Category</span>
              <select
                className={styles.input}
                name='category'
                value={formState.category}
                onChange={handleFieldChange}
                disabled={taskLoading || isSaving}
              >
                <option value='coding'>Coding</option>
                <option value='planning'>Planning</option>
                <option value='meeting'>Meeting</option>
                <option value='research'>Research</option>
                <option value='admin'>Admin</option>
                <option value='other'>Other</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Hours spent</span>
              <input
                className={formErrors.hoursSpent != null ? `${styles.input} ${styles.inputError}` : styles.input}
                type='number'
                min='0'
                step='0.5'
                name='hoursSpent'
                value={formState.hoursSpent}
                onChange={handleFieldChange}
                required
                disabled={taskLoading || isSaving}
              />
              {formErrors.hoursSpent != null && <span className={styles.fieldError}>{formErrors.hoursSpent}</span>}
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Focus level (1-10)</span>
              <input
                className={formErrors.focusLevel != null ? `${styles.input} ${styles.inputError}` : styles.input}
                type='number'
                min='1'
                max='10'
                step='1'
                name='focusLevel'
                value={formState.focusLevel}
                onChange={handleFieldChange}
                required
                disabled={taskLoading || isSaving}
              />
              {formErrors.focusLevel != null && <span className={styles.fieldError}>{formErrors.focusLevel}</span>}
            </label>

            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span className={styles.fieldLabel}>Notes</span>
              <span className={styles.fieldHint}>Optional context for what moved forward, what was blocked, or what the summary should reference.</span>
              <textarea
                aria-label='Notes'
                className={styles.textarea}
                rows={6}
                name='notes'
                value={formState.notes}
                onChange={handleFieldChange}
                placeholder='Capture what moved forward, what is blocked, or any context that should show up in the weekly summary.'
                disabled={taskLoading || isSaving}
              />
            </label>

            <div className={`${styles.actions} ${styles.fullWidth}`}>
              <button className={styles.primaryButton} type='submit' disabled={taskLoading || isSaving}>
                {isSaving ? 'Saving task...' : isEditMode ? 'Save changes' : 'Save task'}
              </button>
              <button className={styles.secondaryButton} type='button' onClick={handleClear} disabled={taskLoading || isSaving}>
                {isEditMode ? 'Reset changes' : 'Clear form'}
              </button>
              {isEditMode && (
                <button className={styles.deleteButton} type='button' onClick={() => { void handleDelete() }} disabled={taskLoading || isSaving}>
                  {deleteLoading ? 'Deleting task...' : 'Delete task'}
                </button>
              )}
            </div>
          </form>
        </section>
      </main>
    </MenuWrap>
  )
}

// Editing works from string form state so the inputs can stay fully controlled.
/**
 * Converts a persisted task into the fully controlled string state used by the
 * form inputs.
 *
 * @param task Persisted task to edit.
 * @returns Form state seeded from that task.
 */
function buildFormState (task: TaskRecord): TaskFormState {
  return {
    title: task.title,
    finishDate: task.finishDate,
    category: task.category,
    hoursSpent: `${task.hoursSpent}`,
    focusLevel: `${task.focusLevel}`,
    notes: task.notes ?? ''
  }
}

// Refetching every affected week keeps edits coherent when a task is moved between dates.
/**
 * Builds the GraphQL refetch list for any weeks touched by a create, edit, or
 * delete mutation.
 *
 * @param dateValues Task dates that may map to one or more reporting weeks.
 * @returns Apollo refetch descriptors for tasks and weekly summaries.
 */
function buildRefetchQueries (dateValues: Array<string | undefined>): PureQueryOptions[] {
  const rangesByKey = new Map<string, { weekStart: string, weekEnd: string }>()

  dateValues.forEach(dateValue => {
    if (dateValue == null) {
      return
    }

    const range = getWeekRangeForDateValue(dateValue)
    rangesByKey.set(`${range.weekStart}:${range.weekEnd}`, range)
  })

  return Array.from(rangesByKey.values()).flatMap(range => {
    return [
      { query: GET_TASKS_QUERY, variables: range },
      { query: GET_WEEKLY_SUMMARY_QUERY, variables: range }
    ]
  })
}

export default AddTaskPage
