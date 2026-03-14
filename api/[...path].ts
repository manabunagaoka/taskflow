import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, asc } from "drizzle-orm";
import * as schema from "../shared/schema";
import { insertMemberSchema, insertProjectSchema, insertTaskSchema } from "../shared/schema";

export const config = {
  api: { bodyParser: false },
};

// Database setup
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasDb: !!process.env.DATABASE_URL });
});

// ─── Members ───
app.get("/api/members", async (_req, res) => {
  const members = await db.select().from(schema.members).orderBy(asc(schema.members.id));
  res.json(members);
});

app.post("/api/members", async (req, res) => {
  const parsed = insertMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [member] = await db.insert(schema.members).values(parsed.data).returning();
  res.status(201).json(member);
});

app.patch("/api/members/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(schema.members).set(req.body).where(eq(schema.members.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/members/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(schema.members).where(eq(schema.members.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Projects ───
app.get("/api/projects", async (_req, res) => {
  const projects = await db.select().from(schema.projects).orderBy(asc(schema.projects.id));
  res.json(projects);
});

app.post("/api/projects", async (req, res) => {
  const parsed = insertProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [project] = await db.insert(schema.projects).values(parsed.data).returning();
  res.status(201).json(project);
});

app.patch("/api/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(schema.projects).set(req.body).where(eq(schema.projects.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(schema.projects).where(eq(schema.projects.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Tasks ───
app.get("/api/tasks", async (_req, res) => {
  const tasks = await db.select().from(schema.tasks).orderBy(asc(schema.tasks.order));
  res.json(tasks);
});

app.post("/api/tasks", async (req, res) => {
  const parsed = insertTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [task] = await db.insert(schema.tasks).values(parsed.data).returning();
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [updated] = await db.update(schema.tasks).set(req.body).where(eq(schema.tasks.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [deleted] = await db.delete(schema.tasks).where(eq(schema.tasks.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ─── Export / Import ───
app.get("/api/export", async (_req, res) => {
  const [allMembers, allProjects, allTasks] = await Promise.all([
    db.select().from(schema.members),
    db.select().from(schema.projects),
    db.select().from(schema.tasks),
  ]);
  res.json({ members: allMembers, projects: allProjects, tasks: allTasks });
});

app.post("/api/import", async (req, res) => {
  try {
    const { members: mData, projects: pData, tasks: tData } = req.body;
    if (mData) for (const m of mData) await db.insert(schema.members).values(m).onConflictDoNothing();
    if (pData) for (const p of pData) await db.insert(schema.projects).values(p).onConflictDoNothing();
    if (tData) for (const t of tData) await db.insert(schema.tasks).values(t).onConflictDoNothing();
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default function handler(req: any, res: any) {
  app(req, res);
}
