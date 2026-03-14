import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { eq, asc } from "drizzle-orm";

export const config = {
  api: { bodyParser: false },
};

// ─── Schema (inlined) ───
const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar"),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
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

const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true });
const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });

const schema = { members, projects, tasks };

// ─── Database ───
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

// ─── Express App ───
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasDb: !!process.env.DATABASE_URL });
});

// ─── Members ───
app.get("/api/members", async (_req, res) => {
  const result = await db.select().from(members).orderBy(asc(members.id));
  res.json(result);
});

app.post("/api/members", async (req, res) => {
  const parsed = insertMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [member] = await db.insert(members).values(parsed.data).returning();
  res.status(201).json(member);
});

app.patch("/api/members/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(members).set(req.body).where(eq(members.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/members/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(members).where(eq(members.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Projects ───
app.get("/api/projects", async (_req, res) => {
  const result = await db.select().from(projects).orderBy(asc(projects.id));
  res.json(result);
});

app.post("/api/projects", async (req, res) => {
  const parsed = insertProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [project] = await db.insert(projects).values(parsed.data).returning();
  res.status(201).json(project);
});

app.patch("/api/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(projects).set(req.body).where(eq(projects.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Tasks ───
app.get("/api/tasks", async (_req, res) => {
  const result = await db.select().from(tasks).orderBy(asc(tasks.order));
  res.json(result);
});

app.post("/api/tasks", async (req, res) => {
  const parsed = insertTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [task] = await db.insert(tasks).values(parsed.data).returning();
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(tasks).set(req.body).where(eq(tasks.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Export / Import ───
app.get("/api/export", async (_req, res) => {
  const [allMembers, allProjects, allTasks] = await Promise.all([
    db.select().from(members),
    db.select().from(projects),
    db.select().from(tasks),
  ]);
  res.json({ members: allMembers, projects: allProjects, tasks: allTasks });
});

app.post("/api/import", async (req, res) => {
  try {
    const { members: mData, projects: pData, tasks: tData } = req.body;
    if (mData) for (const m of mData) await db.insert(members).values(m).onConflictDoNothing();
    if (pData) for (const p of pData) await db.insert(projects).values(p).onConflictDoNothing();
    if (tData) for (const t of tData) await db.insert(tasks).values(t).onConflictDoNothing();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Debug: catch all unmatched routes
app.use((req, res) => {
  res.status(404).json({
    debug: true,
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    params: req.params,
    body: req.body,
    headers_x_vercel_url: req.headers["x-vercel-forwarded-for"],
    headers_x_now_route: req.headers["x-now-route-matches"],
  });
});

export default function handler(req: any, res: any) {
  // Vercel rewrites /api/members/5 -> /api, but x-now-route-matches has the original path
  // Reconstruct the original URL from Vercel headers
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
