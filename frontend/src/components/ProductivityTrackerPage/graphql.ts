import { gql } from '@apollo/client'

// Shared fragments keep the task and summary shape identical across queries and mutations.
/**
 * Shared GraphQL fragment for the task fields used across tracker operations.
 */
export const TASK_FIELDS = gql`
  fragment TaskFields on Task {
    id
    title
    finishDate
    category
    hoursSpent
    focusLevel
    notes
    createdAt
    updatedAt
  }
`

/**
 * Shared GraphQL fragment for weekly summary fields used across dashboard and
 * search operations.
 */
export const WEEKLY_SUMMARY_FIELDS = gql`
  fragment WeeklySummaryFields on WeeklySummary {
    weekStart
    weekEnd
    summaryParagraph
    suggestions
    generatedAt
    taskSignature
    metrics {
      taskCount
      totalHours
      averageFocusLevel
      topCategory
      busiestDay
    }
  }
`

/**
 * Query for loading tasks for the current reporting week.
 */
export const GET_TASKS_QUERY = gql`
  query tasks($weekStart: String, $weekEnd: String) {
    tasks(weekStart: $weekStart, weekEnd: $weekEnd) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`

/**
 * Mutation for creating a completed productivity task.
 */
export const CREATE_TASK_MUTATION = gql`
  mutation createTask($task: TaskInput!) {
    createTask(task: $task) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`

/**
 * Mutation for editing an existing completed productivity task.
 */
export const UPDATE_TASK_MUTATION = gql`
  mutation updateTask($id: ID!, $task: TaskInput!) {
    updateTask(id: $id, task: $task) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`

/**
 * Mutation for deleting a completed productivity task.
 */
export const DELETE_TASK_MUTATION = gql`
  mutation deleteTask($id: ID!) {
    deleteTask(id: $id) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`

/**
 * Query for retrieving the saved weekly summary for a reporting week.
 */
export const GET_WEEKLY_SUMMARY_QUERY = gql`
  query weeklySummary($weekStart: String!, $weekEnd: String!) {
    weeklySummary(weekStart: $weekStart, weekEnd: $weekEnd) {
      ...WeeklySummaryFields
    }
  }
  ${WEEKLY_SUMMARY_FIELDS}
`

/**
 * Shared GraphQL fragment for historical-search result cards.
 */
export const WEEKLY_SUMMARY_SEARCH_RESULT_FIELDS = gql`
  fragment WeeklySummarySearchResultFields on WeeklySummarySearchResult {
    score
    matchedTerms
    weeklySummary {
      ...WeeklySummaryFields
    }
  }
  ${WEEKLY_SUMMARY_FIELDS}
`

/**
 * Query for searching previously saved weekly summaries.
 */
export const GET_WEEKLY_SUMMARY_SEARCH_QUERY = gql`
  query searchWeeklySummaries($query: String!) {
    searchWeeklySummaries(query: $query) {
      ...WeeklySummarySearchResultFields
    }
  }
  ${WEEKLY_SUMMARY_SEARCH_RESULT_FIELDS}
`

/**
 * Mutation for explicitly generating a weekly AI summary.
 */
export const GENERATE_WEEKLY_SUMMARY_MUTATION = gql`
  mutation generateWeeklySummary($weekStart: String!, $weekEnd: String!) {
    generateWeeklySummary(weekStart: $weekStart, weekEnd: $weekEnd) {
      ...WeeklySummaryFields
    }
  }
  ${WEEKLY_SUMMARY_FIELDS}
`
