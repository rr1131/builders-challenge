# Technical Decisions

## 1. React frontend

The prompt explicitly asked for a React project, and the starter repo already had a React-based structure. I kept the core user experience in React and built the productivity tracker around a weekly “Week at a Glance” dashboard.

The only other major frontend page is AddTaskPage.tsx, which handles both task creation and task editing. I chose to isolate that flow so the main productivity tracker page wouldn't get overcrowded. 
###  One primary productivity dashboard

I chose to center the user experience around one main productivity dashboard instead of splitting the tracker, summary, and search flows across several disconnected pages. I drew some inspiration from visibility dashboards I have worked on and seen in NDR/EDR-style products, where the goal is to surface multiple related signals in one place.
The core product flow is simple:

1. log productivity tasks
2. review a selected week
3. generate a weekly summary
4. query for weeks matching intended search criteria

The intention of having all the core functionalities accessible in the landing page was to make the Productivity Tracker landing page feel more fleshed out. I began by having a separate search page where the search results would surface more metadata about the match but it made the experience feel more fragmented than necessary for the scope of this project.

## 2. GraphQL backend

Similarly, I used the existing GraphQL backend pattern instead of introducing a separate REST API layer.

The tracker needs a small but structured set of operations:

* fetch tasks by week
* create, update, and delete tasks
* fetch a saved weekly summary
* generate a new weekly summary
* search historical summaries
* return an agent-style explanation for search results

GraphQL was a good fit because it kept the frontend/backend contract explicit and consistent with the starter project’s architecture.

## 3. Service-layer separation

I separated backend behavior into resolver files and service files.

The resolver layer handles API orchestration, while service files handle the actual domain logic:

* `taskService.ts` for task CRUD and validation.
* `weeklySummaryService.ts` for summary generation, metrics, persistence, and invalidation.
* `weeklySummarySearchService.ts` for historical search, vector index syncing, embeddings, reranking, and agent explanations.
* `anthropicService.ts` owns the GenAI provider call and response parsing.

Although its not super valuable within the scope of this project, the ideology here is that the separation would allow for me to replace the existing JSON persistence with a database without having to rewrite entire React App.

## 4. GenAI Summary Decisions

For the weekly summary feature, I kept the GenAI integration backend-only. This keeps provider credentials out of the browser and gives the backend a chance to compute metrics, build a structured prompt, validate the model response, and persist the final summary before the UI displays it.

The backend summary flow is:

1. Load the selected week’s tasks.
2. Compute deterministic productivity metrics.
3. Build a structured prompt from the metrics and task data.
4. Call the GenAI provider.
5. Validate the generated response.
6. Save the summary.
7. Rebuild the historical search index.

I made summary generation an explicit user action instead of automatically generating summaries after every task change. This avoids surprise API usage, avoids hidden background failures, and makes the AI boundary clearer during review. Also, I only deposited $5 of Claude console credits to my account and did not want automatic regeneration burning through them :)

Although summary generation is manual, summary invalidation is automatic. When a task is created, edited, or deleted, the backend invalidates the affected weekly summary. I added this after noticing that an outdated summary could still appear in search results after its underlying tasks had been deleted.

To support this, I used task signatures to represent the exact task set behind a generated weekly summary. This way a saved summary is only valid if its stored task signature still matches the current tasks for that week. 

I also structured the AI prompt so the provider returns predictable JSON-like content that can be parsed and validated before saving. This was slightly annoying to implement but it made the generated output easier to persist, display, and reuse in historical search.

## 5. Historical Search Decisions

I chose a LangChain-compatible search design because vector-store abstractions fit the project requirements naturally while still letting me keep the setup lightweight.

The historical search flow works by converting generated weekly summaries into searchable records. Each record includes the summary text, suggestions, weekly metrics, category breakdowns, focus data, and related metadata. Users can then ask natural-language questions like:

* “show me my coding-heavy weeks”
* “when was I most productive?”
* “show me low focus weeks”

I used deterministic local embeddings instead of a hosted embedding model because I wanted the feature to work locally without requiring another API key, paid service, or external vector database. The tradeoff is that deterministic embeddings are not as semantically strong as production-grade embeddings, but they are reproducible, inspectable, and good enough for a take-home demo when paired with additional ranking logic.

To make search results more believable, I added heuristic reranking on top of vector similarity. Initial testing demonstrated that pure semantic similarity was not reliable enough for productivity-specific questions. For example, “coding-heavy weeks” should prioritize weeks with actual coding time, and “most productive weeks” should consider task count and total hours rather than just similar wording.

The reranking layer considers:

* semantic similarity
* category match
* focus bucket match
* task count
* total hours
* productivity/workload intent

The vector index is persisted locally as JSON. This keeps the setup simple and allows the index to be rebuilt from saved weekly summaries through the seed script. In production, I would likely replace this local setup with a stronger embedding model and a real vector store such as `pgvector`, Pinecone, Weaviate, or another managed option.

## 6. Seeded demo data

The prompt asked for sample data or scripts to populate the vector store for testing historical productivity search.

I included a seed script that creates a realistic June demo dataset, writes prebuilt weekly summaries, and rebuilds the local search index.

This helps reviewers test the main features immediately:

* task dashboard
* weekly visualizations
* saved summaries
* historical search
* agent-style explanations

It also avoids forcing reviewers to manually create multiple weeks of tasks or consume API credits just to test the advanced feature.

## 7. Room for improvement :)

The main infrastructure choices were optimized for something I could piece together over a weekend, not production scale.

If I were continuing this project, the most likely upgrades would be:

* replace JSON persistence with Postgres
* deploy the app on AWS or Render
* flesh out the historical search functionality to take into account raw task data as well as summary
* replace the JSON vector index with `pgvector` or a hosted vector database
* add user authentication for multi-user support
* add background jobs for index rebuilding
* add API-level integration tests
* add observability around summary generation and search behavior
