/**
 * GraphQL schema for weekly summary generation and Part 2 historical search.
 */
// Weekly summary and historical-search schema for GenAI Part 1 and Part 2.
export default `
  type WeeklySummaryMetrics {
    taskCount: Int!
    totalHours: Float!
    averageFocusLevel: Float!
    topCategory: String!
    busiestDay: String!
  }

  type WeeklySummary {
    weekStart: String!
    weekEnd: String!
    summaryParagraph: String!
    suggestions: [String!]!
    generatedAt: String!
    taskSignature: String
    metrics: WeeklySummaryMetrics!
  }

  type WeeklySummarySearchResult {
    score: Float!
    matchedTerms: [String!]!
    weeklySummary: WeeklySummary!
  }

  type ProductivitySearchAgentResponse {
    query: String!
    answer: String!
    interpretedQuery: [String!]!
    matchedWeeks: [WeeklySummarySearchResult!]!
  }

  type Query {
    weeklySummary(weekStart: String!, weekEnd: String!): WeeklySummary
    searchWeeklySummaries(query: String!): [WeeklySummarySearchResult!]!
    productivitySearchAgent(query: String!): ProductivitySearchAgentResponse!
  }

  type Mutation {
    generateWeeklySummary(weekStart: String!, weekEnd: String!): WeeklySummary!
  }
`
