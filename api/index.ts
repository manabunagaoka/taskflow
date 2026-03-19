import express from "express";
import type { Request, Response, NextFunction } from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { eq, asc, desc, and, sql } from "drizzle-orm";
import XLSX from "xlsx";

export const config = {
  api: { bodyParser: false },
};

// ─── Schema (inlined) ───
const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  passkey: text("passkey"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const members = pgTable("members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar"),
  color: text("color").notNull(),
  type: text("type").notNull().default("person"),
  email: text("email"),
  phone: text("phone"),
  notifyEmail: text("notify_email").notNull().default("off"),
  notifyPhone: text("notify_phone").notNull().default("off"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  ownerId: integer("owner_id"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  progress: integer("progress").notNull().default(0),
  assigneeId: integer("assignee_id"),
  assigneeIds: text("assignee_ids"),
  projectId: integer("project_id"),
  dueDate: text("due_date"),
  recurring: text("recurring").notNull().default("none"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  taskId: integer("task_id").notNull(),
  authorName: text("author_name").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  taskId: integer("task_id"),
  projectId: integer("project_id"),
  read: text("read").notNull().default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const projectFolders = pgTable("project_folders", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull().default("link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true });
const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
const insertProjectFolderSchema = createInsertSchema(projectFolders).omit({ id: true, createdAt: true });

const schema = { teams, members, projects, tasks, activityLogs, notifications, projectFolders };

// ─── Database ───
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

// ─── Team limits ───
const LIMITS = { members: 20, projects: 50, tasks: 500 };

// ─── Middleware: resolve team ───
async function resolveTeam(req: Request, res: Response, next: NextFunction) {
  const [team] = await db.select().from(teams).where(eq(teams.slug, req.params.teamSlug));
  if (!team) return res.status(404).json({ error: "Team not found" });
  (req as any).team = team;
  next();
}

// ─── Express App ───
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasDb: !!process.env.DATABASE_URL });
});

// ─── Teams (no scope needed) ───
app.post("/api/teams", async (req, res) => {
  const parsed = insertTeamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const slug = parsed.data.slug || parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [existing] = await db.select().from(teams).where(eq(teams.slug, slug));
  if (existing) return res.status(409).json({ error: "Team slug already taken" });
  const [team] = await db.insert(teams).values({ ...parsed.data, slug, passkey: req.body.passkey || null }).returning();
  // Auto-create Misc project
  await db.insert(projects).values({ teamId: team.id, name: "Misc", color: "#6B7280" });
  if (req.body.founderName) {
    const [member] = await db.insert(members).values({
      teamId: team.id,
      name: req.body.founderName,
      role: "Team Lead",
      color: "#4F98A3",
      email: req.body.founderEmail || null,
      phone: req.body.founderPhone || null,
      notifyEmail: req.body.founderEmail ? "on" : "off",
      notifyPhone: req.body.founderPhone ? "on" : "off",
    }).returning();
    await db.update(teams).set({ createdBy: member.id }).where(eq(teams.id, team.id));
    return res.status(201).json({ ...team, createdBy: member.id });
  }
  res.status(201).json(team);
});

app.get("/api/teams/:slug", async (req, res) => {
  const [team] = await db.select().from(teams).where(eq(teams.slug, req.params.slug));
  if (!team) return res.status(404).json({ error: "Team not found" });
  const { passkey, ...teamData } = team as any;
  res.json({ ...teamData, hasPasskey: !!passkey });
});

app.post("/api/teams/:slug/join", async (req, res) => {
  const [team] = await db.select().from(teams).where(eq(teams.slug, req.params.slug));
  if (!team) return res.status(404).json({ error: "Team not found" });
  if ((team as any).passkey && (team as any).passkey !== req.body.passkey) {
    return res.status(403).json({ error: "Incorrect passkey" });
  }
  const { passkey, ...teamData } = team as any;
  res.json(teamData);
});

// Delete team (creator only)
app.delete("/api/t/:teamSlug", resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const memberId = parseInt(req.headers["x-member-id"] as string);
  if (isNaN(memberId) || team.createdBy !== memberId) {
    return res.status(403).json({ error: "Only the team creator can delete this team" });
  }
  await db.delete(activityLogs).where(eq(activityLogs.teamId, team.id));
  await db.delete(notifications).where(eq(notifications.teamId, team.id));
  await db.delete(messages).where(eq(messages.teamId, team.id));
  await db.delete(tasks).where(eq(tasks.teamId, team.id));
  await db.delete(members).where(eq(members.teamId, team.id));
  await db.delete(projects).where(eq(projects.teamId, team.id));
  await db.delete(teams).where(eq(teams.id, team.id));
  res.status(204).send();
});

// ─── Admin (secret key protected) ───
app.get("/api/admin/:key/teams", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const allTeams = await db.select().from(teams).orderBy(asc(teams.createdAt));
  const enriched = await Promise.all(allTeams.map(async (team) => {
    const [mc] = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(eq(members.teamId, team.id));
    const [pc] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.teamId, team.id));
    const [tc] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.teamId, team.id));
    return { ...team, memberCount: mc.count, projectCount: pc.count, taskCount: tc.count };
  }));
  res.json(enriched);
});

app.delete("/api/admin/:key/teams/:id", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  await db.delete(activityLogs).where(eq(activityLogs.teamId, id));
  await db.delete(notifications).where(eq(notifications.teamId, id));
  await db.delete(projectFolders).where(eq(projectFolders.teamId, id));
  await db.delete(messages).where(eq(messages.teamId, id));
  await db.delete(tasks).where(eq(tasks.teamId, id));
  await db.delete(members).where(eq(members.teamId, id));
  await db.delete(projects).where(eq(projects.teamId, id));
  const [deleted] = await db.delete(teams).where(eq(teams.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Team not found" });
  res.status(204).send();
});

// Admin: get team members
app.get("/api/admin/:key/teams/:id/members", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const result = await db.select().from(members).where(eq(members.teamId, id)).orderBy(asc(members.createdAt));
  res.json(result);
});

// Admin: delete member
app.delete("/api/admin/:key/teams/:teamId/members/:memberId", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const teamId = parseInt(req.params.teamId);
  const memberId = parseInt(req.params.memberId);
  if (isNaN(teamId) || isNaN(memberId)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(members).where(and(eq(members.id, memberId), eq(members.teamId, teamId))).returning();
  if (!deleted) return res.status(404).json({ error: "Member not found" });
  res.status(204).send();
});

// Admin: add member
app.post("/api/admin/:key/teams/:id/members", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const teamId = parseInt(req.params.id);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid ID" });
  const parsed = insertMemberSchema.safeParse({ ...req.body, teamId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [member] = await db.insert(members).values(parsed.data).returning();
  res.status(201).json(member);
});

// Admin: edit member
app.patch("/api/admin/:key/teams/:teamId/members/:memberId", async (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
  const teamId = parseInt(req.params.teamId);
  const memberId = parseInt(req.params.memberId);
  if (isNaN(teamId) || isNaN(memberId)) return res.status(400).json({ error: "Invalid ID" });
  const { name, role, email, phone, color, type } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (email !== undefined) updates.email = email || null;
  if (phone !== undefined) updates.phone = phone || null;
  if (color !== undefined) updates.color = color;
  if (type !== undefined) updates.type = type;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  const [updated] = await db.update(members).set(updates).where(and(eq(members.id, memberId), eq(members.teamId, teamId))).returning();
  if (!updated) return res.status(404).json({ error: "Member not found" });
  res.json(updated);
});

// ─── Team-scoped routes ───
const t = "/api/t/:teamSlug";

// Members
app.get(`${t}/members`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const result = await db.select().from(members).where(eq(members.teamId, team.id)).orderBy(asc(members.createdAt));
  res.json(result);
});

app.post(`${t}/members`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(eq(members.teamId, team.id));
  if (count >= LIMITS.members) return res.status(403).json({ error: `Team member limit reached (${LIMITS.members})` });
  const parsed = insertMemberSchema.safeParse({ ...req.body, teamId: team.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [member] = await db.insert(members).values(parsed.data).returning();
  res.status(201).json(member);
});

app.patch(`${t}/members/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(members).set(req.body).where(and(eq(members.id, id), eq(members.teamId, team.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete(`${t}/members/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(members).where(and(eq(members.id, id), eq(members.teamId, team.id))).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  // Auto-delete team when last member leaves
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(eq(members.teamId, team.id));
  if (count === 0) {
    await db.delete(activityLogs).where(eq(activityLogs.teamId, team.id));
    await db.delete(notifications).where(eq(notifications.teamId, team.id));
    await db.delete(projectFolders).where(eq(projectFolders.teamId, team.id));
    await db.delete(messages).where(eq(messages.teamId, team.id));
    await db.delete(tasks).where(eq(tasks.teamId, team.id));
    await db.delete(projects).where(eq(projects.teamId, team.id));
    await db.delete(teams).where(eq(teams.id, team.id));
    return res.json({ teamDeleted: true });
  }
  res.status(204).send();
});

// Projects
app.get(`${t}/projects`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const result = await db.select().from(projects).where(eq(projects.teamId, team.id)).orderBy(asc(projects.createdAt));
  res.json(result);
});

app.post(`${t}/projects`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.teamId, team.id));
  if (count >= LIMITS.projects) return res.status(403).json({ error: `Project limit reached (${LIMITS.projects})` });
  const parsed = insertProjectSchema.safeParse({ ...req.body, teamId: team.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [project] = await db.insert(projects).values(parsed.data).returning();
  res.status(201).json(project);
});

app.patch(`${t}/projects/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { changedBy, ...updateData } = req.body;
  const [oldProject] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.teamId, team.id)));
  const [updated] = await db.update(projects).set(updateData).where(and(eq(projects.id, id), eq(projects.teamId, team.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });

  // Check for NEW @mentions in project description
  if (req.body.description) {
    const newMentions = req.body.description.match(/@(\w+(?:\s\w+)?)/g) || [];
    const oldMentions = (oldProject?.description || "").match(/@(\w+(?:\s\w+)?)/g) || [];
    const addedMentions = newMentions.filter((m: string) => !oldMentions.includes(m));
    if (addedMentions.length > 0) {
      const allMembers = await db.select().from(members).where(eq(members.teamId, team.id));
      const authorName = changedBy || "Someone";
      for (const mention of addedMentions) {
        const mentionedName = mention.replace("@", "").trim();
        const member = allMembers.find((m: any) =>
          m.name.toLowerCase().startsWith(mentionedName.toLowerCase())
        );
        if (member && member.name !== authorName) {
          await db.insert(notifications).values({
            teamId: team.id,
            recipientName: member.name,
            title: "You were mentioned in a project",
            message: `${authorName} mentioned you in project "${updated.name}"`,
            taskId: null,
            projectId: id,
            read: "false",
          });
        }
      }
    }
  }

  res.json(updated);
});

app.delete(`${t}/projects/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.teamId, team.id))).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// Tasks
app.get(`${t}/tasks`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const result = await db.select().from(tasks).where(eq(tasks.teamId, team.id)).orderBy(asc(tasks.order));
  res.json(result);
});

app.post(`${t}/tasks`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.teamId, team.id));
  if (count >= LIMITS.tasks) return res.status(403).json({ error: `Task limit reached (${LIMITS.tasks})` });
  const parsed = insertTaskSchema.safeParse({ ...req.body, teamId: team.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [task] = await db.insert(tasks).values(parsed.data).returning();
  res.status(201).json(task);
});

app.patch(`${t}/tasks/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [oldTask] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.teamId, team.id)));
  if (!oldTask) return res.status(404).json({ error: "Not found" });

  const [updated] = await db.update(tasks).set(req.body).where(and(eq(tasks.id, id), eq(tasks.teamId, team.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });

  const authorName = req.body.changedBy || "Someone";

  if (req.body.status && req.body.status !== oldTask.status) {
    await db.insert(activityLogs).values({ teamId: team.id, taskId: id, authorName, type: "change", content: `Status changed from "${oldTask.status}" to "${req.body.status}"` });
    if (req.body.status === "done" && oldTask.assigneeId) {
      const [assignee] = await db.select().from(members).where(and(eq(members.id, oldTask.assigneeId), eq(members.teamId, team.id)));
      if (assignee) {
        await db.insert(notifications).values({ teamId: team.id, recipientName: assignee.name, title: "Task completed", message: `"${oldTask.title}" has been marked as done`, taskId: id, projectId: oldTask.projectId, read: "false" });
      }
    }
  }

  if (req.body.assigneeId && req.body.assigneeId !== oldTask.assigneeId) {
    const [newAssignee] = await db.select().from(members).where(and(eq(members.id, req.body.assigneeId), eq(members.teamId, team.id)));
    if (newAssignee) {
      await db.insert(activityLogs).values({ teamId: team.id, taskId: id, authorName, type: "change", content: `Assigned to ${newAssignee.name}` });
      await db.insert(notifications).values({ teamId: team.id, recipientName: newAssignee.name, title: "You were assigned a task", message: `You've been assigned to "${oldTask.title}"`, taskId: id, projectId: oldTask.projectId, read: "false" });
    }
  }

  if (req.body.priority && req.body.priority !== oldTask.priority) {
    await db.insert(activityLogs).values({ teamId: team.id, taskId: id, authorName, type: "change", content: `Priority changed from "${oldTask.priority}" to "${req.body.priority}"` });
  }

  if (req.body.progress !== undefined && req.body.progress !== oldTask.progress) {
    await db.insert(activityLogs).values({ teamId: team.id, taskId: id, authorName, type: "change", content: `Progress updated to ${req.body.progress}%` });
  }

  // Check for NEW @mentions in description (skip ones already in old description)
  if (req.body.description && req.body.description !== oldTask.description) {
    const newMentions = req.body.description.match(/@(\w+(?:\s\w+)?)/g) || [];
    const oldMentions = (oldTask.description || "").match(/@(\w+(?:\s\w+)?)/g) || [];
    const addedMentions = newMentions.filter((m: string) => !oldMentions.includes(m));
    if (addedMentions.length > 0) {
      const allMembers = await db.select().from(members).where(eq(members.teamId, team.id));
      for (const mention of addedMentions) {
        const mentionedName = mention.replace("@", "").trim();
        const member = allMembers.find((m: any) =>
          m.name.toLowerCase().startsWith(mentionedName.toLowerCase())
        );
        if (member && member.name !== authorName) {
          await db.insert(notifications).values({
            teamId: team.id,
            recipientName: member.name,
            title: "You were mentioned in a task",
            message: `${authorName} mentioned you in "${updated.title}"`,
            taskId: id,
            projectId: updated.projectId,
            read: "false",
          });
        }
      }
    }
  }

  res.json(updated);
});

app.delete(`${t}/tasks/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.teamId, team.id))).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// Export / Import
app.get(`${t}/export`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const [allMembers, allProjects, allTasks] = await Promise.all([
    db.select().from(members).where(eq(members.teamId, team.id)),
    db.select().from(projects).where(eq(projects.teamId, team.id)),
    db.select().from(tasks).where(eq(tasks.teamId, team.id)),
  ]);
  res.json({ members: allMembers, projects: allProjects, tasks: allTasks });
});

app.post(`${t}/import`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  try {
    const { members: mData, projects: pData, tasks: tData } = req.body;
    // Clear existing team data
    await db.delete(tasks).where(eq(tasks.teamId, team.id));
    await db.delete(members).where(eq(members.teamId, team.id));
    await db.delete(projects).where(eq(projects.teamId, team.id));
    if (mData) for (const m of mData) await db.insert(members).values({ teamId: team.id, name: m.name, role: m.role, color: m.color, avatar: m.avatar || null });
    if (pData) for (const p of pData) await db.insert(projects).values({ teamId: team.id, name: p.name, color: p.color });
    if (tData) for (const t of tData) await db.insert(tasks).values({ teamId: team.id, title: t.title, description: t.description || null, status: t.status || "todo", priority: t.priority || "medium", progress: t.progress || 0, assigneeId: null, projectId: null, dueDate: t.dueDate || null, order: t.order || 0 });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Activity Logs ───
app.get(`${t}/tasks/:id/activity`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const logs = await db.select().from(activityLogs).where(and(eq(activityLogs.teamId, team.id), eq(activityLogs.taskId, id))).orderBy(desc(activityLogs.createdAt));
  res.json(logs);
});

app.post(`${t}/tasks/:id/activity`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const taskId = parseInt(req.params.id);
  if (isNaN(taskId)) return res.status(400).json({ error: "Invalid ID" });
  const { authorName, content } = req.body;
  if (!authorName || !content) return res.status(400).json({ error: "authorName and content required" });

  const [log] = await db.insert(activityLogs).values({ teamId: team.id, taskId, authorName, type: "comment", content }).returning();

  // Check for @mentions and create notifications
  const mentions = content.match(/@(\w+(?:\s\w+)?)/g);
  if (mentions) {
    const allMembers = await db.select().from(members).where(eq(members.teamId, team.id));
    for (const mention of mentions) {
      const mentionedName = mention.replace("@", "").trim();
      const member = allMembers.find((m: any) => m.name.toLowerCase().startsWith(mentionedName.toLowerCase()));
      if (member) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.teamId, team.id)));
        await db.insert(notifications).values({ teamId: team.id, recipientName: member.name, title: "You were mentioned in a comment", message: `${authorName} mentioned you on "${task?.title}": "${content}"`, taskId, projectId: task?.projectId || null, read: "false" });
      }
    }
  }

  res.status(201).json(log);
});

// ─── Notifications ───
app.get(`${t}/notifications/:name`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const n = await db.select().from(notifications).where(and(eq(notifications.teamId, team.id), eq(notifications.recipientName, req.params.name))).orderBy(desc(notifications.createdAt));
  res.json(n);
});

app.patch(`${t}/notifications/:id/read`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  await db.update(notifications).set({ read: "true" }).where(and(eq(notifications.id, id), eq(notifications.teamId, team.id)));
  res.json({ success: true });
});

app.post(`${t}/notifications/mark-all-read`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const { recipientName } = req.body;
  if (!recipientName) return res.status(400).json({ error: "recipientName required" });
  await db.update(notifications).set({ read: "true" }).where(and(eq(notifications.teamId, team.id), eq(notifications.recipientName, recipientName)));
  res.json({ success: true });
});

// ─── Excel Export ───
app.get(`${t}/export/excel`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const [allMembers, allProjects, allTasks] = await Promise.all([
    db.select().from(members).where(eq(members.teamId, team.id)),
    db.select().from(projects).where(eq(projects.teamId, team.id)),
    db.select().from(tasks).where(eq(tasks.teamId, team.id)),
  ]);

  const taskRows = allTasks.map((t: any) => ({
    "Task": t.title,
    "Description": t.description || "",
    "Project": allProjects.find((p: any) => p.id === t.projectId)?.name || "",
    "Assignee": allMembers.find((m: any) => m.id === t.assigneeId)?.name || "",
    "Status": t.status,
    "Priority": t.priority,
    "Progress (%)": t.progress,
    "Due Date": t.dueDate || "",
  }));

  const memberRows = allMembers.map((m: any) => ({
    "Name": m.name,
    "Role": m.role,
    "Type": m.type || "person",
  }));

  const projectRows = allProjects.map((p: any) => ({
    "Project Name": p.name,
    "Color": p.color,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows.length ? taskRows : [{}]), "Tasks");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberRows.length ? memberRows : [{}]), "Team");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows.length ? projectRows : [{}]), "Projects");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=taskflow-export.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── Excel Import ───
app.post(`${t}/import/excel`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "No data provided" });

    const buf = Buffer.from(data, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });

    const teamSheet = wb.Sheets["Team"];
    const projectSheet = wb.Sheets["Projects"];
    const taskSheet = wb.Sheets["Tasks"];

    if (teamSheet) {
      const teamRows = XLSX.utils.sheet_to_json<any>(teamSheet);
      const existingMembers = await db.select().from(members).where(eq(members.teamId, team.id));
      for (const row of teamRows) {
        if (!row["Name"]) continue;
        const exists = existingMembers.find((m: any) => m.name.toLowerCase() === row["Name"].toLowerCase());
        if (!exists) {
          const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219"];
          await db.insert(members).values({ teamId: team.id, name: row["Name"], role: row["Role"] || "Team Member", color: colors[Math.floor(Math.random() * colors.length)], type: row["Type"] || "person" });
        }
      }
    }

    if (projectSheet) {
      const projectRows = XLSX.utils.sheet_to_json<any>(projectSheet);
      const existingProjects = await db.select().from(projects).where(eq(projects.teamId, team.id));
      for (const row of projectRows) {
        if (!row["Project Name"]) continue;
        const exists = existingProjects.find((p: any) => p.name.toLowerCase() === row["Project Name"].toLowerCase());
        if (!exists) {
          await db.insert(projects).values({ teamId: team.id, name: row["Project Name"], color: row["Color"] || "#4F98A3" });
        }
      }
    }

    if (taskSheet) {
      const taskRows = XLSX.utils.sheet_to_json<any>(taskSheet);
      const allMembers = await db.select().from(members).where(eq(members.teamId, team.id));
      const allProjects = await db.select().from(projects).where(eq(projects.teamId, team.id));

      for (const row of taskRows) {
        if (!row["Task"]) continue;

        const assignee = row["Assignee"] ? allMembers.find((m: any) => m.name.toLowerCase() === row["Assignee"].toLowerCase()) : null;
        const project = row["Project"] ? allProjects.find((p: any) => p.name.toLowerCase() === row["Project"].toLowerCase()) : null;

        let projectId = project?.id || null;
        if (row["Project"] && !project) {
          const [newProj] = await db.insert(projects).values({ teamId: team.id, name: row["Project"], color: "#4F98A3" }).returning();
          projectId = newProj.id;
        }

        let assigneeId = assignee?.id || null;
        if (row["Assignee"] && !assignee) {
          const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB"];
          const [newMember] = await db.insert(members).values({ teamId: team.id, name: row["Assignee"], role: "Team Member", color: colors[Math.floor(Math.random() * colors.length)], type: "person" }).returning();
          assigneeId = newMember.id;
        }

        await db.insert(tasks).values({ teamId: team.id, title: row["Task"], description: row["Description"] || null, status: row["Status"] || "todo", priority: row["Priority"] || "medium", progress: row["Progress (%)"] || 0, assigneeId, projectId, dueDate: row["Due Date"] || null, order: 0 });
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Team Rename ───
app.patch(`${t}`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const { name, passkey } = req.body;
  const updates: any = {};
  if (name && typeof name === "string" && name.trim()) {
    const newSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (newSlug !== team.slug) {
      const [existing] = await db.select().from(teams).where(eq(teams.slug, newSlug));
      if (existing) return res.status(409).json({ error: "This team name is already taken" });
    }
    updates.name = name.trim();
    updates.slug = newSlug;
  }
  if (passkey !== undefined) {
    updates.passkey = passkey || null;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [updated] = await db.update(teams).set(updates).where(eq(teams.id, team.id)).returning();
  res.json(updated);
});

// ─── Project Folders ───
app.get(`${t}/projects/:id/folders`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: "Invalid ID" });
  const folders = await db.select().from(projectFolders).where(and(eq(projectFolders.teamId, team.id), eq(projectFolders.projectId, projectId))).orderBy(asc(projectFolders.createdAt));
  res.json(folders);
});

app.post(`${t}/projects/:id/folders`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: "Invalid ID" });
  const parsed = insertProjectFolderSchema.safeParse({ ...req.body, teamId: team.id, projectId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [folder] = await db.insert(projectFolders).values(parsed.data).returning();
  res.status(201).json(folder);
});

app.delete(`${t}/folders/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const result = await db.delete(projectFolders).where(and(eq(projectFolders.id, id), eq(projectFolders.teamId, team.id))).returning();
  if (result.length === 0) return res.status(404).json({ error: "Folder not found" });
  res.status(204).send();
});

// ─── Task Reorder ───
app.post(`${t}/tasks/reorder`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const { taskIds } = req.body;
  if (!Array.isArray(taskIds)) return res.status(400).json({ error: "taskIds array required" });
  for (let i = 0; i < taskIds.length; i++) {
    await db.update(tasks).set({ order: i }).where(and(eq(tasks.id, taskIds[i]), eq(tasks.teamId, team.id)));
  }
  res.json({ success: true });
});

// Project Reorder
app.post(`${t}/projects/reorder`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const { projectIds } = req.body;
  if (!Array.isArray(projectIds)) return res.status(400).json({ error: "projectIds array required" });
  for (let i = 0; i < projectIds.length; i++) {
    await db.update(projects).set({ displayOrder: i }).where(and(eq(projects.id, projectIds[i]), eq(projects.teamId, team.id)));
  }
  res.json({ success: true });
});

// ─── Chat Messages ───
app.get(`${t}/messages`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const msgs = await db.select().from(messages).where(eq(messages.teamId, team.id)).orderBy(asc(messages.createdAt));
  res.json(msgs);
});

app.post(`${t}/messages`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const { authorName, content } = req.body;
  if (!authorName || !content) return res.status(400).json({ error: "authorName and content required" });
  const [msg] = await db.insert(messages).values({ teamId: team.id, authorName, content }).returning();

  // Check for @mentions and create notifications
  const mentions = content.match(/@(\w+(?:\s\w+)?)/g);
  if (mentions) {
    const allMembers = await db.select().from(members).where(eq(members.teamId, team.id));
    for (const mention of mentions) {
      const mentionedName = mention.replace("@", "").trim();
      const member = allMembers.find((m: any) => m.name.toLowerCase().startsWith(mentionedName.toLowerCase()));
      if (member) {
        await db.insert(notifications).values({ teamId: team.id, recipientName: member.name, title: "You were mentioned in chat", message: `${authorName} mentioned you in chat: "${content}"`, taskId: null, projectId: null, read: "false" });
      }
    }
  }

  res.status(201).json(msg);
});

app.delete(`${t}/messages/:id`, resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(messages).where(and(eq(messages.id, id), eq(messages.teamId, team.id))).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

export default function handler(req: any, res: any) {
  // Vercel rewrites /api/... -> /api, reconstruct the original URL
  const routeMatches = req.headers["x-now-route-matches"];
  if (routeMatches) {
    const params = new URLSearchParams(routeMatches);
    const matched = params.get("1");
    if (matched) {
      req.url = "/api/" + decodeURIComponent(matched);
    }
  }
  app(req, res);
}
