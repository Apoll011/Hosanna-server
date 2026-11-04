# Hosanna OpenAPI

Hand-maintained OpenAPI 3.1 description of the production REST API under `/api`.

- Spec: [`openapi.yaml`](./openapi.yaml)
- Regenerator: [`generate.mjs`](./generate.mjs) (rebuilds the YAML from an in-script inventory)

```bash
npm run openapi:generate
```

## Scope

| Included | Excluded |
| -------- | -------- |
| Health, billing, cron, songs, folders, services, notes, annotations, replication, trash, backup, AI, YouTube/Cifra, notifications | Better Auth (`/api/auth/*`) — use Better Auth docs/clients |
| | MCP (`/mcp`) |

Auth: Better Auth session cookie **or** `Authorization: Bearer`. Cron routes use `CRON_SECRET` as Bearer.

## Consumers

Studio and Flutter generate typed clients from this file on `feat/openapi-client` branches (`openapi-typescript` / `openapi-fetch`, Dart Dio).
