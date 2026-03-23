import { eq, asc, desc, and, sql } from "drizzle-orm";
import { db } from "./db";
import {
  teams, members, projects, tasks, activityLogs, notifications, projectFolders, messages,
  type Team, type InsertTeam,
  type Member, type InsertMember,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type ActivityLog, type InsertActivityLog,
  type Notification, type InsertNotification,
  type ProjectFolder, type InsertProjectFolder,
  type Message, type InsertMessage,
} from "../shared/schema";

export interface IStorage {
  // Teams
  getTeamBySlug(slug: string): Promise<Team | undefined>;
  getTeamByInviteToken(token: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team | undefined>;
  getAllTeams(): Promise<Team[]>;
  deleteTeam(id: number): Promise<boolean>;

  // Members (team-scoped)
  getMembers(teamId: number): Promise<Member[]>;
  getMember(teamId: number, id: number): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(teamId: number, id: number, data: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(teamId: number, id: number): Promise<boolean>;
  countMembers(teamId: number): Promise<number>;

  // Projects (team-scoped)
  getProjects(teamId: number): Promise<Project[]>;
  getProject(teamId: number, id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(teamId: number, id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(teamId: number, id: number): Promise<boolean>;
  countProjects(teamId: number): Promise<number>;

  // Tasks (team-scoped)
  getTasks(teamId: number): Promise<Task[]>;
  getTask(teamId: number, id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(teamId: number, id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(teamId: number, id: number): Promise<boolean>;
  countTasks(teamId: number): Promise<number>;

  // Bulk ops (team-scoped)
  exportData(teamId: number): Promise<{ members: Member[]; projects: Project[]; tasks: Task[] }>;
  importData(teamId: number, data: { members: any[]; projects: any[]; tasks: any[] }): Promise<void>;

  // Activity Logs (team-scoped)
  getActivityLogs(teamId: number, taskId: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;

  // Notifications (team-scoped)
  getNotifications(teamId: number, recipientName: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(teamId: number, id: number): Promise<void>;
  markAllNotificationsRead(teamId: number, recipientName: string): Promise<void>;

  // Project Folders
  getProjectFolders(teamId: number, projectId: number): Promise<ProjectFolder[]>;
  createProjectFolder(folder: InsertProjectFolder): Promise<ProjectFolder>;
  deleteProjectFolder(teamId: number, id: number): Promise<boolean>;

  // Task reorder
  reorderTasks(teamId: number, taskIds: number[]): Promise<void>;

  // Project reorder
  reorderProjects(teamId: number, projectIds: number[]): Promise<void>;

  // Chat Messages
  getMessages(teamId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  deleteMessage(teamId: number, id: number): Promise<boolean>;
  deleteAllMessages(teamId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Teams
  async getTeamBySlug(slug: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
    return team;
  }
  async getTeamByInviteToken(token: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.inviteToken, token));
    return team;
  }
  async createTeam(team: InsertTeam): Promise<Team> {
    const [created] = await db.insert(teams).values(team).returning();
    return created;
  }
  async updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [updated] = await db.update(teams).set(data).where(eq(teams.id, id)).returning();
    return updated;
  }
  async getAllTeams(): Promise<Team[]> {
    return db.select().from(teams).orderBy(asc(teams.createdAt));
  }
  async deleteTeam(id: number): Promise<boolean> {
    // Delete all team data first
    await db.delete(activityLogs).where(eq(activityLogs.teamId, id));
    await db.delete(notifications).where(eq(notifications.teamId, id));
    await db.delete(projectFolders).where(eq(projectFolders.teamId, id));
    await db.delete(messages).where(eq(messages.teamId, id));
    await db.delete(tasks).where(eq(tasks.teamId, id));
    await db.delete(members).where(eq(members.teamId, id));
    await db.delete(projects).where(eq(projects.teamId, id));
    const result = await db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
  }

  // Members
  async getMembers(teamId: number): Promise<Member[]> {
    return db.select().from(members).where(eq(members.teamId, teamId)).orderBy(asc(members.createdAt));
  }
  async getMember(teamId: number, id: number): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(and(eq(members.id, id), eq(members.teamId, teamId)));
    return member;
  }
  async createMember(member: InsertMember): Promise<Member> {
    const [created] = await db.insert(members).values(member).returning();
    return created;
  }
  async updateMember(teamId: number, id: number, data: Partial<InsertMember>): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(and(eq(members.id, id), eq(members.teamId, teamId))).returning();
    return updated;
  }
  async deleteMember(teamId: number, id: number): Promise<boolean> {
    const result = await db.delete(members).where(and(eq(members.id, id), eq(members.teamId, teamId))).returning();
    return result.length > 0;
  }
  async countMembers(teamId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(eq(members.teamId, teamId));
    return row.count;
  }

  // Projects
  async getProjects(teamId: number): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.teamId, teamId)).orderBy(asc(projects.createdAt));
  }
  async getProject(teamId: number, id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.teamId, teamId)));
    return project;
  }
  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }
  async updateProject(teamId: number, id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.teamId, teamId))).returning();
    return updated;
  }
  async deleteProject(teamId: number, id: number): Promise<boolean> {
    const result = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.teamId, teamId))).returning();
    return result.length > 0;
  }
  async countProjects(teamId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.teamId, teamId));
    return row.count;
  }

  // Tasks
  async getTasks(teamId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.teamId, teamId)).orderBy(asc(tasks.order));
  }
  async getTask(teamId: number, id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.teamId, teamId)));
    return task;
  }
  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }
  async updateTask(teamId: number, id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set(data).where(and(eq(tasks.id, id), eq(tasks.teamId, teamId))).returning();
    return updated;
  }
  async deleteTask(teamId: number, id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.teamId, teamId))).returning();
    return result.length > 0;
  }
  async countTasks(teamId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.teamId, teamId));
    return row.count;
  }

  // Bulk
  async exportData(teamId: number) {
    const [allMembers, allProjects, allTasks] = await Promise.all([
      db.select().from(members).where(eq(members.teamId, teamId)),
      db.select().from(projects).where(eq(projects.teamId, teamId)),
      db.select().from(tasks).where(eq(tasks.teamId, teamId)),
    ]);
    return { members: allMembers, projects: allProjects, tasks: allTasks };
  }

  async importData(teamId: number, data: { members: any[]; projects: any[]; tasks: any[] }) {
    // Clear existing team data
    await db.delete(tasks).where(eq(tasks.teamId, teamId));
    await db.delete(members).where(eq(members.teamId, teamId));
    await db.delete(projects).where(eq(projects.teamId, teamId));

    if (data.members?.length) {
      for (const m of data.members) {
        await db.insert(members).values({
          teamId,
          name: m.name,
          role: m.role,
          color: m.color,
          avatar: m.avatar || null,
        });
      }
    }
    if (data.projects?.length) {
      for (const p of data.projects) {
        await db.insert(projects).values({
          teamId,
          name: p.name,
          color: p.color,
        });
      }
    }
    if (data.tasks?.length) {
      for (const t of data.tasks) {
        await db.insert(tasks).values({
          teamId,
          title: t.title,
          description: t.description || null,
          status: t.status || "todo",
          priority: t.priority || "medium",
          progress: t.progress || 0,
          assigneeId: null,
          projectId: null,
          startDate: t.startDate || null,
          dueDate: t.dueDate || null,
          order: t.order || 0,
        });
      }
    }
  }

  // Activity Logs
  async getActivityLogs(teamId: number, taskId: number): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(and(eq(activityLogs.teamId, teamId), eq(activityLogs.taskId, taskId)))
      .orderBy(asc(activityLogs.createdAt));
  }
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLogs).values(log).returning();
    return created;
  }

  // Notifications
  async getNotifications(teamId: number, recipientName: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(and(eq(notifications.teamId, teamId), eq(notifications.recipientName, recipientName)))
      .orderBy(desc(notifications.createdAt));
  }
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }
  async markNotificationRead(teamId: number, id: number): Promise<void> {
    await db.update(notifications).set({ read: "true" })
      .where(and(eq(notifications.id, id), eq(notifications.teamId, teamId)));
  }
  async markAllNotificationsRead(teamId: number, recipientName: string): Promise<void> {
    await db.update(notifications).set({ read: "true" })
      .where(and(eq(notifications.teamId, teamId), eq(notifications.recipientName, recipientName)));
  }

  // Project Folders
  async getProjectFolders(teamId: number, projectId: number): Promise<ProjectFolder[]> {
    return db.select().from(projectFolders)
      .where(and(eq(projectFolders.teamId, teamId), eq(projectFolders.projectId, projectId)))
      .orderBy(asc(projectFolders.createdAt));
  }
  async createProjectFolder(folder: InsertProjectFolder): Promise<ProjectFolder> {
    const [created] = await db.insert(projectFolders).values(folder).returning();
    return created;
  }
  async deleteProjectFolder(teamId: number, id: number): Promise<boolean> {
    const result = await db.delete(projectFolders).where(and(eq(projectFolders.id, id), eq(projectFolders.teamId, teamId))).returning();
    return result.length > 0;
  }

  // Task reorder
  async reorderTasks(teamId: number, taskIds: number[]): Promise<void> {
    for (let i = 0; i < taskIds.length; i++) {
      await db.update(tasks).set({ order: i }).where(and(eq(tasks.id, taskIds[i]), eq(tasks.teamId, teamId)));
    }
  }

  // Project reorder
  async reorderProjects(teamId: number, projectIds: number[]): Promise<void> {
    for (let i = 0; i < projectIds.length; i++) {
      await db.update(projects).set({ displayOrder: i }).where(and(eq(projects.id, projectIds[i]), eq(projects.teamId, teamId)));
    }
  }

  // Chat Messages
  async getMessages(teamId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.teamId, teamId))
      .orderBy(asc(messages.createdAt));
  }
  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }
  async deleteMessage(teamId: number, id: number): Promise<boolean> {
    const result = await db.delete(messages).where(and(eq(messages.id, id), eq(messages.teamId, teamId))).returning();
    return result.length > 0;
  }
  async deleteAllMessages(teamId: number): Promise<void> {
    await db.delete(messages).where(eq(messages.teamId, teamId));
  }
}

export async function logTaskChange(
  storage: IStorage,
  teamId: number,
  taskId: number,
  authorName: string,
  changeDescription: string
) {
  await storage.createActivityLog({
    teamId,
    taskId,
    authorName,
    type: "change",
    content: changeDescription,
  });
}

export const storage = new DatabaseStorage();
