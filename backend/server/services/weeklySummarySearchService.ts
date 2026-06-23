import { Document } from '@langchain/core/documents'
import { Embeddings } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'

import { readJsonFile, writeJsonFile } from './storage'
import type { WeeklySummary, WeeklySummaryMetrics } from './weeklySummaryService'

/**
 * Persisted vector-search document derived from a weekly summary.
 */
export interface WeeklySummarySearchDocument {
  id: string
  weekStart: string
  weekEnd: string
  generatedAt: string
  summaryParagraph: string
  suggestions: string[]
  metrics: WeeklySummaryMetrics
  searchText: string
  keywordTokens: string[]
  embeddingModel: string
  embedding: number[]
}

export interface WeeklySummarySearchResult {
  score: number
  matchedTerms: string[]
  weeklySummary: WeeklySummary
}

export interface ProductivitySearchAgentResponse {
  query: string
  answer: string
  interpretedQuery: string[]
  matchedWeeks: WeeklySummarySearchResult[]
}

type FocusBucket = 'low' | 'medium' | 'high'
type ProductivityBucket = 'low' | 'medium' | 'high'

interface SearchIntent {
  queryTokens: string[]
  categoryTargets: string[]
  focusTarget?: FocusBucket
  productivityTarget?: ProductivityBucket
  wantsFocusMetric: boolean
  wantsTaskMetric: boolean
  wantsHoursMetric: boolean
  wantsWorkloadMetric: boolean
}

const summariesFilename = 'weeklySummaries.json'
const searchIndexFilename = 'weeklySummarySearchIndex.json'
const defaultEmbeddingDimension = 64
const defaultSearchResultLimit = 5
const defaultSearchMinScore = 0
const embeddingModelName = 'local-deterministic-langchain-v1'
const categoryTokens = ['coding', 'planning', 'meeting', 'research', 'admin', 'other']
const stopWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'like',
  'me',
  'of',
  'on',
  'or',
  'show',
  'similar',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'when',
  'where',
  'which',
  'with',
  'work',
  'worked',
  'weeks'
])

/**
 * Returns the persisted search documents after synchronizing them with the
 * saved weekly summaries on disk.
 *
 * @returns Current search document list.
 */
export async function getWeeklySummarySearchDocuments (): Promise<WeeklySummarySearchDocument[]> {
  return await syncWeeklySummaryVectorStore()
}

/**
 * Rebuilds the persisted weekly-summary search index from the saved summaries.
 *
 * @returns Rebuilt search document list.
 */
export async function rebuildWeeklySummarySearchIndex (): Promise<WeeklySummarySearchDocument[]> {
  return await syncWeeklySummaryVectorStore()
}

/**
 * Runs vector similarity plus heuristic reranking against saved weekly
 * summaries.
 *
 * @param query Natural-language historical search query.
 * @returns Ranked list of matching weeks.
 */
export async function searchWeeklySummaries (query: string): Promise<WeeklySummarySearchResult[]> {
  const normalizedQuery = query.trim()

  if (normalizedQuery === '') {
    throw new Error('Search query is required.')
  }

  const intent = analyzeQuery(normalizedQuery)
  const queryTokens = intent.queryTokens

  if (queryTokens.length === 0) {
    throw new Error('Search query must include at least one meaningful term.')
  }

  const records = await syncWeeklySummaryVectorStore()
  // LangChain's vector-store contract gives Part 2 the required retrieval
  // foundation, while the backing store remains local and inspectable.
  const vectorStore = buildVectorStore(records)
  const rawResults = await vectorStore.similaritySearchWithScore(normalizedQuery, records.length)

  return rawResults
    .map(([document, semanticScore]) => {
      const record = getRecordFromDocument(records, document.metadata.id)
      const matchedTerms = queryTokens.filter(token => record.keywordTokens.includes(token))
      const score = scoreSearchResult(record, intent, matchedTerms, semanticScore)

      return {
        score: Number(score.toFixed(3)),
        matchedTerms,
        weeklySummary: buildWeeklySummary(record)
      }
    })
    .filter(result => result.score >= getSearchMinScore())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return right.weeklySummary.weekStart.localeCompare(left.weeklySummary.weekStart)
    })
    .slice(0, getSearchResultLimit())
}

/**
 * Wraps the weekly-summary search with a lightweight agent-style explanation.
 *
 * @param query Natural-language historical search query.
 * @returns Explanation plus matched search results.
 */
export async function productivitySearchAgent (query: string): Promise<ProductivitySearchAgentResponse> {
  const normalizedQuery = query.trim()

  if (normalizedQuery === '') {
    throw new Error('Search query is required.')
  }

  const interpretedQuery = interpretProductivityQuery(normalizedQuery)
  const rankedResults = await searchWeeklySummaries(normalizedQuery)
  const matchedWeeks = rankedResults.filter(result => result.matchedTerms.length > 0)
  const answer = buildAgentAnswer(normalizedQuery, interpretedQuery, matchedWeeks, rankedResults)

  return {
    query: normalizedQuery,
    answer,
    interpretedQuery,
    matchedWeeks
  }
}

/**
 * Synchronizes the persisted vector records with the saved weekly summaries.
 *
 * @returns Up-to-date search document list.
 */
async function syncWeeklySummaryVectorStore (): Promise<WeeklySummarySearchDocument[]> {
  const summaries = readJsonFile<WeeklySummary[]>(summariesFilename, [])
  const existingRecords = readJsonFile<WeeklySummarySearchDocument[]>(searchIndexFilename, [])
  const existingRecordsById = new Map(existingRecords.map(record => [record.id, record]))
  const embeddings = createEmbeddings()
  const nextRecords: WeeklySummarySearchDocument[] = []

  for (const summary of summaries) {
    const nextRecordWithoutEmbedding = buildSearchRecord(summary)
    const existingRecord = existingRecordsById.get(nextRecordWithoutEmbedding.id)

    // Reuse embeddings whenever the source summary has not materially changed.
    if (existingRecord != null && canReuseEmbedding(existingRecord, nextRecordWithoutEmbedding)) {
      nextRecords.push(existingRecord)
      continue
    }

    nextRecords.push({
      ...nextRecordWithoutEmbedding,
      embeddingModel: embeddingModelName,
      embedding: await embeddings.embedQuery(nextRecordWithoutEmbedding.searchText)
    })
  }

  writeJsonFile(searchIndexFilename, nextRecords)

  return nextRecords
}

/**
 * Instantiates the in-memory LangChain-compatible vector store wrapper.
 *
 * @param records Persisted search documents to load into memory.
 * @returns Vector store ready for similarity search.
 */
function buildVectorStore (records: WeeklySummarySearchDocument[]): WeeklySummaryVectorStore {
  return new WeeklySummaryVectorStore(createEmbeddings(), records)
}

/**
 * Converts a weekly summary into a searchable document with blended natural
 * language and deterministic metric descriptors.
 *
 * @param summary Persisted weekly summary.
 * @returns Search document without embedding fields.
 */
function buildSearchRecord (summary: WeeklySummary): Omit<WeeklySummarySearchDocument, 'embeddingModel' | 'embedding'> {
  const workloadDescriptor = getWorkloadDescriptor(summary.metrics)
  const focusDescriptor = getFocusDescriptor(summary.metrics.averageFocusLevel)
  const productivityDescriptor = getProductivityDescriptor(summary.metrics)
  const taskVolumeDescriptor = getTaskVolumeDescriptor(summary.metrics.taskCount)
  // Blend natural-language output with deterministic metrics so both the
  // semantic layer and keyword overlap layer can contribute to retrieval.
  const searchText = [
    summary.summaryParagraph,
    summary.suggestions.join(' '),
    `Top category ${summary.metrics.topCategory}.`,
    `The week was ${summary.metrics.topCategory} heavy.`,
    `Busiest day ${summary.metrics.busiestDay}.`,
    `${summary.metrics.taskCount} completed tasks.`,
    `${summary.metrics.totalHours} total hours.`,
    `Average focus level ${summary.metrics.averageFocusLevel}.`,
    `This was a ${focusDescriptor} week.`,
    `This was a ${productivityDescriptor} week.`,
    `Task volume was ${taskVolumeDescriptor}.`,
    `The week had a ${workloadDescriptor}.`
  ].join(' ')

  return {
    id: `${summary.weekStart}:${summary.weekEnd}`,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    generatedAt: summary.generatedAt,
    summaryParagraph: summary.summaryParagraph,
    suggestions: summary.suggestions,
    metrics: summary.metrics,
    searchText,
    keywordTokens: tokenize(searchText)
  }
}

/**
 * Drops search-only fields when returning a result back through GraphQL.
 *
 * @param record Search document from the local vector index.
 * @returns Weekly summary payload for API consumers.
 */
function buildWeeklySummary (record: WeeklySummarySearchDocument): WeeklySummary {
  return {
    weekStart: record.weekStart,
    weekEnd: record.weekEnd,
    summaryParagraph: record.summaryParagraph,
    suggestions: record.suggestions,
    generatedAt: record.generatedAt,
    metrics: record.metrics
  }
}

/**
 * Builds the deterministic embedding implementation used for the local vector
 * search index.
 *
 * @returns Embedding provider instance.
 */
function createEmbeddings (): ProductivitySummaryEmbeddings {
  return new ProductivitySummaryEmbeddings({ dimension: getEmbeddingDimension() })
}

/**
 * Parses the optional vector-dimension override from environment variables.
 *
 * @returns Configured embedding dimension or the default.
 */
function getEmbeddingDimension (): number {
  const configuredDimension = Number(process.env.PRODUCTIVITY_VECTOR_DIMENSION)

  if (Number.isInteger(configuredDimension) && configuredDimension > 0) {
    return configuredDimension
  }

  return defaultEmbeddingDimension
}

/**
 * Parses the maximum number of ranked search results to return.
 *
 * @returns Search-result limit.
 */
function getSearchResultLimit (): number {
  const configuredLimit = Number(process.env.PRODUCTIVITY_SEARCH_RESULT_LIMIT)

  if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
    return configuredLimit
  }

  return defaultSearchResultLimit
}

/**
 * Parses the minimum search score threshold from environment variables.
 *
 * @returns Minimum accepted score.
 */
function getSearchMinScore (): number {
  const configuredMinScore = Number(process.env.PRODUCTIVITY_SEARCH_MIN_SCORE)

  if (Number.isFinite(configuredMinScore) && configuredMinScore >= 0) {
    return configuredMinScore
  }

  return defaultSearchMinScore
}

/**
 * Builds the lightweight interpreted-query tokens returned by the search agent.
 *
 * @param query Natural-language historical search query.
 * @returns Interpreted token list used for explanation.
 */
function interpretProductivityQuery (query: string): string[] {
  const intent = analyzeQuery(query)
  const interpretedQuery = [...intent.queryTokens]

  // Lightweight query interpretation lets the "agent" explain what it matched
  // without needing a second LLM call for query rewriting.
  intent.categoryTargets.forEach(category => {
    if (intent.queryTokens.includes(category)) {
      interpretedQuery.push(`category:${category}`)
    }
  })

  if (intent.wantsFocusMetric) {
    interpretedQuery.push('metric:focus')
  }

  if (intent.wantsHoursMetric) {
    interpretedQuery.push('metric:hours')
  }

  if (intent.wantsTaskMetric) {
    interpretedQuery.push('metric:tasks')
  }

  if (intent.wantsWorkloadMetric) {
    interpretedQuery.push('metric:workload')
  }

  if (intent.focusTarget != null) {
    interpretedQuery.push(`focus:${intent.focusTarget}`)
  }

  if (intent.productivityTarget != null) {
    interpretedQuery.push(`productivity:${intent.productivityTarget}`)
  }

  return [...new Set(interpretedQuery)]
}

/**
 * Extracts search intent such as category, focus, workload, and productivity
 * preferences from a natural-language query.
 *
 * @param query Natural-language historical search query.
 * @returns Parsed search intent used for reranking.
 */
function analyzeQuery (query: string): SearchIntent {
  const normalizedQuery = query.toLowerCase()
  const queryTokens = tokenize(query)
  const categoryTargets = categoryTokens.filter(category => queryTokens.includes(category))
  const focusTarget = getRequestedFocusBucket(normalizedQuery, queryTokens)
  const productivityTarget = getRequestedProductivityBucket(normalizedQuery, queryTokens)
  const wantsTaskMetric = queryTokens.includes('task') || queryTokens.includes('tasks') || includesAnyPhrase(normalizedQuery, [
    'lots of tasks',
    'lot of tasks',
    'many tasks',
    'few tasks'
  ])
  const wantsHoursMetric = queryTokens.includes('hours') || queryTokens.includes('time')
  const wantsFocusMetric = focusTarget != null || includesAnyToken(queryTokens, ['focus', 'focused', 'concentration'])
  const wantsWorkloadMetric = productivityTarget != null ||
    wantsTaskMetric ||
    wantsHoursMetric ||
    includesAnyToken(queryTokens, ['productive', 'productivity', 'workload', 'output', 'busy', 'busiest'])

  return {
    queryTokens,
    categoryTargets,
    focusTarget,
    productivityTarget,
    wantsFocusMetric,
    wantsTaskMetric,
    wantsHoursMetric,
    wantsWorkloadMetric
  }
}

/**
 * Tokenizes free text into normalized keyword terms for matching.
 *
 * @param value Text to tokenize.
 * @returns Unique normalized search tokens.
 */
function tokenize (value: string): string[] {
  const normalizedValue = value.toLowerCase()
  const rawTokens = normalizedValue.match(/[a-z0-9]+/g) ?? []

  return [...new Set(rawTokens.filter(token => token.length >= 2 && !stopWords.has(token)))]
}

/**
 * Combines semantic similarity with metric-aware reranking for one result.
 *
 * @param record Candidate search document.
 * @param intent Parsed user intent.
 * @param matchedTerms Query terms found in the search document.
 * @param semanticScore Raw vector similarity score.
 * @returns Final reranked score.
 */
function scoreSearchResult (record: WeeklySummarySearchDocument, intent: SearchIntent, matchedTerms: string[], semanticScore: number): number {
  const metrics = record.metrics
  const queryTokens = intent.queryTokens
  const overlapRatio = queryTokens.length === 0 ? 0 : matchedTerms.length / queryTokens.length
  // Start with vector similarity, then bias toward results whose deterministic
  // metrics line up with the user's expressed intent.
  let score = semanticScore + (overlapRatio * 0.6)
  const taskVolumeScore = normalizeMetric(metrics.taskCount, 12)
  const hoursScore = normalizeMetric(metrics.totalHours, 18)
  const productivityScore = getProductivityScore(metrics)

  intent.categoryTargets.forEach(category => {
    if (metrics.topCategory === category) {
      score += 1.1
    } else {
      score -= 0.2
    }
  })

  if (intent.wantsFocusMetric) {
    score += normalizeMetric(metrics.averageFocusLevel, 10) * 0.15
  }

  if (intent.focusTarget != null) {
    score += scoreFocusBucketMatch(intent.focusTarget, metrics.averageFocusLevel)
  }

  if (intent.wantsTaskMetric) {
    score += taskVolumeScore * 0.4
  }

  if (intent.wantsHoursMetric) {
    score += hoursScore * 0.25
  }

  if (intent.wantsWorkloadMetric) {
    score += productivityScore * 0.2
  }

  if (intent.productivityTarget === 'high') {
    score += productivityScore * 1.25
    score += taskVolumeScore * 0.45

    if (productivityScore < 0.4) {
      score -= 0.9
    }
  }

  if (intent.productivityTarget === 'low') {
    score += (1 - productivityScore) * 1.1
    score += (1 - taskVolumeScore) * 0.35

    if (productivityScore > 0.75) {
      score -= 0.6
    }
  }

  return score
}

function getWorkloadDescriptor (metrics: WeeklySummaryMetrics): string {
  if (metrics.taskCount >= 12 || metrics.totalHours >= 18) {
    return 'high workload'
  }

  if (metrics.taskCount >= 6 || metrics.totalHours >= 10) {
    return 'medium workload'
  }

  return 'low workload'
}

function getFocusDescriptor (averageFocusLevel: number): string {
  const focusBucket = getFocusBucket(averageFocusLevel)

  if (focusBucket === 'high') {
    return 'high focus'
  }

  if (focusBucket === 'medium') {
    return 'medium focus'
  }

  return 'low focus'
}

function getProductivityDescriptor (metrics: WeeklySummaryMetrics): string {
  const productivityBucket = getProductivityBucket(metrics)

  if (productivityBucket === 'high') {
    return 'very productive'
  }

  if (productivityBucket === 'medium') {
    return 'productive'
  }

  return 'not very productive'
}

function getTaskVolumeDescriptor (taskCount: number): string {
  if (taskCount >= 10) {
    return 'many tasks'
  }

  if (taskCount >= 5) {
    return 'some tasks'
  }

  return 'few tasks'
}

function getFocusBucket (averageFocusLevel: number): FocusBucket {
  if (averageFocusLevel <= 3) {
    return 'low'
  }

  if (averageFocusLevel <= 7) {
    return 'medium'
  }

  return 'high'
}

function getProductivityScore (metrics: WeeklySummaryMetrics): number {
  const taskScore = normalizeMetric(metrics.taskCount, 12)
  const hoursScore = normalizeMetric(metrics.totalHours, 18)

  return Number(((taskScore * 0.65) + (hoursScore * 0.35)).toFixed(6))
}

function getProductivityBucket (metrics: WeeklySummaryMetrics): ProductivityBucket {
  const productivityScore = getProductivityScore(metrics)

  if (productivityScore >= 0.75) {
    return 'high'
  }

  if (productivityScore >= 0.4) {
    return 'medium'
  }

  return 'low'
}

function scoreFocusBucketMatch (targetBucket: FocusBucket, averageFocusLevel: number): number {
  const actualBucket = getFocusBucket(averageFocusLevel)

  if (actualBucket === targetBucket) {
    return 1.1
  }

  if (targetBucket === 'medium' || actualBucket === 'medium') {
    return -0.2
  }

  return -0.55
}

function getRequestedFocusBucket (normalizedQuery: string, queryTokens: string[]): FocusBucket | undefined {
  if (includesAnyPhrase(normalizedQuery, ['high focus', 'very focused', 'deep focus', 'deep work'])) {
    return 'high'
  }

  if (includesAnyPhrase(normalizedQuery, ['medium focus', 'balanced focus', 'moderate focus'])) {
    return 'medium'
  }

  if (includesAnyPhrase(normalizedQuery, ['low focus', 'shallow focus'])) {
    return 'low'
  }

  if (includesAnyToken(queryTokens, ['focus', 'focused'])) {
    if (includesAnyToken(queryTokens, ['high', 'deep'])) {
      return 'high'
    }

    if (queryTokens.includes('medium')) {
      return 'medium'
    }

    if (includesAnyToken(queryTokens, ['low', 'shallow'])) {
      return 'low'
    }
  }

  return undefined
}

function getRequestedProductivityBucket (normalizedQuery: string, queryTokens: string[]): ProductivityBucket | undefined {
  if (includesAnyPhrase(normalizedQuery, ['not very productive', 'low workload', 'light workload', 'few tasks', 'low output'])) {
    return 'low'
  }

  if (includesAnyPhrase(normalizedQuery, ['very productive', 'high workload', 'heavy workload', 'lots of tasks', 'lot of tasks', 'many tasks', 'high output'])) {
    return 'high'
  }

  if (includesAnyToken(queryTokens, ['unproductive', 'slow'])) {
    return 'low'
  }

  if (includesAnyToken(queryTokens, ['productive', 'productivity', 'workload', 'busy', 'busiest', 'heavy', 'many', 'lot', 'lots'])) {
    return 'high'
  }

  return undefined
}

function includesAnyPhrase (value: string, phrases: string[]): boolean {
  return phrases.some(phrase => value.includes(phrase))
}

function includesAnyToken (tokens: string[], candidates: string[]): boolean {
  return candidates.some(candidate => tokens.includes(candidate))
}

function normalizeMetric (value: number, ceiling: number): number {
  return Math.min(value / ceiling, 1)
}

function buildAgentAnswer (
  query: string,
  interpretedQuery: string[],
  matchedWeeks: WeeklySummarySearchResult[],
  rankedResults: WeeklySummarySearchResult[]
): string {
  if (matchedWeeks.length === 0) {
    if (rankedResults.length === 0) {
      return `I couldn't find any saved weekly summaries to compare against "${query}" yet. Generate a few weekly summaries first, then try again with a category, focus pattern, or workload term.`
    }

    return `I couldn't find a direct keyword match for "${query}" in the saved weekly summaries. Try a more specific query such as a category like coding, a metric like hours or tasks, or a focus-oriented phrase like high focus.`
  }

  const bestMatch = matchedWeeks[0]
  const bestMetrics = bestMatch.weeklySummary.metrics
  const bestRange = formatWeekRange(bestMatch.weeklySummary.weekStart, bestMatch.weeklySummary.weekEnd)

  if (matchedWeeks.length === 1) {
    return `I found one strong match for "${query}": ${bestRange}. That week was led by ${bestMetrics.topCategory}, with ${bestMetrics.taskCount} completed tasks across ${bestMetrics.totalHours} hours and an average focus level of ${bestMetrics.averageFocusLevel}.`
  }

  const secondaryRange = formatWeekRange(matchedWeeks[1].weeklySummary.weekStart, matchedWeeks[1].weeklySummary.weekEnd)

  return `I found ${matchedWeeks.length} relevant weeks for "${query}". The strongest match was ${bestRange}, led by ${bestMetrics.topCategory} with ${bestMetrics.taskCount} completed tasks across ${bestMetrics.totalHours} hours and average focus ${bestMetrics.averageFocusLevel}. Another close match was ${secondaryRange}. I interpreted your query using: ${interpretedQuery.join(', ')}.`
}

function formatWeekRange (weekStart: string, weekEnd: string): string {
  return `${weekStart} to ${weekEnd}`
}

function getRecordFromDocument (
  records: WeeklySummarySearchDocument[],
  recordId: unknown
): WeeklySummarySearchDocument {
  const matchingRecord = records.find(record => record.id === recordId)

  if (matchingRecord == null) {
    throw new Error('Weekly summary search record was missing for a retrieved vector document.')
  }

  return matchingRecord
}

function canReuseEmbedding (
  existingRecord: WeeklySummarySearchDocument,
  nextRecord: Omit<WeeklySummarySearchDocument, 'embeddingModel' | 'embedding'>
): boolean {
  return existingRecord.generatedAt === nextRecord.generatedAt &&
    existingRecord.searchText === nextRecord.searchText &&
    existingRecord.embeddingModel === embeddingModelName &&
    existingRecord.embedding.length === getEmbeddingDimension()
}

/**
 * Deterministic local embedding implementation used so search works without a
 * second hosted AI dependency.
 */
class ProductivitySummaryEmbeddings extends Embeddings {
  private readonly dimension: number

  constructor (params: { dimension: number }) {
    super({})
    this.dimension = params.dimension
  }

  /**
   * Embeds multiple documents for LangChain compatibility.
   *
   * @param documents Search document texts.
   * @returns Dense vectors for each document.
   */
  async embedDocuments (documents: string[]): Promise<number[][]> {
    return documents.map(document => this.embedText(document))
  }

  /**
   * Embeds one search query or summary text.
   *
   * @param document Text to embed.
   * @returns Dense vector for that text.
   */
  async embedQuery (document: string): Promise<number[]> {
    return this.embedText(document)
  }

  private embedText (value: string): number[] {
    // Deterministic hashed embeddings keep Part 2 runnable without a separate
    // hosted embedding provider while still fitting LangChain interfaces.
    const vector = Array.from({ length: this.dimension }, () => 0)
    const tokens = tokenize(value)

    tokens.forEach((token, index) => {
      const primaryIndex = hashToken(token, this.dimension)
      const secondaryIndex = hashToken(`${token}:${index}`, this.dimension)
      vector[primaryIndex] += 1.5
      vector[secondaryIndex] += 0.75
    })

    return normalizeVector(vector)
  }
}

/**
 * Tiny in-memory vector store that satisfies LangChain's search contract while
 * persisting the underlying records in JSON.
 */
class WeeklySummaryVectorStore extends VectorStore {
  declare FilterType: string

  private records: WeeklySummarySearchDocument[]

  constructor (embeddings: ProductivitySummaryEmbeddings, records: WeeklySummarySearchDocument[] = []) {
    super(embeddings, {})
    this.records = records
  }

  /**
   * Returns the vector-store type used by LangChain diagnostics.
   *
   * @returns Stable vector-store type identifier.
   */
  _vectorstoreType (): string {
    return 'weekly-summary-search'
  }

  /**
   * Updates existing records with newly computed embeddings.
   *
   * @param vectors Dense vectors to persist.
   * @param documents Search documents associated with those vectors.
   * @returns Updated record identifiers.
   */
  async addVectors (vectors: number[][], documents: Document[]): Promise<string[]> {
    const nextRecords = documents.map((document, index) => {
      const record = getRecordFromDocument(this.records, document.metadata.id)

      return {
        ...record,
        embedding: vectors[index]
      }
    })

    this.records = nextRecords

    return nextRecords.map(record => record.id)
  }

  /**
   * Embeds and adds documents through the LangChain vector-store interface.
   *
   * @param documents Search documents to embed.
   * @returns Added record identifiers.
   */
  async addDocuments (documents: Document[]): Promise<string[]> {
    const vectors = await this.embeddings.embedDocuments(documents.map(document => document.pageContent))

    return await this.addVectors(vectors, documents)
  }

  /**
   * Computes in-memory cosine similarity for each stored search record.
   *
   * @param query Query embedding vector.
   * @param k Maximum results to return.
   * @returns Top `k` search documents with similarity scores.
   */
  async similaritySearchVectorWithScore (query: number[], k: number): Promise<Array<[Document, number]>> {
    // Search stays fully in-memory because the persisted JSON index is loaded
    // once per query and is tiny for the take-home scale.
    return this.records
      .map(record => {
        const document = new Document({
          pageContent: record.searchText,
          metadata: {
            id: record.id,
            weekStart: record.weekStart,
            weekEnd: record.weekEnd
          }
        })

        return [document, cosineSimilarity(query, record.embedding)] as [Document, number]
      })
      .sort((left, right) => right[1] - left[1])
      .slice(0, k)
  }
}

/**
 * Hashes a token into a deterministic vector index.
 *
 * @param value Token to hash.
 * @param dimension Embedding dimension.
 * @returns Stable vector position.
 */
function hashToken (value: string, dimension: number): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) % dimension
  }

  return hash
}

/**
 * Normalizes a vector to unit length for cosine similarity.
 *
 * @param vector Dense vector to normalize.
 * @returns Normalized dense vector.
 */
function normalizeVector (vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0))

  if (magnitude === 0) {
    return vector
  }

  return vector.map(value => Number((value / magnitude).toFixed(6)))
}

/**
 * Computes cosine similarity between two equally sized dense vectors.
 *
 * @param left Left-hand vector.
 * @param right Right-hand vector.
 * @returns Cosine similarity score.
 */
function cosineSimilarity (left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error('Cannot compare vectors with different dimensions.')
  }

  return Number(left.reduce((sum, value, index) => sum + (value * right[index]), 0).toFixed(6))
}
