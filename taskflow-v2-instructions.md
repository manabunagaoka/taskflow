# TaskFlow v2 — Upgrade Instructions

Use this document as your guide in GitHub Codespace with Copilot. Work through each section in order. Each section tells you **what file to change**, **what to add**, and **why**.

> **Your current stack:** Express + Vite + React + Tailwind + shadcn/ui + Drizzle ORM + Supabase (PostgreSQL)
>
> **Current files that matter:**
> - `shared/schema.ts` — your database tables
> - `server/storage.ts` — all database read/write operations
> - `server/routes.ts` — your API endpoints
> - `client/src/App.tsx` — routing and layout
> - `client/src/components/app-sidebar.tsx` — sidebar navigation
> - `client/src/pages/board.tsx` — the Kanban board
> - `client/src/pages/projects.tsx` — project list
> - `client/src/pages/team.tsx` — team member management
> - `client/src/pages/settings.tsx` — export/import
> - `client/src/components/task-card.tsx` — how each task looks on the board
> - `client/src/components/task-dialog.tsx` — the form for creating/editing a task

---

## Overview of what's changing

| What | Now | After |
|------|-----|-------|
| Home screen | Kanban board (all tasks) | Project overview with mini task previews |
| Board | Shows all tasks from all projects | Filtered to one project at a time |
| Activity tracking | None | Auto-log changes + manual comments per task |
| Notifications | None | In-app bell icon with notification list |
| Import/Export | JSON only | Excel (.xlsx) import and export |
| Team members | Just people | People + agents (future-ready) |
| Seed data | 8 members, 5 projects, 12 tasks | Nothing — start clean |

---

## PHASE 0: Team Isolation (Multi-tenancy)

Before any feature work, add team scoping so each team gets its own isolated workspace via a unique URL slug (e.g. `/t/acme-marketing`). No user accounts or login — **link = access**, like a shared Google Doc.

### 0A. Add a `teams` table

#### File: `shared/schema.ts`

Add the `teams` table **before** the other table definitions:

```ts
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-safe identifier, e.g. "acme-marketing"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;
```

### 0B. Add `teamId` to `members`, `projects`, and `tasks`

Add this column to each of the three existing tables:

```ts
teamId: integer("team_id").notNull(),
```

### 0C. Push to database

```bash
npm run db:push
```

### 0D. Backend — Scope all queries by `teamId`

#### File: `server/storage.ts`

Every read/write method must accept a `teamId` parameter and filter by it:

- **Reads:** Add `.where(eq(table.teamId, teamId))` to all SELECT queries
- **Writes:** Include `teamId` in all INSERT payloads
- **Updates/Deletes:** Add `and(eq(table.id, id), eq(table.teamId, teamId))` to ensure a team can only modify its own data

Add CRUD methods for the new `teams` table:

```ts
// Teams
async getTeamBySlug(slug: string): Promise<Team | undefined>
async createTeam(data: InsertTeam): Promise<Team>
```

#### File: `server/routes.ts`

All existing routes under `/api/*` become nested under `/api/t/:teamSlug/*`:

```
GET    /api/t/:teamSlug/members
POST   /api/t/:teamSlug/members
PATCH  /api/t/:teamSlug/members/:id
DELETE /api/t/:teamSlug/members/:id
...same pattern for projects, tasks, activity_logs, notifications, export, import
```

Each route handler starts by looking up the team:
```ts
const team = await storage.getTeamBySlug(req.params.teamSlug);
if (!team) return res.status(404).json({ error: "Team not found" });
```
Then passes `team.id` into every storage call.

Add team creation/lookup routes (no team scope needed):
```
POST   /api/teams          — create a new team (name → auto-generate slug)
GET    /api/teams/:slug    — check if a team exists
```

### 0E. Frontend — Add team context

#### File: `client/src/App.tsx`

Update routing so all pages are under `/t/:teamSlug/`:
```
/                         → Landing/create-team page
/t/:teamSlug              → Projects overview (home)
/t/:teamSlug/board        → Kanban board
/t/:teamSlug/team         → Team members
/t/:teamSlug/settings     → Settings
```

#### New file: `client/src/pages/landing.tsx`

Simple page with:
- "Create a new team" form (team name input → POST /api/teams → redirect to `/t/{slug}`)
- "Join an existing team" input (enter slug → redirect to `/t/{slug}`)

#### File: `client/src/lib/queryClient.ts`

Update `apiRequest` and query functions to include the team slug in all API URLs. Use a React context or URL param to access the current team slug.

### 0F. Update `api/index.ts` (Vercel serverless function)

Mirror all the same route changes in the Vercel serverless function:
- Add `teams` table schema
- Add `teamId` to all table schemas
- Namespace all routes under `/api/t/:teamSlug/*`
- Add team creation/lookup routes

### 0G. Team Limits & Disclaimer

Enforce soft caps per team to prevent abuse without adding billing complexity:

**Backend limits (check count before INSERT, return 403 if exceeded):**
- Members per team: 20
- Projects per team: 50
- Tasks per team: 500

Limits can be raised or removed at your discretion for specific teams.

**Landing page disclaimer (add below the create/join form):**
> "TaskFlow is free to use. Workspaces may be removed after 90 days of inactivity. No guarantees of uptime or data retention. We reserve the right to modify or discontinue the service at any time."

### 0H. Verification

After completing Phase 0:
1. Create a team via the landing page → get redirected to `/t/your-slug`
2. Add members, projects, tasks — they all live under that team
3. Create a second team → verify its workspace is completely empty
4. Confirm the first team's data is untouched
5. Verify limits: try adding a 21st member → should get a friendly error

---

## PHASE 1: Database changes

### File: `shared/schema.ts`

You need to add 2 new tables and modify 1 existing table.

#### 1A. Add a `type` column to the `members` table

This future-proofs for AI agents. Add a `type` field so each member can be either a "person" or an "agent".

```ts
// In the members table definition, add this column:
type: text("type").notNull().default("person"), // "person" or "agent"
```

The full members table should look like:
```ts
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar"),
  color: text("color").notNull(),
  type: text("type").notNull().default("person"), // "person" or "agent"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 1B. Add an `activity_logs` table

This tracks everything that happens on a task — both automatic entries (like "status changed to Done") and manual comments (like "Reviewed the mockups — James").

```ts
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  authorName: text("author_name").notNull(), // who did this (typed by user, no login)
  type: text("type").notNull(), // "comment" or "change"
  content: text("content").notNull(), // the comment text or description of what changed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
```

#### 1C. Add a `notifications` table

This powers the bell icon. Notifications are created when certain things happen (task assigned, task completed, @mention in a comment).

```ts
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientName: text("recipient_name").notNull(), // who should see this
  title: text("title").notNull(), // short summary like "You were assigned a task"
  message: text("message").notNull(), // details
  taskId: integer("task_id"), // link to related task (if any)
  projectId: integer("project_id"), // link to related project (if any)
  read: text("read").notNull().default("false"), // "true" or "false" (text to keep it simple)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
```

#### 1D. After editing schema.ts, push to the database

Run this in your Codespace terminal:
```
npm run db:push
```

This updates your Supabase database with the new tables and columns.

---

## PHASE 2: Backend — Storage and Routes

### File: `server/storage.ts`

Add methods for the new tables. Add these to the `IStorage` interface AND the `DatabaseStorage` class.

#### 2A. Activity Logs — add to IStorage interface:

```ts
// Activity Logs
getActivityLogs(taskId: number): Promise<ActivityLog[]>;
createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
```

#### 2B. Activity Logs — add to DatabaseStorage class:

```ts
async getActivityLogs(taskId: number): Promise<ActivityLog[]> {
  return db.select().from(activityLogs).where(eq(activityLogs.taskId, taskId)).orderBy(asc(activityLogs.createdAt));
}

async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
  const [created] = await db.insert(activityLogs).values(log).returning();
  return created;
}
```

#### 2C. Notifications — add to IStorage interface:

```ts
// Notifications
getNotifications(recipientName: string): Promise<Notification[]>;
getAllNotifications(): Promise<Notification[]>;
createNotification(notification: InsertNotification): Promise<Notification>;
markNotificationRead(id: number): Promise<void>;
markAllNotificationsRead(recipientName: string): Promise<void>;
```

#### 2D. Notifications — add to DatabaseStorage class:

```ts
async getNotifications(recipientName: string): Promise<Notification[]> {
  return db.select().from(notifications)
    .where(eq(notifications.recipientName, recipientName))
    .orderBy(desc(notifications.createdAt));
}

async getAllNotifications(): Promise<Notification[]> {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt));
}

async createNotification(notification: InsertNotification): Promise<Notification> {
  const [created] = await db.insert(notifications).values(notification).returning();
  return created;
}

async markNotificationRead(id: number): Promise<void> {
  await db.update(notifications).set({ read: "true" }).where(eq(notifications.id, id));
}

async markAllNotificationsRead(recipientName: string): Promise<void> {
  await db.update(notifications)
    .set({ read: "true" })
    .where(eq(notifications.recipientName, recipientName));
}
```

Don't forget to import `desc` from `drizzle-orm` at the top, and import the new tables and types from `@shared/schema`.

#### 2E. Auto-log helper

Add a helper function in `storage.ts` (outside the class) that creates an activity log AND optionally a notification. This is used by the routes whenever a task changes.

```ts
export async function logTaskChange(
  storage: IStorage,
  taskId: number,
  authorName: string,
  changeDescription: string
) {
  await storage.createActivityLog({
    taskId,
    authorName,
    type: "change",
    content: changeDescription,
  });
}
```

#### 2F. Remove the seed() method

Delete the entire `seed()` method from `DatabaseStorage`, and remove `seed(): Promise<void>` from the `IStorage` interface. You want to start clean.

### File: `server/routes.ts`

#### 2G. Remove the seed call

Delete these lines from the top of `registerRoutes`:
```ts
try {
  await storage.seed();
} catch (e) {
  console.error("Seed error (may need to run db:push first):", e);
}
```

#### 2H. Add activity log routes

```ts
// ─── Activity Logs ───
app.get("/api/tasks/:id/activity", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const logs = await storage.getActivityLogs(id);
  res.json(logs);
});

app.post("/api/tasks/:id/activity", async (req, res) => {
  const taskId = parseInt(req.params.id);
  if (isNaN(taskId)) return res.status(400).json({ error: "Invalid ID" });
  const { authorName, content } = req.body;
  if (!authorName || !content) return res.status(400).json({ error: "authorName and content required" });

  const log = await storage.createActivityLog({
    taskId,
    authorName,
    type: "comment",
    content,
  });

  // Check for @mentions in the comment and create notifications
  const mentions = content.match(/@(\w+(?:\s\w+)?)/g); // matches @FirstName or @FirstName LastName
  if (mentions) {
    const members = await storage.getMembers();
    for (const mention of mentions) {
      const mentionedName = mention.replace("@", "").trim();
      const member = members.find(m =>
        m.name.toLowerCase().startsWith(mentionedName.toLowerCase())
      );
      if (member) {
        const task = await storage.getTask(taskId);
        await storage.createNotification({
          recipientName: member.name,
          title: "You were mentioned in a comment",
          message: `${authorName} mentioned you on "${task?.title}": "${content}"`,
          taskId,
          projectId: task?.projectId || null,
          read: "false",
        });
      }
    }
  }

  res.status(201).json(log);
});
```

#### 2I. Add notification routes

```ts
// ─── Notifications ───
app.get("/api/notifications", async (_req, res) => {
  const all = await storage.getAllNotifications();
  res.json(all);
});

app.get("/api/notifications/:name", async (req, res) => {
  const notifications = await storage.getNotifications(req.params.name);
  res.json(notifications);
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  await storage.markNotificationRead(id);
  res.json({ success: true });
});

app.post("/api/notifications/mark-all-read", async (req, res) => {
  const { recipientName } = req.body;
  if (!recipientName) return res.status(400).json({ error: "recipientName required" });
  await storage.markAllNotificationsRead(recipientName);
  res.json({ success: true });
});
```

#### 2J. Update the task PATCH route to auto-log changes and send notifications

Replace your existing `app.patch("/api/tasks/:id"` route with a version that logs what changed and notifies people. Here's the idea:

```ts
app.patch("/api/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  // Get the task before updating so we can compare
  const oldTask = await storage.getTask(id);
  if (!oldTask) return res.status(404).json({ error: "Task not found" });

  const updated = await storage.updateTask(id, req.body);
  if (!updated) return res.status(404).json({ error: "Task not found" });

  // Auto-log changes
  const authorName = req.body.changedBy || "Someone"; // frontend should send this

  if (req.body.status && req.body.status !== oldTask.status) {
    await logTaskChange(storage, id, authorName, `Status changed from "${oldTask.status}" to "${req.body.status}"`);

    // Notify assignee when task moves to "done"
    if (req.body.status === "done" && oldTask.assigneeId) {
      const members = await storage.getMembers();
      const assignee = members.find(m => m.id === oldTask.assigneeId);
      if (assignee) {
        await storage.createNotification({
          recipientName: assignee.name,
          title: "Task completed",
          message: `"${oldTask.title}" has been marked as done`,
          taskId: id,
          projectId: oldTask.projectId,
          read: "false",
        });
      }
    }
  }

  if (req.body.assigneeId && req.body.assigneeId !== oldTask.assigneeId) {
    const members = await storage.getMembers();
    const newAssignee = members.find(m => m.id === req.body.assigneeId);
    if (newAssignee) {
      await logTaskChange(storage, id, authorName, `Assigned to ${newAssignee.name}`);

      // Notify the new assignee
      await storage.createNotification({
        recipientName: newAssignee.name,
        title: "You were assigned a task",
        message: `You've been assigned to "${oldTask.title}"`,
        taskId: id,
        projectId: oldTask.projectId,
        read: "false",
      });
    }
  }

  if (req.body.priority && req.body.priority !== oldTask.priority) {
    await logTaskChange(storage, id, authorName, `Priority changed from "${oldTask.priority}" to "${req.body.priority}"`);
  }

  if (req.body.progress !== undefined && req.body.progress !== oldTask.progress) {
    await logTaskChange(storage, id, authorName, `Progress updated to ${req.body.progress}%`);
  }

  res.json(updated);
});
```

Import `logTaskChange` at the top of `routes.ts`:
```ts
import { storage, logTaskChange } from "./storage";
```

#### 2K. Add Excel import/export routes

First, install the Excel library in your Codespace terminal:
```
npm install xlsx
```

Then add these routes:

```ts
import XLSX from "xlsx";

// ─── Excel Export ───
app.get("/api/export/excel", async (_req, res) => {
  const [allMembers, allProjects, allTasks] = await Promise.all([
    storage.getMembers(),
    storage.getProjects(),
    storage.getTasks(),
  ]);

  // Build task rows with human-readable names instead of IDs
  const taskRows = allTasks.map(t => ({
    "Task": t.title,
    "Description": t.description || "",
    "Project": allProjects.find(p => p.id === t.projectId)?.name || "",
    "Assignee": allMembers.find(m => m.id === t.assigneeId)?.name || "",
    "Status": t.status,
    "Priority": t.priority,
    "Progress (%)": t.progress,
    "Due Date": t.dueDate || "",
  }));

  const memberRows = allMembers.map(m => ({
    "Name": m.name,
    "Role": m.role,
    "Type": m.type,
  }));

  const projectRows = allProjects.map(p => ({
    "Project Name": p.name,
    "Color": p.color,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), "Tasks");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberRows), "Team");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), "Projects");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=taskflow-export.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── Excel Import ───
app.post("/api/import/excel", async (req, res) => {
  // Expects the request body to be a base64-encoded Excel file
  // The frontend will read the file and send it as { data: "base64string" }
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "No data provided" });

    const buf = Buffer.from(data, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });

    // Read sheets
    const taskSheet = wb.Sheets["Tasks"];
    const teamSheet = wb.Sheets["Team"];
    const projectSheet = wb.Sheets["Projects"];

    // Import team members first (if sheet exists)
    if (teamSheet) {
      const teamRows = XLSX.utils.sheet_to_json<any>(teamSheet);
      const existingMembers = await storage.getMembers();
      for (const row of teamRows) {
        if (!row["Name"]) continue;
        // Skip if member already exists
        const exists = existingMembers.find(m => m.name.toLowerCase() === row["Name"].toLowerCase());
        if (!exists) {
          const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219"];
          await storage.createMember({
            name: row["Name"],
            role: row["Role"] || "Team Member",
            color: colors[Math.floor(Math.random() * colors.length)],
            type: row["Type"] || "person",
          });
        }
      }
    }

    // Import projects (if sheet exists)
    if (projectSheet) {
      const projectRows = XLSX.utils.sheet_to_json<any>(projectSheet);
      const existingProjects = await storage.getProjects();
      for (const row of projectRows) {
        if (!row["Project Name"]) continue;
        const exists = existingProjects.find(p => p.name.toLowerCase() === row["Project Name"].toLowerCase());
        if (!exists) {
          await storage.createProject({
            name: row["Project Name"],
            color: row["Color"] || "#4F98A3",
          });
        }
      }
    }

    // Import tasks
    if (taskSheet) {
      const taskRows = XLSX.utils.sheet_to_json<any>(taskSheet);
      // Refresh members and projects so we can match by name
      const allMembers = await storage.getMembers();
      const allProjects = await storage.getProjects();

      for (const row of taskRows) {
        if (!row["Task"]) continue;

        // Find the matching member and project by name
        const assignee = row["Assignee"]
          ? allMembers.find(m => m.name.toLowerCase() === row["Assignee"].toLowerCase())
          : null;
        const project = row["Project"]
          ? allProjects.find(p => p.name.toLowerCase() === row["Project"].toLowerCase())
          : null;

        // Auto-create project if it doesn't exist
        let projectId = project?.id || null;
        if (row["Project"] && !project) {
          const newProj = await storage.createProject({
            name: row["Project"],
            color: "#4F98A3",
          });
          projectId = newProj.id;
        }

        // Auto-create member if they don't exist
        let assigneeId = assignee?.id || null;
        if (row["Assignee"] && !assignee) {
          const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB"];
          const newMember = await storage.createMember({
            name: row["Assignee"],
            role: "Team Member",
            color: colors[Math.floor(Math.random() * colors.length)],
            type: "person",
          });
          assigneeId = newMember.id;
        }

        await storage.createTask({
          title: row["Task"],
          description: row["Description"] || null,
          status: row["Status"] || "todo",
          priority: row["Priority"] || "medium",
          progress: row["Progress (%)"] || 0,
          assigneeId,
          projectId,
          dueDate: row["Due Date"] || null,
          order: 0,
        });
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
```

---

## PHASE 3: Frontend — New Home Screen

### File: `client/src/pages/projects.tsx` (rewrite)

This becomes your **home screen**. Replace the current content with a new layout:

**Design:**
- A grid of project cards
- Each card shows: project name, colored dot, task count, done count, progress bar
- Below the summary: a **mini task list** showing the top 3-5 tasks (title, assignee avatar, priority dot, due date)
- Clicking a project card navigates to the board filtered to that project (`/#/board/:projectId`)
- Keep the "+ New Project" button
- Keep the edit/delete per project

**Key details:**
- Use `useQuery` to fetch `/api/tasks` and `/api/members` alongside `/api/projects`
- Filter tasks by `projectId` to build each card's preview
- Sort preview tasks by: overdue first, then by due date
- Show a small status dot (colored) next to each task in the preview
- Clicking anywhere on the card (except edit/delete buttons) should navigate: `const [, navigate] = useLocation(); navigate(\`/board/${project.id}\`);`
- Also show an "Unassigned Tasks" card at the bottom for tasks with no `projectId`

### File: `client/src/App.tsx`

Update routes:
```tsx
<Route path="/" component={Projects} />           {/* Home = project overview */}
<Route path="/board" component={Board} />          {/* All tasks board */}
<Route path="/board/:projectId" component={Board} />{/* Project-specific board */}
<Route path="/team" component={Team} />
<Route path="/settings" component={Settings} />
<Route component={NotFound} />
```

Remove the separate `/projects` route — the home page IS the project overview now.

### File: `client/src/components/app-sidebar.tsx`

Update the nav items:
```ts
const navItems = [
  { title: "Projects", href: "/", icon: FolderKanban },       // Home is now projects
  { title: "Board", href: "/board", icon: LayoutDashboard },   // Full board (all projects)
  { title: "Team", href: "/team", icon: Users },
  { title: "Settings", href: "/settings", icon: Settings },
];
```

---

## PHASE 4: Frontend — Board with Project Filter

### File: `client/src/pages/board.tsx`

Update the Board component to accept a project filter from the URL:

```tsx
import { useParams } from "wouter";

export default function Board() {
  const params = useParams<{ projectId?: string }>();
  const activeProjectId = params.projectId ? parseInt(params.projectId) : null;

  // ... existing code ...

  // When filtering tasks, add the project filter:
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // If viewing a specific project, only show its tasks
      if (activeProjectId && t.projectId !== activeProjectId) return false;
      if (filterMember !== "all" && String(t.assigneeId) !== filterMember) return false;
      if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, activeProjectId, filterMember, filterProject, filterPriority]);

  // Show the project name in the header when filtered
  const activeProject = activeProjectId
    ? projects.find(p => p.id === activeProjectId)
    : null;

  // In the JSX header area, show:
  // {activeProject ? activeProject.name : "All Projects"} as a title
  // Add a "← Back to Projects" link if viewing a specific project
```

Also: when `activeProjectId` is set, hide the project filter dropdown (since you're already filtered).

---

## PHASE 5: Frontend — Activity Log on Tasks

### File: `client/src/components/task-dialog.tsx`

Add an activity/comments section to the task dialog. When editing an existing task:

**Below the existing form fields, add:**

1. A "Your name" input field (remembers the last name typed — store in React state at the App level or use a simple context). This is used for both comments and tracking who made changes.

2. An "Activity" section that shows:
   - A text input + "Add Comment" button for manual notes
   - A scrollable list of activity entries (both auto-logged changes and manual comments)
   - Each entry shows: icon (💬 for comments, 🔄 for changes), the text, the author name, and a relative timestamp ("2 hours ago")
   - Use `useQuery` to fetch from `/api/tasks/${task.id}/activity`
   - Use `useMutation` to POST to `/api/tasks/${task.id}/activity`

3. Support `@mentions` in comments — when someone types `@`, show a dropdown of team member names (from the `members` query). When they select a name, it gets inserted as `@Name` in the comment text.

**Important:** When the task form is submitted (status, priority, assignee changes), send `changedBy: currentUserName` in the PATCH request body so the backend can auto-log who made the change. The `currentUserName` comes from that "Your name" field.

**Layout suggestion:**
```
┌─────────────────────────────────┐
│ Edit Task                       │
│─────────────────────────────────│
│ Title: [________________]       │
│ Description: [__________]       │
│ Status: [▼] Priority: [▼]      │
│ Assignee: [▼] Project: [▼]     │
│ Due Date: [____] Progress: ═══  │
│─────────────────────────────────│
│ Activity                        │
│ ┌─────────────────────────────┐ │
│ │ 🔄 Status → In Progress     │ │
│ │    by Sarah · 2 hours ago   │ │
│ │ 💬 Reviewed mockups, looks  │ │
│ │    good — James · 1 hr ago  │ │
│ │ 🔄 Progress → 60%           │ │
│ │    by Sarah · 30 min ago    │ │
│ └─────────────────────────────┘ │
│ Your name: [Sarah Chen    ]     │
│ Comment: [____________] [Send]  │
│─────────────────────────────────│
│ [Delete]          [Cancel][Save]│
└─────────────────────────────────┘
```

---

## PHASE 6: Frontend — Notifications (Bell Icon)

### New file: `client/src/components/notification-bell.tsx`

Create a bell icon component that goes in the top header bar (in `App.tsx`, next to the theme toggle).

**What it does:**
- Shows a `Bell` icon from `lucide-react`
- Has a red badge/dot when there are unread notifications
- Clicking it opens a popover/dropdown showing recent notifications
- Each notification shows: title, message, timestamp, and a link to the related task
- "Mark all as read" button at the top
- Clicking a notification marks it as read and opens the related task

**How it works:**
- Since there's no login, you need a way to know "who am I." Add a small "My Name" selector in the header (a dropdown of team members). This sets who you are for the session.
- Store the selected name in React context so it's available everywhere
- Fetch notifications: `GET /api/notifications/${myName}`
- Poll every 30 seconds for new notifications (or use `refetchInterval: 30000` in useQuery)
- Mark read: `PATCH /api/notifications/${id}/read`

### New file: `client/src/context/user-context.tsx`

Create a simple context for "who am I":

```tsx
import { createContext, useContext, useState } from "react";

interface UserContextType {
  currentUser: string;
  setCurrentUser: (name: string) => void;
}

const UserContext = createContext<UserContextType>({
  currentUser: "",
  setCurrentUser: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState("");
  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(UserContext);
}
```

Wrap your app with `<UserProvider>` in `App.tsx`.

### File: `client/src/App.tsx`

In the header bar, add:
1. A team member selector (small Select dropdown) — "Working as: [Sarah Chen ▼]"
2. The notification bell component
3. These go next to the existing theme toggle

```tsx
<header className="flex items-center justify-between px-4 py-2 border-b shrink-0">
  <SidebarTrigger />
  <div className="flex items-center gap-3">
    <UserSelector />        {/* "Working as" dropdown */}
    <NotificationBell />    {/* Bell icon */}
    <ThemeToggle />
  </div>
</header>
```

---

## PHASE 7: Frontend — Excel Import/Export

### File: `client/src/pages/settings.tsx` (update)

Replace the current JSON import/export with Excel:

**Export button:**
```tsx
const handleExcelExport = () => {
  // This triggers a file download
  window.open("/api/export/excel", "_blank");
};
```

Note: If your app is deployed, the URL path might need the API proxy prefix. Check how `apiRequest` in `queryClient.ts` handles URLs and follow the same pattern.

**Import section:**
```tsx
const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Read file as base64
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = (reader.result as string).split(",")[1]; // remove "data:...;base64," prefix
    try {
      await apiRequest("POST", "/api/import/excel", { data: base64 });
      // Refresh all data
      queryClient.invalidateQueries();
      toast({ title: "Import successful" });
    } catch (err) {
      toast({ title: "Import failed", variant: "destructive" });
    }
  };
  reader.readAsDataURL(file);
};
```

**Template download:**
Add a "Download template" button that exports an empty Excel file with the right column headers. You can either:
- Create a static template file and serve it, OR
- Have the export endpoint return an empty file when called with `?template=true`

**Keep the JSON export/import too** as a secondary option (some people might want the raw data backup).

---

## PHASE 8: Future-proof for Agents

This is mostly done already through the `type` field on members. A few small things to do now:

### File: `client/src/pages/team.tsx`

- Add a "Type" selector to the add/edit member form: Person or Agent
- Show a small robot icon (🤖) or badge next to agent members in the list
- You can use the `Bot` icon from `lucide-react`

### File: `client/src/components/task-card.tsx`

- If the assignee's type is "agent", show a small robot icon next to their avatar on the task card

### File: `client/src/components/task-dialog.tsx`

- In the assignee dropdown, group members: "People" section and "Agents" section

This doesn't add any AI functionality yet — it just makes the UI ready for when you do. When you're ready to add actual agent behavior, you'd:
1. Create a separate service/webhook that watches for tasks assigned to agents
2. The agent picks up the task, does its work, updates progress, and adds activity log entries
3. When done, it marks the task as complete and triggers a notification

---

## PHASE 9: Clean up

### Remove seed data

If you haven't already:
1. Delete the `seed()` method from `server/storage.ts`
2. Delete the seed call from `server/routes.ts`
3. In Supabase, if you want to clear existing sample data, go to the Table Editor and delete rows from tasks, members, and projects tables (in that order — tasks first since they reference the others)

### Test everything

After all changes, in your Codespace terminal:
```
npm run db:push
npm run dev
```

Walk through:
1. ✅ Home screen shows empty "No projects" state
2. ✅ Create a project → it appears as a card
3. ✅ Click the project → goes to its board
4. ✅ Create a task on the board → it appears in "To Do"
5. ✅ Drag the task to "In Progress" → activity log shows the change
6. ✅ Open the task → add a comment → it appears in the activity log
7. ✅ Type @SomeName in a comment → notification created
8. ✅ Select yourself in the "Working as" dropdown → bell shows notifications
9. ✅ Export to Excel → opens file with your data
10. ✅ Create an Excel file with tasks → import it → tasks appear
11. ✅ Add a team member as "Agent" type → shows robot icon

### Push and deploy

```
git add .
git commit -m "TaskFlow v2: project-first view, activity logs, notifications, Excel import/export"
git push
```

Vercel picks it up and deploys automatically.

---

## Quick Reference: New API Endpoints

| Method | Path | What it does |
|--------|------|-------------|
| GET | `/api/tasks/:id/activity` | Get activity log for a task |
| POST | `/api/tasks/:id/activity` | Add a comment to a task |
| GET | `/api/notifications` | Get all notifications |
| GET | `/api/notifications/:name` | Get notifications for a specific person |
| PATCH | `/api/notifications/:id/read` | Mark a notification as read |
| POST | `/api/notifications/mark-all-read` | Mark all notifications read for a person |
| GET | `/api/export/excel` | Download Excel export |
| POST | `/api/import/excel` | Upload and import an Excel file |

---

## Excel Import Format

When someone prepares an Excel file to import, it should have a sheet called **"Tasks"** with these columns:

| Task | Description | Project | Assignee | Status | Priority | Progress (%) | Due Date |
|------|-------------|---------|----------|--------|----------|-------------|----------|
| Design homepage | Create mockups | Website Redesign | Sarah Chen | todo | high | 0 | 2026-04-01 |
| Write tests | Unit test coverage | API v3 | James Wilson | in_progress | medium | 30 | 2026-03-25 |

- **Status** values: `todo`, `in_progress`, `review`, `done`
- **Priority** values: `low`, `medium`, `high`
- **Progress** is a number from 0 to 100
- **Due Date** format: YYYY-MM-DD
- If a Project or Assignee name doesn't exist yet, the app creates them automatically

Optional sheets: **"Team"** (columns: Name, Role, Type) and **"Projects"** (columns: Project Name, Color).
