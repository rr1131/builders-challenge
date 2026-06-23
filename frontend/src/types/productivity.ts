// Shared frontend contracts mirror the GraphQL response shapes used by the
// tracker dashboard, weekly summaries, and historical search results.
/**
 * Focus buckets derived from numeric focus scores for filtering and search.
 */
export type FocusBucket = 'low' | 'medium' | 'high'

/**
 * Allowed productivity task categories across logging, charting, and search.
 */
export type TaskCategory =
  | 'coding'
  | 'planning'
  | 'meeting'
  | 'research'
  | 'admin'
  | 'other'

/**
 * Persisted productivity task shape returned by GraphQL.
 */
export interface ProductivityTask {
  id: string
  title: string
  finishDate: string
  category: TaskCategory
  hoursSpent: number
  focusLevel: number
  notes?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Input payload used when creating or updating a task.
 */
export type ProductivityTaskInput = Omit<ProductivityTask, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Deterministic weekly metrics displayed in the dashboard and search results.
 */
export interface ProductivityWeeklySummaryMetrics {
  taskCount: number
  totalHours: number
  averageFocusLevel: number
  topCategory: string
  busiestDay: string
}

/**
 * Saved weekly summary payload returned by the backend.
 */
export interface ProductivityWeeklySummary {
  weekStart: string
  weekEnd: string
  summaryParagraph: string
  suggestions: string[]
  generatedAt: string
  taskSignature?: string
  metrics: ProductivityWeeklySummaryMetrics
}

/**
 * Ranked historical-search result for one saved summary.
 */
export interface ProductivityWeeklySummarySearchResult {
  score: number
  matchedTerms: string[]
  weeklySummary: ProductivityWeeklySummary
}

/**
 * Agent-style search explanation plus the underlying matched weeks.
 */
export interface ProductivitySearchAgentResponse {
  query: string
  answer: string
  interpretedQuery: string[]
  matchedWeeks: ProductivityWeeklySummarySearchResult[]
}
