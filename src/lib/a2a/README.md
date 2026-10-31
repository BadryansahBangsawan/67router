# A2A task store

67router removed the public A2A protocol surface (the `/a2a` JSON-RPC endpoint, the
`/.well-known/agent.json` Agent Card, the built-in skills and the A2A dashboard tab). What is
left here is the task store the Conductor bridge mirrors hub tasks into:

- `taskManager.ts` — `A2ATaskManager`: in-memory tasks with TTL, persisted through
  `src/lib/db/a2aTasks.ts`, publishing `agent.task.updated` events for the Orchestration canvas.
- `authenticate.ts` — owner resolution for the REST task routes.

REST routes: `GET /api/a2a/tasks`, `GET /api/a2a/tasks/history`, `GET /api/a2a/tasks/{id}`,
`POST /api/a2a/tasks/{id}/cancel`, and `POST /api/a2a/tasks` (Conductor fleet delegation).
