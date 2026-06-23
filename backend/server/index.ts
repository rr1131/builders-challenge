import './config/loadEnv'
import { createServer } from 'http'
import { createYoga } from 'graphql-yoga'
import { knex } from 'knex'

import knexConfig from '../knexfile'
import buildSchema from './utils/buildSchema'

/**
 * Boots the GraphQL API, loads the stitched schema, and exposes the shared
 * resolver context used by the starter app and the productivity tracker.
 */
async function main (): Promise<void> {
  try {
    const PORT = 4000

    if (process.env.ANTHROPIC_API_KEY == null || process.env.ANTHROPIC_API_KEY.trim() === '') {
      console.warn('ANTHROPIC_API_KEY is not configured. Weekly summary generation will fail until it is set in backend/.env or the process environment.')
    }

    // Keep the starter's knex-backed context in place so new resolvers fit the
    // existing server shape even though the productivity feature is file-backed.
    const knexClient = knex(knexConfig.development)

    // Resolver context stays available for any existing or future entities.
    const context = {
      knex: knexClient
    }

    // Build one stitched schema from every entity module under server/entities.
    const schema = await buildSchema()

    // GraphQL Yoga serves the stitched schema and injects the shared context.
    const yoga = createYoga({
      schema,
      context // Set resolver context
    })

    // Create a plain HTTP server so the GraphQL endpoint can run in Docker or locally.
    const server = createServer(yoga) // eslint-disable-line @typescript-eslint/no-misused-promises

    // Bind to the fixed local port used throughout the frontend and README docs.
    server.listen(PORT, () => {
      console.info('Server is running on http://localhost:4000/graphql')
    })
  } catch (error) {
    console.error('Error starting server', error)
  }
}

void main()
