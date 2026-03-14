import { eq, asc, and, sql } from "drizzle-orm";
import { db } from "./db";
import {
  teams, members, projects, tasks,
  type Team, type InsertTeam,
  type Member, type InsertMember,
  type Project, type InsertProject,
  type Task, type InsertTask,
} from "../shared/schema";

export interface IStorage {
  // Teams
  getTeamBySlug(slug: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
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
}

export class DatabaseStorage implements IStorage {
  // Teams
  async getTeamBySlug(slug: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
    return team;
  }
  async createTeam(team: InsertTeam): Promise<Team> {
    const [created] = await db.insert(teams).values(team).returning();
    return created;
  }
  async getAllTeams(): Promise<Team[]> {
    return db.select().from(teams).orderBy(asc(teams.createdAt));
  }
  async deleteTeam(id: number): Promise<boolean> {
    // Delete all team data first
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
          dueDate: t.dueDate || null,
          order: t.order || 0,
        });
      }
    }
  }
}

export const storage = new DatabaseStorage();
