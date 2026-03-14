import express from "express";
import type { Request, Response, NextFunction } from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { eq, asc, and, sql } from "drizzle-orm";

export const config = {
  api: { bodyParser: false },
};

// ─── Schema (inlined) ───
const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
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
  color: text("color").notNull(),
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
  projectId: integer("project_id"),
  dueDate: text("due_date"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true });
const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });

const schema = { teams, members, projects, tasks };

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
  const [team] = await db.insert(teams).values({ ...parsed.data, slug }).returning();
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
  res.json(team);
});

// Delete team (creator only)
app.delete("/api/t/:teamSlug", resolveTeam, async (req, res) => {
  const team = (req as any).team;
  const memberId = parseInt(req.headers["x-member-id"] as string);
  if (isNaN(memberId) || team.createdBy !== memberId) {
    return res.status(403).json({ error: "Only the team creator can delete this team" });
  }
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
  const [updated] = await db.update(projects).set(req.body).where(and(eq(projects.id, id), eq(projects.teamId, team.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
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
  const [updated] = await db.update(tasks).set(req.body).where(and(eq(tasks.id, id), eq(tasks.teamId, team.id))).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
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
