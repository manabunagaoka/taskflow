import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMemberSchema, insertProjectSchema, insertTaskSchema, insertTeamSchema } from "../shared/schema";

// Team limits
const LIMITS = { members: 20, projects: 50, tasks: 500 };

// Middleware: resolve team from :teamSlug param
async function resolveTeam(req: Request, res: Response, next: NextFunction) {
  const team = await storage.getTeamBySlug(req.params.teamSlug);
  if (!team) return res.status(404).json({ error: "Team not found" });
  (req as any).team = team;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Teams (no team scope needed) ───
  app.post("/api/teams", async (req, res) => {
    const parsed = insertTeamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Generate slug from name
    const slug = parsed.data.slug || parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const existing = await storage.getTeamBySlug(slug);
    if (existing) return res.status(409).json({ error: "Team slug already taken" });
    const team = await storage.createTeam({ ...parsed.data, slug });
    res.status(201).json(team);
  });

  app.get("/api/teams/:slug", async (req, res) => {
    const team = await storage.getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json(team);
  });

  // ─── Admin (secret key protected) ───
  app.get("/api/admin/:key/teams", async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
    const allTeams = await storage.getAllTeams();
    // Enrich with counts
    const enriched = await Promise.all(allTeams.map(async (team) => ({
      ...team,
      memberCount: await storage.countMembers(team.id),
      projectCount: await storage.countProjects(team.id),
      taskCount: await storage.countTasks(team.id),
    })));
    res.json(enriched);
  });

  app.delete("/api/admin/:key/teams/:id", async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteTeam(id);
    if (!ok) return res.status(404).json({ error: "Team not found" });
    res.status(204).send();
  });

  // ─── All team-scoped routes ───
  const t = "/api/t/:teamSlug";

  // ─── Members ───
  app.get(`${t}/members`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const members = await storage.getMembers(team.id);
    res.json(members);
  });

  app.post(`${t}/members`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const count = await storage.countMembers(team.id);
    if (count >= LIMITS.members) return res.status(403).json({ error: `Team member limit reached (${LIMITS.members})` });
    const parsed = insertMemberSchema.safeParse({ ...req.body, teamId: team.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const member = await storage.createMember(parsed.data);
    res.status(201).json(member);
  });

  app.patch(`${t}/members/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateMember(team.id, id, req.body);
    if (!updated) return res.status(404).json({ error: "Member not found" });
    res.json(updated);
  });

  app.delete(`${t}/members/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteMember(team.id, id);
    if (!ok) return res.status(404).json({ error: "Member not found" });
    res.status(204).send();
  });

  // ─── Projects ───
  app.get(`${t}/projects`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const projects = await storage.getProjects(team.id);
    res.json(projects);
  });

  app.post(`${t}/projects`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const count = await storage.countProjects(team.id);
    if (count >= LIMITS.projects) return res.status(403).json({ error: `Project limit reached (${LIMITS.projects})` });
    const parsed = insertProjectSchema.safeParse({ ...req.body, teamId: team.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const project = await storage.createProject(parsed.data);
    res.status(201).json(project);
  });

  app.patch(`${t}/projects/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateProject(team.id, id, req.body);
    if (!updated) return res.status(404).json({ error: "Project not found" });
    res.json(updated);
  });

  app.delete(`${t}/projects/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteProject(team.id, id);
    if (!ok) return res.status(404).json({ error: "Project not found" });
    res.status(204).send();
  });

  // ─── Tasks ───
  app.get(`${t}/tasks`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const tasks = await storage.getTasks(team.id);
    res.json(tasks);
  });

  app.post(`${t}/tasks`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const count = await storage.countTasks(team.id);
    if (count >= LIMITS.tasks) return res.status(403).json({ error: `Task limit reached (${LIMITS.tasks})` });
    const parsed = insertTaskSchema.safeParse({ ...req.body, teamId: team.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const task = await storage.createTask(parsed.data);
    res.status(201).json(task);
  });

  app.patch(`${t}/tasks/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateTask(team.id, id, req.body);
    if (!updated) return res.status(404).json({ error: "Task not found" });
    res.json(updated);
  });

  app.delete(`${t}/tasks/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteTask(team.id, id);
    if (!ok) return res.status(404).json({ error: "Task not found" });
    res.status(204).send();
  });

  // ─── Bulk Export / Import ───
  app.get(`${t}/export`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const data = await storage.exportData(team.id);
    res.json(data);
  });

  app.post(`${t}/import`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    try {
      await storage.importData(team.id, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return httpServer;
}
