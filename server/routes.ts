import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, logTaskChange } from "./storage";
import { insertMemberSchema, insertProjectSchema, insertTaskSchema, insertTeamSchema, insertProjectFolderSchema } from "../shared/schema";
import XLSX from "xlsx";

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
    const team = await storage.createTeam({ ...parsed.data, slug, passkey: req.body.passkey || null });
    // Create founding member if provided
    // Auto-create Misc project
    await storage.createProject({ teamId: team.id, name: "Misc", color: "#6B7280" });
    if (req.body.founderName) {
      const member = await storage.createMember({
        teamId: team.id,
        name: req.body.founderName,
        role: "Team Lead",
        color: "#4F98A3",
        email: req.body.founderEmail || null,
        phone: req.body.founderPhone || null,
        notifyEmail: req.body.founderEmail ? "on" : "off",
        notifyPhone: req.body.founderPhone ? "on" : "off",
      });
      // Update team with createdBy
      await storage.updateTeam(team.id, { createdBy: member.id });
      return res.status(201).json({ ...team, createdBy: member.id });
    }
    res.status(201).json(team);
  });

  app.get("/api/teams/:slug", async (req, res) => {
    const team = await storage.getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ error: "Team not found" });
    // Don't expose passkey, but tell client if one is required
    const { passkey, ...teamData } = team as any;
    res.json({ ...teamData, hasPasskey: !!passkey });
  });

  app.post("/api/teams/:slug/join", async (req, res) => {
    const team = await storage.getTeamBySlug(req.params.slug);
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
    await storage.deleteTeam(team.id);
    res.status(204).send();
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
  // Admin: get team members
  app.get("/api/admin/:key/teams/:id/members", async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const m = await storage.getMembers(id);
    res.json(m);
  });

  // Admin: delete member
  app.delete("/api/admin/:key/teams/:teamId/members/:memberId", async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
    const teamId = parseInt(req.params.teamId);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(teamId) || isNaN(memberId)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteMember(teamId, memberId);
    if (!ok) return res.status(404).json({ error: "Member not found" });
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
    const member = await storage.createMember(parsed.data);
    res.status(201).json(member);
  });

  // Admin: edit member
  app.patch("/api/admin/:key/teams/:teamId/members/:memberId", async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.params.key !== adminKey) return res.status(403).json({ error: "Forbidden" });
    const teamId = parseInt(req.params.teamId);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(teamId) || isNaN(memberId)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateMember(teamId, memberId, req.body);
    if (!updated) return res.status(404).json({ error: "Member not found" });
    res.json(updated);
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
    // Auto-delete team when last member leaves
    const remaining = await storage.countMembers(team.id);
    if (remaining === 0) {
      await storage.deleteTeam(team.id);
      return res.json({ teamDeleted: true });
    }
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
    const { changedBy, ...updateData } = req.body;
    const oldProject = await storage.getProject(team.id, id);
    const updated = await storage.updateProject(team.id, id, updateData);
    if (!updated) return res.status(404).json({ error: "Project not found" });

    // Check for NEW @mentions in project description
    if (req.body.description) {
      const newMentions = req.body.description.match(/@(\w+(?:\s\w+)?)/g) || [];
      const oldMentions = (oldProject?.description || "").match(/@(\w+(?:\s\w+)?)/g) || [];
      const addedMentions = newMentions.filter((m: string) => !oldMentions.includes(m));
      if (addedMentions.length > 0) {
        const allMembers = await storage.getMembers(team.id);
        const authorName = changedBy || "Someone";
        for (const mention of addedMentions) {
          const mentionedName = mention.replace("@", "").trim();
          const member = allMembers.find((m: any) =>
            m.name.toLowerCase() === mentionedName.toLowerCase()
          );
          if (member && member.name !== authorName) {
            await storage.createNotification({
              teamId: team.id,
              recipientName: member.name,
              title: "You were mentioned in a project",
              message: `${authorName} mentioned you in project "${updated.title}"`,
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

    const oldTask = await storage.getTask(team.id, id);
    if (!oldTask) return res.status(404).json({ error: "Task not found" });

    const updated = await storage.updateTask(team.id, id, req.body);
    if (!updated) return res.status(404).json({ error: "Task not found" });

    const authorName = req.body.changedBy || "Someone";

    if (req.body.status && req.body.status !== oldTask.status) {
      await logTaskChange(storage, team.id, id, authorName, `Status changed from "${oldTask.status}" to "${req.body.status}"`);

      if (req.body.status === "done" && oldTask.assigneeId) {
        const assignee = await storage.getMember(team.id, oldTask.assigneeId);
        if (assignee) {
          await storage.createNotification({
            teamId: team.id,
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
      const newAssignee = await storage.getMember(team.id, req.body.assigneeId);
      if (newAssignee) {
        await logTaskChange(storage, team.id, id, authorName, `Assigned to ${newAssignee.name}`);
        await storage.createNotification({
          teamId: team.id,
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
      await logTaskChange(storage, team.id, id, authorName, `Priority changed from "${oldTask.priority}" to "${req.body.priority}"`);
    }

    if (req.body.progress !== undefined && req.body.progress !== oldTask.progress) {
      await logTaskChange(storage, team.id, id, authorName, `Progress updated to ${req.body.progress}%`);
    }

    // Check for NEW @mentions in description (skip ones already in old description)
    if (req.body.description && req.body.description !== oldTask.description) {
      const newMentions = req.body.description.match(/@(\w+(?:\s\w+)?)/g) || [];
      const oldMentions = (oldTask.description || "").match(/@(\w+(?:\s\w+)?)/g) || [];
      const addedMentions = newMentions.filter((m: string) => !oldMentions.includes(m));
      if (addedMentions.length > 0) {
        const allMembers = await storage.getMembers(team.id);
        for (const mention of addedMentions) {
          const mentionedName = mention.replace("@", "").trim();
          const member = allMembers.find((m: any) =>
            m.name.toLowerCase() === mentionedName.toLowerCase()
          );
          if (member && member.name !== authorName) {
            await storage.createNotification({
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

  // ─── Activity Logs ───
  app.get(`${t}/tasks/:id/activity`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const logs = await storage.getActivityLogs(team.id, id);
    res.json(logs);
  });

  app.post(`${t}/tasks/:id/activity`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) return res.status(400).json({ error: "Invalid ID" });
    const { authorName, content } = req.body;
    if (!authorName || !content) return res.status(400).json({ error: "authorName and content required" });

    const log = await storage.createActivityLog({
      teamId: team.id,
      taskId,
      authorName,
      type: "comment",
      content,
    });

    // Check for @mentions and create notifications
    const mentions = content.match(/@(\w+(?:\s\w+)?)/g);
    if (mentions) {
      const allMembers = await storage.getMembers(team.id);
      for (const mention of mentions) {
        const mentionedName = mention.replace("@", "").trim();
        const member = allMembers.find((m: any) =>
          m.name.toLowerCase() === mentionedName.toLowerCase()
        );
        if (member) {
          const task = await storage.getTask(team.id, taskId);
          await storage.createNotification({
            teamId: team.id,
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

  // ─── Notifications ───
  app.get(`${t}/notifications/:name`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const n = await storage.getNotifications(team.id, req.params.name);
    res.json(n);
  });

  app.patch(`${t}/notifications/:id/read`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await storage.markNotificationRead(team.id, id);
    res.json({ success: true });
  });

  app.post(`${t}/notifications/mark-all-read`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const { recipientName } = req.body;
    if (!recipientName) return res.status(400).json({ error: "recipientName required" });
    await storage.markAllNotificationsRead(team.id, recipientName);
    res.json({ success: true });
  });

  // ─── Excel Export ───
  app.get(`${t}/export/excel`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const [allMembers, allProjects, allTasks] = await Promise.all([
      storage.getMembers(team.id),
      storage.getProjects(team.id),
      storage.getTasks(team.id),
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
        const existingMembers = await storage.getMembers(team.id);
        for (const row of teamRows) {
          if (!row["Name"]) continue;
          const exists = existingMembers.find((m: any) => m.name.toLowerCase() === row["Name"].toLowerCase());
          if (!exists) {
            const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219"];
            await storage.createMember({
              teamId: team.id,
              name: row["Name"],
              role: row["Role"] || "Team Member",
              color: colors[Math.floor(Math.random() * colors.length)],
              type: row["Type"] || "person",
            });
          }
        }
      }

      if (projectSheet) {
        const projectRows = XLSX.utils.sheet_to_json<any>(projectSheet);
        const existingProjects = await storage.getProjects(team.id);
        for (const row of projectRows) {
          if (!row["Project Name"]) continue;
          const exists = existingProjects.find((p: any) => p.name.toLowerCase() === row["Project Name"].toLowerCase());
          if (!exists) {
            await storage.createProject({
              teamId: team.id,
              name: row["Project Name"],
              color: row["Color"] || "#4F98A3",
            });
          }
        }
      }

      if (taskSheet) {
        const taskRows = XLSX.utils.sheet_to_json<any>(taskSheet);
        const allMembers = await storage.getMembers(team.id);
        const allProjects = await storage.getProjects(team.id);

        for (const row of taskRows) {
          if (!row["Task"]) continue;

          const assignee = row["Assignee"]
            ? allMembers.find((m: any) => m.name.toLowerCase() === row["Assignee"].toLowerCase())
            : null;
          const project = row["Project"]
            ? allProjects.find((p: any) => p.name.toLowerCase() === row["Project"].toLowerCase())
            : null;

          let projectId = project?.id || null;
          if (row["Project"] && !project) {
            const newProj = await storage.createProject({
              teamId: team.id,
              name: row["Project"],
              color: "#4F98A3",
            });
            projectId = newProj.id;
          }

          let assigneeId = assignee?.id || null;
          if (row["Assignee"] && !assignee) {
            const colors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB"];
            const newMember = await storage.createMember({
              teamId: team.id,
              name: row["Assignee"],
              role: "Team Member",
              color: colors[Math.floor(Math.random() * colors.length)],
              type: "person",
            });
            assigneeId = newMember.id;
          }

          await storage.createTask({
            teamId: team.id,
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

  // ─── Team Rename ───
  app.patch(`${t}`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const { name, passkey } = req.body;
    const updates: any = {};
    if (name && typeof name === "string" && name.trim()) {
      const newSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (newSlug !== team.slug) {
        const existing = await storage.getTeamBySlug(newSlug);
        if (existing) return res.status(409).json({ error: "This team name is already taken" });
      }
      updates.name = name.trim();
      updates.slug = newSlug;
    }
    if (passkey !== undefined) {
      updates.passkey = passkey || null;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
    const updated = await storage.updateTeam(team.id, updates);
    res.json(updated);
  });

  // ─── Project Folders ───
  app.get(`${t}/projects/:id/folders`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid ID" });
    const folders = await storage.getProjectFolders(team.id, projectId);
    res.json(folders);
  });

  app.post(`${t}/projects/:id/folders`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid ID" });
    const parsed = insertProjectFolderSchema.safeParse({ ...req.body, teamId: team.id, projectId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const folder = await storage.createProjectFolder(parsed.data);
    res.status(201).json(folder);
  });

  app.delete(`${t}/folders/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const ok = await storage.deleteProjectFolder(team.id, id);
    if (!ok) return res.status(404).json({ error: "Folder not found" });
    res.status(204).send();
  });

  // ─── Task Reorder ───
  app.post(`${t}/tasks/reorder`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds)) return res.status(400).json({ error: "taskIds array required" });
    await storage.reorderTasks(team.id, taskIds);
    res.json({ success: true });
  });

  // ─── Project Reorder ───
  app.post(`${t}/projects/reorder`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const { projectIds } = req.body;
    if (!Array.isArray(projectIds)) return res.status(400).json({ error: "projectIds array required" });
    await storage.reorderProjects(team.id, projectIds);
    res.json({ success: true });
  });

  // ─── Chat Messages ───
  app.get(`${t}/messages`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const msgs = await storage.getMessages(team.id);
    res.json(msgs);
  });

  app.post(`${t}/messages`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const { authorName, content } = req.body;
    if (!authorName || !content) return res.status(400).json({ error: "authorName and content required" });
    const msg = await storage.createMessage({ teamId: team.id, authorName, content });

    // Check for @mentions and create notifications
    const mentions = content.match(/@(\w+(?:\s\w+)?)/g);
    if (mentions) {
      const allMembers = await storage.getMembers(team.id);
      for (const mention of mentions) {
        const mentionedName = mention.replace("@", "").trim();
        const member = allMembers.find((m: any) =>
          m.name.toLowerCase() === mentionedName.toLowerCase()
        );
        if (member) {
          await storage.createNotification({
            teamId: team.id,
            recipientName: member.name,
            title: "You were mentioned in chat",
            message: `${authorName} mentioned you in chat: "${content}"`,
            taskId: null,
            projectId: null,
            read: "false",
          });
        }
      }
    }

    res.status(201).json(msg);
  });

  app.delete(`${t}/messages/:id`, resolveTeam, async (req, res) => {
    const team = (req as any).team;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const deleted = await storage.deleteMessage(team.id, id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  });

  return httpServer;
}
