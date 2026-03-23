# TaskFlow Handoff Document
**Last updated: March 23, 2026**
**Latest commit: `383dca8` on `main`**
**Deployed: Vercel (auto-deploy from GitHub)**
**Live URL: taskflow-seven-smoky.vercel.app**

---

## What is TaskFlow?
A **lightweight human-agent task coordination layer** — NOT a full PM tool. Intentionally bare minimum. The core idea: organize tasks between human staff and AI agents, where any worker (person or agent) takes a task, works with files in folders, and delivers output.

## Vision & Philosophy
- Anti-SaaS, free trial version, simple
- Tool-agnostic: doesn't care HOW work gets done, just WHAT, WHO, and WHERE
- AI agent integration is a future layer on top, not baked into the core
- The `type: person | agent` field on members is the core differentiator
- "Review" column = human checkpoint for agent-completed work

## Workflow Model
1. **Task** = instruction (e.g., "Create Excel with monthly social media posts")
2. **Worker** = person or agent (either can do it)
3. **Input** = source folder(s) with assets
4. **Output** = deliverable saved to a designated folder
5. **Review** = human checks output, approves or sends back
6. **Flow**: To Do → In Progress → Review → Done

---

## Tech Stack
- **Frontend**: React + Tailwind + shadcn/ui
- **Backend**: Express + Drizzle ORM
- **Database**: Supabase PostgreSQL (Session Pooler, IPv4)
- **Bundler**: Vite
- **Routing**: wouter with `useHashLocation` (hash-based `/#/path`)
- **Deployment**: Vercel serverless at `api/index.ts` with inlined schema
- **API pattern**: `/api/t/:teamSlug/*` (team-scoped)
- **Excel**: xlsx package for import/export
- **Dev server**: port 5000

## Database Schema (8 tables in `shared/schema.ts`)
| Table | Key Fields |
|-------|-----------|
| **teams** | id, name, slug, passkey, **inviteToken** (unique UUID), createdBy, createdAt |
| **members** | id, teamId, name, role, avatar, color, **type** (person/agent), email, phone, notifyEmail, notifyPhone |
| **projects** | id, teamId, name, color, description, ownerId, **displayOrder** |
| **tasks** | id, teamId, title, description, status, priority, progress, assigneeId, **assigneeIds** (JSON), projectId, dueDate, order, **recurring** (none/daily) |
| **activityLogs** | id, teamId, taskId, authorName, type (comment/change), content |
| **notifications** | id, teamId, recipientName, title, message, taskId, projectId, **read** (TEXT: "true"/"false") |
| **projectFolders** | id, teamId, projectId, name, url, provider (gdrive/onedrive/dropbox/sharepoint/link) |
| **messages** | id, teamId, authorName, content, createdAt |

---

## Key Files & Line Counts
| File | Lines | Purpose |
|------|-------|---------|
| `api/index.ts` | 768 | Vercel serverless — **MUST be synced with routes.ts** |
| `server/routes.ts` | 677 | Express routes for local dev |
| `server/storage.ts` | 328 | DatabaseStorage class, all CRUD |
| `shared/schema.ts` | 135 | Database table definitions (source of truth) |
| `client/src/pages/workspace.tsx` | 1849 | Main 3-column workspace UI |
| `client/src/pages/timeline.tsx` | ~290 | Timeline overview (horizontal Gantt + mobile weekly list) |
| `client/src/components/task-dialog.tsx` | 496 | Task create/edit dialog |
| `client/src/components/notification-bell.tsx` | ~100 | Notification bell + popover |
| `client/src/components/user-selector.tsx` | ~50 | "Working as" dropdown |
| `client/src/components/app-sidebar.tsx` | ~60 | Sidebar navigation |
| `client/src/App.tsx` | ~80 | Routing, TeamProvider, UserProvider |
| 47 files in `components/ui/` | — | shadcn/ui components |

---

## What's Built & Working

### Core Features (All Solid)
- **Team isolation** (multi-tenancy) with slug-based routing
- **Full CRUD** for teams, members, projects, tasks
- **3-column workspace layout**: Projects | Tasks | Details
- **Kanban board** (todo, in_progress, review, done) with drag-and-drop
- **Project management**: grid with mini task previews, draggable order, sort/filter
- **Task management**: full form, activity/comment log, progress tracking
- **Multi-assignee** on tasks (JSON assigneeIds array, checkbox popover)
- **Project folders**: CRUD with provider icons (GDrive, OneDrive, Dropbox, SharePoint, URL)
- **Recurring tasks** checkbox (daily) — grays out due date when enabled
- **Due-soon warning** (amber clock icon for tasks due within 3 days)
- **Excel import/export** (xlsx)
- **Notification bell** with 30s polling
- **"Working as" user selector** (localStorage)
- **Agent type**: 🤖 icon on agent members/assignees
- **Theme toggle** (light/dark)
- **Settings**: JSON + Excel export/import, delete team
- **Team passkeys**: optional on create, required on join if set
- **Admin dashboard** at `/#/admin/taskflow-master-2024`
- **Auto-logging** on task changes (status, assignee, priority, progress)
- **Leave Team / Delete Team** (auto-delete empty teams)

### Timeline Overview (Working)
- Route: `/#/t/:teamSlug/timeline` with CalendarDays nav item in sidebar
- Desktop: horizontal scrollable timeline, one row per project, task dots positioned by due date
- Dot styling: solid = active, semi-transparent = done, red outline = overdue, larger = high priority
- Today marker: amber vertical line with "Today" label
- Hover: tooltip with task title + due date + assignee
- Click dot: opens TaskDialog for that task
- Mobile (<768px): vertical weekly list grouped by This Week / Next Week / Later
- Undated tasks shown as count in header (not on timeline)
- Reuses existing `/projects` and `/tasks` API endpoints (no new backend routes)

### Team Chat (Working)
- Floating panel (bottom-right), toggle via MessageSquare icon in header
- Messages table with GET/POST routes, 3s polling
- Own messages right-aligned (primary color), others left (muted bg)
- Agent members show 🤖 emoji in chat
- Messages cascade-deleted on team delete

### Notifications (Working)
- **Comment @mentions**: Type `@name` in task notes → notification appears in bell icon
  - Frontend: workspace.tsx (lines 139-140, 468-484, 1128-1148) + task-dialog.tsx (lines 69-70, 207-226, 426-453)
  - Backend: api/index.ts (lines 483-505) + routes.ts (lines 345-382)
- **Chat @mentions**: Type `@name` in chat → notification badge on chat icon (NOT bell)
  - Frontend: workspace.tsx (lines 165-178 query+auto-read, 1227-1229 badge)
  - Backend: api/index.ts (lines 727-754) + routes.ts (lines 635-663)
- **notification-bell.tsx** filters OUT chat mentions (line 23): only shows task/comment notifications
- **Task assignment/completion**: Auto-notifications when assigned or completed

### Invite Token Share Links (Working)
- **Purpose**: Hide team slug and hosting domain from share URLs
- On team creation, a random UUID `inviteToken` is generated and stored
- Share link format: `origin/#/join/:token` (no slug or domain leaked)
- `GET /api/join/:token` resolves token → returns team info (slug, name, hasPasskey)
- Frontend `/join/:token` route auto-redirects (or shows passkey prompt if required)
- **Regenerate**: Settings dialog → Share section → "Regenerate link" button
- `POST /api/t/:slug/regenerate-invite` generates new UUID, invalidating old links
- Existing teams backfilled with tokens during migration
- Internal routing still uses slug (`/t/:teamSlug`) — token is only for sharing

### Deployment
- Vercel at `api/index.ts` (inlined schema, all routes mirrored from routes.ts)
- `vercel.json`: rewrites `/api/(.*)` → `/api` and `/(.*)` → `/index.html`
- ADMIN_KEY and DATABASE_URL set in Vercel env vars
- Auto-deploy from GitHub `main` branch

---

## Known Issues / Incomplete

### @mention in Task/Project Descriptions — REMOVED (was broken)
**History**: Attempted to add @mention autocomplete dropdowns to task descriptions and project descriptions. After 6+ iterations (commits `1d4854e` through `c7261a8`), the feature was reverted and fully removed because:
1. **ScrollArea clipping**: Radix UI ScrollArea uses `overflow: hidden` on its Root element, which clips absolutely-positioned dropdown children. The task detail panel wraps content in ScrollArea, making dropdowns invisible.
2. **Duplicate notifications**: Debounced description saves caused partial-name matches (`@Ali` matching "Alice"), creating multiple notifications per keystroke. Fixed with new-vs-old comparison but fundamental UX was broken.
3. **Portal approach failed**: Tried `createPortal` to render dropdown on `document.body`, but blur/click race conditions made selection impossible.

**What was removed** (commit `c7261a8`):
- Backend: @mention detection in task PATCH and project PATCH (both api/index.ts and routes.ts)
- Frontend: dropdown UI, state, and handlers in workspace.tsx and task-dialog.tsx
- Deleted abandoned `mention-textarea.tsx` component

**What still works** (untouched):
- Chat @mentions with badge on chat icon ✅
- Comment @mentions with notification in bell ✅

**If re-implementing**: The core problem is Radix ScrollArea's `overflow: hidden`. Solutions to consider:
- Use `createPortal` with proper `onMouseDown` (not `onClick`) to avoid blur race
- Or add `overflow: visible` to ScrollArea for the detail panel only
- Or use a floating UI library (Floating UI/Popper) that handles positioning outside overflow containers

---

## Important Patterns & Gotchas
- **api/index.ts must be manually synced** with server/routes.ts — no shared code between them
- **Notification `read` field** is TEXT type: stored as string `"false"` / `"true"`, not boolean
- **NO email/SMS notifications** — in-app only. `email`/`phone`/`notifyEmail`/`notifyPhone` fields exist but don't trigger anything
- **Team slug** = simplified team identifier (used in URLs and API routes)
- **User identity**: "Working as" selector (localStorage), no auth system
- **Admin key**: `taskflow-master-2024` (hardcoded, same in Vercel env var)
- **Dev server**: port 5000, use Session Pooler URL for Supabase (IPv4 for Codespaces)
- **DB migrations**: `npx drizzle-kit push` to sync schema to database
- **changedBy**: Frontend sends `changedBy` field in project PATCH requests — backend strips it with destructuring before DB update (`const { changedBy, ...updateData } = req.body`)

---

## Git History (Key Commits)
```
383dca8 feat: invite token share links — hide team slug from share URLs
c7261a8 revert: remove @mention from task/project descriptions — keep chat + comment
811bf79 fix: task desc dropdown direction + exact-match mentions
f446ef4 Replace MentionTextarea with inline @mention
0af79c7 Fix @mention dropdown: remove scroll listener, fix blur/click race
94ee485 Fix @mention dropdown: use Portal to escape ScrollArea overflow
70f62d2 Fix @mention dropdown: position below textarea, higher z-index
0966921 Fix duplicate @mention notifications: only notify for NEW mentions
1d4854e Add @mention autocomplete to all description fields
282e457 Chat @mentions: show badge on chat icon instead of notification bell
69f0465 Chat: delete own messages, @mention notifications, autocomplete
0e659df Add team chat feature with 3s polling
20c3b7c Due date grayed out when recurring; due-soon clock icon
d8be16f Add draggable projects, project sort/filter, recurring task checkbox
6efc048 Fix admin: error handling, fragment keys, delete cascade
2eadae8 Auto-delete empty teams, add Delete Team for owners
```

---

## Flower ↔ TaskFlow Integration Plan

### Overview
Flower = user's voice-enabled AI agent chatbot (separate repo). TaskFlow provides the coordination layer. Flower connects as a team member with `type: agent`.

### Architecture
```
┌─────────────┐         REST API          ┌─────────────┐
│             │ ◄──── read tasks/chat ──── │             │
│  TaskFlow   │ ◄──── update progress ──── │   Flower    │
│  (Vercel)   │ ◄──── post messages ────── │  (separate) │
│             │ ───── @Agent trigger ─────► │             │
└─────────────┘                            └─────────────┘
```

### Flower "TaskFlow Skill" — API Wrapper Methods
- `get_my_tasks()` → fetch tasks assigned to Agent
- `update_task(id, progress, status)` → mark work done
- `post_comment(taskId, message)` → report back in activity log
- `get_project_folders(projectId)` → find shared folder links
- `reply_chat(teamId, message)` → respond in team chat

### Implementation Phases
| Phase | Where | What |
|---|---|---|
| **Phase 1** | Flower | Add `taskflow` skill — API wrapper for reading/updating tasks |
| **Phase 2** | TaskFlow | Add @Agent mention → forward to Flower endpoint |
| **Phase 3** | Flower | Add `respond_to_chat` skill, shared folder file operations |

---

## What To Build Next
### Priority 1: Agent API
- API endpoint agents can call to: discover assigned tasks, update status, log activity
- Token-based auth for agent access
- This enables any AI agent to integrate

### Future: AI Integration Layer
- Connect to folder contents (read source assets, write deliverables)
- Agent discovers tasks → executes → updates status → human reviews
