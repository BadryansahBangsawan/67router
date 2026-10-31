---
title: "Agent Protocols Guide"
version: 3.8.40
lastUpdated: 2026-06-28
---

# Agent Protocols Guide

> **Source:** `src/lib/acp/`, `src/app/api/acp/`
> **Last updated:** 2026-06-28 — v3.8.40

67router keeps one agent protocol surface: **ACP**, the local CLI agent registry. The A2A
JSON-RPC endpoint, its Agent Card and its built-in skills were removed; only the A2A task store
remains, as the place the Conductor fleet mirrors its runs into (read it through
`/api/a2a/tasks`, see [API_REFERENCE.md](../reference/API_REFERENCE.md#a2a-tasks)).

## TL;DR

| Surface                       | Best for                                                                                                                                   | Transport | Standard           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------ |
| **ACP — CLI Agents Registry** | Detecting / registering / launching CLI coding agents installed on the user's machine (Cursor, Cline, Codex CLI, Claude Code, Aider, etc.) | HTTP REST | OmniRoute-specific |

## Decision Tree

```
Do you need to list / configure CLI coding agents installed locally?
├─ YES → ACP (GET /api/acp/agents)
└─ NO → Use plain /v1/chat/completions
```

## ACP — CLI Agents Registry

**OmniRoute endpoint:** `GET /api/acp/agents`
**Source:** `src/lib/acp/{index,manager,registry}.ts`

### What it is

ACP is OmniRoute's **local CLI agent inventory**. It detects which coding CLIs are installed on the host (Cursor, Cline, Claude Code, Codex CLI, Continue, etc.), resolves their versions, and surfaces them to the dashboard so the user can wire each CLI to point at OmniRoute.

The HTTP surface is an internal inventory that powers the "CLI Tools" UI and
CLI fingerprint tracking (see [CLI-TOOLS.md](../reference/CLI-TOOLS.md)). Separately,
the internal process manager supports native Agent Client Protocol for the
registered Gemini launcher and legacy stdio adapters for other contracts.
See [ACP registry and launchers](./ACP.md) for those distinct modes and limits.

### What it does

- Probes the host for installed CLI binaries (uses `which` / `where` per OS)
- Reads each CLI's version (calls `<bin> --version`)
- Optionally accepts user-defined custom agents (binary path + version probe + spawn args)
- Persists custom agents in settings
- Returns the unified list to the dashboard

### REST API

| Endpoint          | Method | Description                                                   | Auth    |
| ----------------- | ------ | ------------------------------------------------------------- | ------- |
| `/api/acp/agents` | GET    | List detected + custom agents (installed/total counts)        | API key |
| `/api/acp/agents` | POST   | Add/update/remove custom agent (action discriminator in body) | API key |

Body shape for POST (`customAgentBodySchema` in `src/app/api/acp/agents/route.ts`):

```json
{
  "action": "add|update|remove",
  "id": "cursor",
  "name": "Cursor",
  "binary": "/usr/local/bin/cursor",
  "versionCommand": "--version",
  "providerAlias": "cursor",
  "spawnArgs": ["--api-base", "http://localhost:20128"],
  "protocol": "stdio"
}
```

### Use cases

- Dashboard "CLI Tools" page lists what's installed and helps you point each at OmniRoute
- Custom agents let power users register internal/proprietary CLIs that OmniRoute doesn't know about by default
- Detection result fuels the `cli-tools` fingerprint matrix

### When NOT to use ACP

- The HTTP registry does not accept tasks or expose process spawning. The internal
  manager can launch a registered CLI, but is not wired as an automatic provider
  fallback. For ordinary interactive use, launch the configured CLI yourself or
  use `omniroute run`.

## Integration Examples

### List installed CLI agents via ACP

```bash
curl http://localhost:20128/api/acp/agents \
  -H "Authorization: Bearer <api-key>"
```

### Add a custom CLI agent

```bash
curl -X POST http://localhost:20128/api/acp/agents \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "id": "my-custom-cli",
    "name": "My Custom CLI",
    "binary": "/opt/mycli/bin/mycli",
    "versionCommand": "--version",
    "providerAlias": "openai"
  }'
```

## When to Use What

- **Chatbot / copilot frontend** → `/v1/chat/completions` (OpenAI-compat — not an agent protocol)
- **Listing local CLIs in the dashboard** → ACP

## Internal Architecture

```
   ┌─────────────────────┐
   │   OmniRoute Core    │
   └─────────────────────┘
              ↑
         ┌─────────┐
         │   ACP   │
         │ (/acp)  │
         └─────────┘
              │
              ↓
         Local CLI
         binaries on
         the host
```

## See Also

- [CLI-TOOLS.md](../reference/CLI-TOOLS.md) — External CLI integrations (uses ACP)
- [SKILLS.md](./SKILLS.md) — Skills framework (local execution sandbox)
- [API_REFERENCE.md](../reference/API_REFERENCE.md#agents-protocol) — endpoint reference
- Source: `src/lib/acp/`
