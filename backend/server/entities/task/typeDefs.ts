/**
 * GraphQL schema for completed productivity tasks that feed the dashboard,
 * weekly summaries, and historical search invalidation logic.
 */
// Task schema for completed productivity work that feeds both the dashboard
// and the weekly-summary generation flow.
export default `
  type Task {
    id: ID!
    title: String!
    finishDate: String!
    category: String!
    hoursSpent: Float!
    focusLevel: Int!
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  input TaskInput {
    title: String!
    finishDate: String!
    category: String!
    hoursSpent: Float!
    focusLevel: Int!
    notes: String
  }

  type Query {
    tasks(weekStart: String, weekEnd: String): [Task!]!
  }

  type Mutation {
    createTask(task: TaskInput!): Task!
    updateTask(id: ID!, task: TaskInput!): Task!
    deleteTask(id: ID!): Task!
  }
`
