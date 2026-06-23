import { Task } from './taskService'
import { WeeklySummaryMetrics } from './weeklySummaryService'

/**
 * Structured summary payload returned from Anthropic after validation.
 */
export interface GeneratedSummaryContent {
  summaryParagraph: string
  suggestions: string[]
}

interface AnthropicMessageResponse {
  content?: Array<{
    type: string
    text?: string
  }>
}

const defaultAnthropicModel = 'claude-haiku-4-5'

/**
 * Calls Anthropic to generate the weekly paragraph and suggestion list used by
 * the dashboard summary panel.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @param tasks Completed tasks for that week.
 * @param metrics Deterministic metrics derived from the same task set.
 * @returns Validated summary payload ready for persistence.
 */
export async function generateSummaryContent (
  weekStart: string,
  weekEnd: string,
  tasks: Task[],
  metrics: WeeklySummaryMetrics
): Promise<GeneratedSummaryContent> {
  const apiKey = getAnthropicApiKey()
  let response: Response

  try {
    // The backend owns the provider call so the API key never reaches the client.
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? defaultAnthropicModel,
        max_tokens: 500,
        temperature: 0.3,
        system: buildSystemPrompt(),
        messages: [{
          role: 'user',
          content: buildUserPrompt(weekStart, weekEnd, tasks, metrics)
        }]
      })
    })
  } catch (error) {
    throw new Error(`Anthropic request failed before a response was received: ${formatThrownError(error)}`)
  }

  if (!response.ok) {
    const responseBody = await response.text()
    throw new Error(buildAnthropicErrorMessage(response.status, responseBody))
  }

  const responseJson = await response.json() as AnthropicMessageResponse
  const responseText = responseJson.content?.find(contentBlock => contentBlock.type === 'text')?.text

  if (responseText === undefined) {
    throw new Error('Anthropic response did not include text content.')
  }

  return parseGeneratedSummaryContent(responseText)
}

/**
 * Reports whether a usable Anthropic API key is configured for summary
 * generation.
 *
 * @returns `true` when the backend can attempt provider calls.
 */
export function isAnthropicConfigured (): boolean {
  return getAnthropicApiKey().trim() !== ''
}

/**
 * Reads the backend-only Anthropic API key from the environment.
 *
 * @returns Configured API key string.
 * @throws Error when the key is missing or blank.
 */
function getAnthropicApiKey (): string {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey === undefined || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY must be configured to generate summaries.')
  }

  return apiKey
}

/**
 * Builds the system prompt that constrains Anthropic to a JSON-only response.
 *
 * @returns System prompt string.
 */
function buildSystemPrompt (): string {
  return [
    // A JSON-only contract keeps the UI rendering logic simple and reliable.
    'You are an assistant that summarizes weekly personal productivity data.',
    'Return valid JSON only.',
    'The JSON must contain:',
    '- summaryParagraph: a single paragraph string',
    '- suggestions: an array of 2 to 3 actionable strings for next week',
    'Format each suggestion as a short action item followed by a colon and a brief explanation.',
    'Do not include markdown fences or extra commentary.'
  ].join(' ')
}

/**
 * Packages the weekly task data and metrics into the user prompt.
 *
 * @param weekStart Inclusive Monday date.
 * @param weekEnd Inclusive Sunday date.
 * @param tasks Completed tasks for that week.
 * @param metrics Deterministic metrics derived from the same task set.
 * @returns JSON-formatted user prompt string.
 */
function buildUserPrompt (
  weekStart: string,
  weekEnd: string,
  tasks: Task[],
  metrics: WeeklySummaryMetrics
): string {
  // Supplying structured metrics alongside raw tasks helps the model produce a
  // tighter summary without the UI needing to post-process prose heavily.
  return JSON.stringify({
    weekRange: { weekStart, weekEnd },
    metrics,
    tasks: tasks.map(task => ({
      title: task.title,
      finishDate: task.finishDate,
      category: task.category,
      hoursSpent: task.hoursSpent,
      focusLevel: task.focusLevel
    })),
    instructions: [
      'Summarize the week in one paragraph.',
      'Reference the productivity metrics and visible task patterns.',
      'Then provide 2 to 3 concise suggestions to improve efficiency or focus next week.',
      'Format each suggestion as "Action item: brief explanation".'
    ]
  }, null, 2)
}

/**
 * Parses, validates, and normalizes the provider response text.
 *
 * @param responseText Raw text returned by Anthropic.
 * @returns Validated summary payload.
 */
function parseGeneratedSummaryContent (responseText: string): GeneratedSummaryContent {
  // Some providers wrap JSON in markdown fences, so strip that first.
  const parsedJson = JSON.parse(stripMarkdownCodeFence(responseText)) as Partial<GeneratedSummaryContent>
  const summaryParagraph = parsedJson.summaryParagraph?.trim()
  const suggestions = parsedJson.suggestions?.map(suggestion => suggestion.trim()).filter(Boolean)

  if (summaryParagraph === undefined || summaryParagraph === '') {
    throw new Error('Generated summary was missing summaryParagraph.')
  }

  if (suggestions === undefined || suggestions.length === 0) {
    throw new Error('Generated summary was missing suggestions.')
  }

  if (suggestions.length < 2 || suggestions.length > 3) {
    throw new Error('Generated summary must include 2 to 3 suggestions.')
  }

  return {
    summaryParagraph: summaryParagraph.replace(/\s+/g, ' '),
    suggestions
  }
}

/**
 * Removes optional markdown code fences around a JSON payload.
 *
 * @param value Provider response text.
 * @returns Unwrapped JSON string.
 */
function stripMarkdownCodeFence (value: string): string {
  return value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

/**
 * Shortens error bodies so provider failures stay readable in logs and API
 * errors.
 *
 * @param value Raw response body.
 * @returns Trimmed response body preview.
 */
function truncateErrorBody (value: string): string {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()

  if (normalizedValue === '') {
    return 'No response body was returned.'
  }

  if (normalizedValue.length <= 240) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, 237)}...`
}

/**
 * Builds a user-facing Anthropic error message with model hints when useful.
 *
 * @param status HTTP status code.
 * @param responseBody Raw provider response body.
 * @returns Readable backend error string.
 */
function buildAnthropicErrorMessage (status: number, responseBody: string): string {
  const truncatedBody = truncateErrorBody(responseBody)
  // Anthropic uses 404 for unknown model names, so add a pointed hint here.
  const invalidModelHint = status === 404 && /"message":"model:/i.test(truncatedBody)
    ? ' Check ANTHROPIC_MODEL and switch to a currently supported Claude model.'
    : ''

  return `Anthropic request failed with status ${status}: ${truncatedBody}${invalidModelHint}`
}

/**
 * Safely formats unknown thrown values into a loggable error string.
 *
 * @param error Unknown thrown value from the provider request.
 * @returns Human-readable error description.
 */
function formatThrownError (error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const cause = (error as Error & { cause?: unknown }).cause

  if (cause instanceof Error) {
    return `${error.message} | cause: ${cause.message}`
  }

  if (cause != null) {
    return `${error.message} | cause: ${String(cause)}`
  }

  return error.message
}
