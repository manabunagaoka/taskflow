import { eq, asc } from "drizzle-orm";
import { db } from "./db";
import {
  members, projects, tasks,
  type Member, type InsertMember,
  type Project, type InsertProject,
  type Task, type InsertTask,
} from "@shared/schema";

export interface IStorage {
  // Members
  getMembers(): Promise<Member[]>;
  getMember(id: number): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: number, member: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: number): Promise<boolean>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;

  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;

  // Bulk ops
  exportData(): Promise<{ members: Member[]; projects: Project[]; tasks: Task[] }>;
  importData(data: { members: any[]; projects: any[]; tasks: any[] }): Promise<void>;

  // Seed
  seed(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Members
  async getMembers(): Promise<Member[]> {
    return db.select().from(members).orderBy(asc(members.createdAt));
  }
  async getMember(id: number): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(eq(members.id, id));
    return member;
  }
  async createMember(member: InsertMember): Promise<Member> {
    const [created] = await db.insert(members).values(member).returning();
    return created;
  }
  async updateMember(id: number, data: Partial<InsertMember>): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(eq(members.id, id)).returning();
    return updated;
  }
  async deleteMember(id: number): Promise<boolean> {
    const result = await db.delete(members).where(eq(members.id, id)).returning();
    return result.length > 0;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(asc(projects.createdAt));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }
  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }
  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return updated;
  }
  async deleteProject(id: number): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return db.select().from(tasks).orderBy(asc(tasks.order));
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }
  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }
  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return updated;
  }
  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    return result.length > 0;
  }

  // Bulk
  async exportData() {
    const [allMembers, allProjects, allTasks] = await Promise.all([
      db.select().from(members),
      db.select().from(projects),
      db.select().from(tasks),
    ]);
    return { members: allMembers, projects: allProjects, tasks: allTasks };
  }

  async importData(data: { members: any[]; projects: any[]; tasks: any[] }) {
    // Clear existing data
    await db.delete(tasks);
    await db.delete(members);
    await db.delete(projects);

    // Insert new data (stripping IDs to let serial auto-generate)
    if (data.members?.length) {
      for (const m of data.members) {
        await db.insert(members).values({
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
          name: p.name,
          color: p.color,
        });
      }
    }
    if (data.tasks?.length) {
      // After importing members/projects, we need fresh IDs
      // For simplicity, import tasks with assignee/project set to null
      // (user can reassign after import)
      for (const t of data.tasks) {
        await db.insert(tasks).values({
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

  // Seed sample data
  async seed() {
    const existingMembers = await db.select().from(members);
    if (existingMembers.length > 0) return; // Already seeded

    const memberColors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219", "#A12C7B", "#D19900"];
    const sampleMembers = [
      { name: "Sarah Chen", role: "Product Manager", color: memberColors[0] },
      { name: "James Wilson", role: "Lead Developer", color: memberColors[1] },
      { name: "Aiko Tanaka", role: "UX Designer", color: memberColors[2] },
      { name: "Michael Brown", role: "Backend Engineer", color: memberColors[3] },
      { name: "Emma Davis", role: "QA Lead", color: memberColors[4] },
      { name: "Kenji Yamamoto", role: "Frontend Developer", color: memberColors[5] },
      { name: "Lisa Park", role: "Data Analyst", color: memberColors[6] },
      { name: "David Kim", role: "DevOps Engineer", color: memberColors[7] },
    ];

    const insertedMembers: Member[] = [];
    for (const m of sampleMembers) {
      const [created] = await db.insert(members).values(m).returning();
      insertedMembers.push(created);
    }

    const projectColors = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#D19900"];
    const sampleProjects = [
      { name: "Platform Redesign", color: projectColors[0] },
      { name: "Mobile App", color: projectColors[1] },
      { name: "API v3", color: projectColors[2] },
      { name: "Analytics Dashboard", color: projectColors[3] },
      { name: "Content Strategy", color: projectColors[4] },
    ];

    const insertedProjects: Project[] = [];
    for (const p of sampleProjects) {
      const [created] = await db.insert(projects).values(p).returning();
      insertedProjects.push(created);
    }

    const sampleTasks = [
      { title: "Design system audit", description: "Review and document current component library", status: "todo", priority: "high", progress: 0, assigneeId: insertedMembers[2].id, projectId: insertedProjects[0].id, dueDate: "2026-03-20", order: 0 },
      { title: "User research synthesis", description: "Compile findings from recent user interviews", status: "todo", priority: "medium", progress: 0, assigneeId: insertedMembers[0].id, projectId: insertedProjects[0].id, dueDate: "2026-03-18", order: 1 },
      { title: "Set up CI/CD pipeline", description: "Configure automated testing and deployment", status: "in_progress", priority: "high", progress: 60, assigneeId: insertedMembers[7].id, projectId: insertedProjects[2].id, dueDate: "2026-03-15", order: 0 },
      { title: "Implement auth flow", description: "OAuth2 and JWT token management", status: "in_progress", priority: "high", progress: 40, assigneeId: insertedMembers[3].id, projectId: insertedProjects[1].id, dueDate: "2026-03-16", order: 1 },
      { title: "Write API documentation", description: "OpenAPI spec for all endpoints", status: "in_progress", priority: "medium", progress: 25, assigneeId: insertedMembers[1].id, projectId: insertedProjects[2].id, dueDate: "2026-03-22", order: 2 },
      { title: "Performance benchmarks", description: "Load testing and optimization report", status: "review", priority: "medium", progress: 85, assigneeId: insertedMembers[4].id, projectId: insertedProjects[2].id, dueDate: "2026-03-14", order: 0 },
      { title: "Homepage wireframes", description: "Low-fi mockups for new landing page", status: "review", priority: "low", progress: 90, assigneeId: insertedMembers[2].id, projectId: insertedProjects[0].id, dueDate: "2026-03-12", order: 1 },
      { title: "Database migration plan", description: "Schema changes for v3 upgrade", status: "done", priority: "high", progress: 100, assigneeId: insertedMembers[3].id, projectId: insertedProjects[2].id, dueDate: "2026-03-10", order: 0 },
      { title: "Competitor analysis report", description: "Feature comparison matrix", status: "done", priority: "medium", progress: 100, assigneeId: insertedMembers[6].id, projectId: insertedProjects[4].id, dueDate: "2026-03-08", order: 1 },
      { title: "Chart component library", description: "Reusable chart widgets for dashboards", status: "todo", priority: "medium", progress: 0, assigneeId: insertedMembers[5].id, projectId: insertedProjects[3].id, dueDate: "2026-03-25", order: 2 },
      { title: "Data pipeline setup", description: "ETL processes for analytics", status: "in_progress", priority: "high", progress: 55, assigneeId: insertedMembers[6].id, projectId: insertedProjects[3].id, dueDate: "2026-03-19", order: 3 },
      { title: "Content calendar Q2", description: "Plan editorial calendar for next quarter", status: "todo", priority: "low", progress: 0, assigneeId: insertedMembers[0].id, projectId: insertedProjects[4].id, dueDate: "2026-03-28", order: 3 },
    ];

    for (const t of sampleTasks) {
      await db.insert(tasks).values(t);
    }
  }
}

export const storage = new DatabaseStorage();
