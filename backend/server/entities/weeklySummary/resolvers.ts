import { productivitySearchAgent, searchWeeklySummaries } from '../../services/weeklySummarySearchService'
import { generateWeeklySummary, getWeeklySummary } from '../../services/weeklySummaryService'
import generateResolver from '../../utils/generateResolver'

/**
 * GraphQL resolvers for reading saved weekly summaries, vector search results,
 * and explicit GenAI summary generation.
 */
export default {
  Query: {
    // The UI reads the saved weekly summary first so repeated page loads do not
    // keep calling the GenAI provider for the same week.
    weeklySummary: generateResolver(({ args }) => getWeeklySummary(args.weekStart, args.weekEnd)),
    searchWeeklySummaries: generateResolver(async ({ args }) => await searchWeeklySummaries(args.query)),
    productivitySearchAgent: generateResolver(async ({ args }) => await productivitySearchAgent(args.query))
  },
  Mutation: {
    generateWeeklySummary: generateResolver(async ({ args }) => {
      try {
        return await generateWeeklySummary(args.weekStart, args.weekEnd)
      } catch (error) {
        // Log the exact week range so API-limit or provider issues are easier to trace.
        console.error(
          `generateWeeklySummary failed for ${String(args.weekStart)} to ${String(args.weekEnd)}:`,
          error instanceof Error ? error.message : error
        )
        throw error
      }
    })
  }
}
