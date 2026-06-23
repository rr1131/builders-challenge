import { generateSummaryContent } from './anthropicService'
import { WeeklySummaryMetrics } from './weeklySummaryService'
import { Task } from './taskService'

// Codex generated tests to verify prompt structure, parsing, and provider error handling.
describe('anthropicService', () => {
  const originalFetch = global.fetch
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalModel = process.env.ANTHROPIC_MODEL

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'
  })

  afterEach(() => {
    global.fetch = originalFetch

    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    }

    if (originalModel === undefined) {
      delete process.env.ANTHROPIC_MODEL
    } else {
      process.env.ANTHROPIC_MODEL = originalModel
    }
  })

  test('parses a successful summary response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summaryParagraph: 'This week included consistent coding output and strong focus.',
            suggestions: ['Protect deep work time on Tuesday.', 'Batch admin tasks into one block.']
          })
        }]
      })
    }) as unknown as typeof fetch

    const summary = await generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics())

    expect(summary.summaryParagraph).toContain('consistent coding output')
    expect(summary.suggestions).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalled()
  })

  test('requests structured action-item suggestions for the weekly summary ui', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summaryParagraph: 'This week included consistent coding output and strong focus.',
            suggestions: ['Protect deep work: Keep your mornings clear for coding.', 'Batch admin work: Group small operational tasks together.']
          })
        }]
      })
    }) as unknown as typeof fetch

    await generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics())

    const fetchOptions = (global.fetch as jest.Mock).mock.calls[0][1] as { body: string }
    const requestBody = JSON.parse(fetchOptions.body) as { system: string, messages: Array<{ content: string }> }
    const parsedPrompt = JSON.parse(requestBody.messages[0].content) as { instructions: string[] }

    expect(requestBody.system).toContain('Format each suggestion as a short action item followed by a colon and a brief explanation.')
    expect(parsedPrompt.instructions).toContain('Format each suggestion as "Action item: brief explanation".')
  })

  test('throws when Anthropic returns malformed content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: '{"summaryParagraph":"Only summary"}'
        }]
      })
    }) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Generated summary was missing suggestions.')
  })

  test('includes the provider response body when Anthropic rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    }) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Anthropic request failed with status 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')
  })

  test('adds a helpful hint when Anthropic rejects an unknown model', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-haiku-latest"}}'
    }) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Anthropic request failed with status 404: {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-haiku-latest"}} Check ANTHROPIC_MODEL and switch to a currently supported Claude model.')
  })

  test('surfaces network-level fetch failures clearly', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Anthropic request failed before a response was received: fetch failed')
  })

  test('includes nested network causes when fetch provides them', async () => {
    const error = new Error('fetch failed') as Error & { cause?: Error }
    error.cause = new Error('getaddrinfo ENOTFOUND api.anthropic.com')
    global.fetch = jest.fn().mockRejectedValue(error) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Anthropic request failed before a response was received: fetch failed | cause: getaddrinfo ENOTFOUND api.anthropic.com')
  })

  test('throws when Anthropic returns too many suggestions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summaryParagraph: 'This week included consistent coding output and strong focus.',
            suggestions: [
              'Protect deep work time on Tuesday.',
              'Batch admin tasks into one block.',
              'Review your weekly plan earlier.',
              'Leave more margin for interruptions.'
            ]
          })
        }]
      })
    }) as unknown as typeof fetch

    await expect(generateSummaryContent('2026-06-15', '2026-06-21', [buildTask()], buildMetrics()))
      .rejects
      .toThrow('Generated summary must include 2 to 3 suggestions.')
  })
})

function buildTask (): Task {
  return {
    id: 1,
    title: 'Ship dashboard filters',
    finishDate: '2026-06-18',
    category: 'coding',
    hoursSpent: 2,
    focusLevel: 7,
    createdAt: 'now',
    updatedAt: 'now'
  }
}

function buildMetrics (): WeeklySummaryMetrics {
  return {
    taskCount: 1,
    totalHours: 2,
    averageFocusLevel: 7,
    topCategory: 'coding',
    busiestDay: 'Thursday'
  }
}
