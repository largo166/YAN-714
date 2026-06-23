# API Contract

## Project Center

- `GET /api/projects/{id}/overview`
  - Response: `{ "files": number, "meetings": number, "todos": number, "minutes": number, "risks": number, "assets": number, "gaps": number }`
  - Notes: counts are read-only aggregates; `gaps` is `0` until there is a clean data source.

- `GET /api/projects/{id}/milestones`
  - Response: `{ "items": [ { "title": string, "owner": string, "due": string, "urgent": boolean } ] }`
  - Source: latest confirmed `meeting_minutes.todos_json` per meeting in the project.

- `GET /api/projects/{id}/progress`
  - Response: `{ "pct": number, "next_node": string, "next_due": string }`
  - Notes: based on confirmed milestones and reflow status; no clean source returns `pct=0` and empty node fields.

- `GET /api/projects/{id}/risks`
  - Response: `{ "items": [ { "level": "high" | "medium", "text": string } ] }`
  - Source: latest structured JSON risk items from project analyses with task `difficulty` or `overview`.

- `GET /api/projects/{id}/reusable-assets`
  - Response: `{ "items": [ { "kind": string, "name": string } ] }`
  - Source: knowledge documents linked by active project files' `indexed_doc_id`.

- Project chips
  - `ProjectOut` includes `city: string` and `client: string`.
  - `POST /api/projects` and `PUT /api/projects/{id}` accept optional `city` and `client`.

## Knowledge Base

- `GET /api/knowledge/stats`
  - Response: `{ "documents": number, "indexed": number, "chunks": number, "cjk_chunks": number, "engine": "fts5" | "like" }`
  - Notes: chunks are computed from non-empty document text blocks; no fake chunk table is introduced.

## Collaboration Hub

- `GET /api/team/members`
  - Response: `{ "items": [ { "id": number, "name": string, "role": string, "duty": string, "birthday": string, "assignments": [ { "task_title": string, "due": string, "project_id": number } ] } ] }`

- `POST /api/team/members`
  - Body: `{ "name": string, "role"?: string, "duty"?: string, "birthday"?: string, "status"?: string }`
  - Response: `{ "id": number, "name": string, "role": string, "duty": string, "birthday": string }`

- `PUT /api/team/members/{id}`
  - Body: partial `{ "name": string, "role": string, "duty": string, "birthday": string, "status": string }`
  - Response: `{ "id": number, "name": string, "role": string, "duty": string, "birthday": string, "assignments": [] }`

- `DELETE /api/team/members/{id}`
  - Response: `204 No Content`
  - Notes: soft delete only; sets `status="trashed"`.

- `POST /api/projects/{id}/team-assignments`
  - Body: `{ "member_id": number, "task_title": string, "due"?: string }`
  - Response: `{ "id": number, "member_id": number, "project_id": number, "task_title": string, "due": string, "created_at": string }`

- `POST /api/projects/batch-ingest/preview`
  - Body: `{ "root_path": string }`
  - Response: `{ "accessible": boolean, "root": string, "total_projects": number, "total_supported": number, "total_unsupported": number, "projects": [ { "project_name": string, "path": string, "supported_count": number, "unsupported_count": number, "files": [ { "path": string, "size": number, "ext": string } ], "unsupported": [ { "path": string, "size": number, "ext": string } ] } ] }`
  - Notes: read-only; scans first-level folders as project folders and counts parser-supported files, including text docs, PDF, Office, xlsx text extraction, and image asset metadata.

- `POST /api/projects/batch-ingest/import`
  - Body: `{ "root_path": string, "project_names"?: string[], "index_to_knowledge"?: boolean }`
  - Response: `{ "status": "ok", "root": string, "total_projects": number, "copied": number, "indexed": number, "failed": number, "skipped_existing": number, "projects": [ { "project_id": number, "project_name": string, "copied": number, "indexed": number, "failed": number, "skipped_existing": number } ] }`
  - Notes: copies supported files into ROM-AI uploads, never moves originals, creates or matches projects by folder name, and optionally indexes parsed text/asset metadata into knowledge documents. Images are asset metadata only, not OCR.

- `GET /api/agents`
  - Response: `{ "items": [ { "id": string, "name": string, "role": string, "duty": string, "output": string, "status": "ok" | "plan" } ] }`
  - Notes: directory only; it does not replace chat execution.

- `GET /api/broadcast/ticker`
  - Response: `{ "items": [ { "kind": "broadcast" | "birthday", "text": string } ] }`

## Boss Dashboard

- `GET /api/boss/dashboard`
  - Response: `{ "active_projects": number, "near_delivery": number, "high_risks": number, "ai_usage_week": number }`
  - Notes: `near_delivery` is `0` until there is a clean milestone date source.

- `GET /api/boss/workload`
  - Response: `{ "items": [ { "name": string, "pct": number, "level": "high" | "medium" | "low" } ] }`

- `GET /api/broadcast/broadcasts`
  - Response: `{ "items": [ { "id": number, "text": string, "created_at": string } ] }`

- `POST /api/broadcast/broadcasts`
  - Body: `{ "text": string }`
  - Response: `{ "id": number, "text": string, "created_at": string }`

- `GET /api/boss/ai-usage`
  - Response: `{ "items": [ { "capability": string, "count": number } ] }`

- `GET /api/boss/feishu-board`
  - Response: `{ "status": "not_configured", "items": [] }`

- `GET /api/boss/comments`
  - Response: `{ "status": "not_configured", "items": [] }`

## Result Send

- `GET /api/result-send/channels`
  - Response: `{ "items": [ { "channel": "email" | "wecom" | "wx", "configured": boolean, "label": string } ] }`

- `POST /api/result-send/preview`
  - Body: `{ "content": string, "channel": "email" | "wecom" | "wx" }`
  - Configured response: `{ "status": "preview", "rendered": string, "channel": string }`
  - Not configured response: `{ "status": "not_configured", "rendered": "", "channel": string }`
  - Notes: preview only; it does not send externally.

## Meeting Reflow

- `POST /api/projects/{id}/meetings/{meeting_id}/minute/{minute_id}/reflow`
  - Response: `{ "status": "ok", "reflowed_count": number }`
  - Notes: requires `review_status="confirmed"`; idempotent, repeated calls return `reflowed_count=0`.
