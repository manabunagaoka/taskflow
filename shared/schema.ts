import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Teams
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  passkey: text("passkey"),
  inviteToken: text("invite_token").unique(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Team Members
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar"),
  color: text("color").notNull(),
  type: text("type").notNull().default("person"), // "person" or "agent"
  email: text("email"),
  phone: text("phone"),
  notifyEmail: text("notify_email").notNull().default("off"),
  notifyPhone: text("notify_phone").notNull().default("off"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// Projects / Categories
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  ownerId: integer("owner_id"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Tasks
export const tasks = pgTable("tasks", {
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
  startDate: text("start_date"),
  dueDate: text("due_date"),
  recurring: text("recurring").notNull().default("none"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Activity Logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  taskId: integer("task_id").notNull(),
  authorName: text("author_name").notNull(),
  type: text("type").notNull(), // "comment" or "change"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Notifications
export const notifications = pgTable("notifications", {
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

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Project Folders (external links)
export const projectFolders = pgTable("project_folders", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull().default("link"), // "onedrive", "gdrive", "dropbox", "sharepoint", "link"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectFolderSchema = createInsertSchema(projectFolders).omit({ id: true, createdAt: true });
export type InsertProjectFolder = z.infer<typeof insertProjectFolderSchema>;
export type ProjectFolder = typeof projectFolders.$inferSelect;

// Chat Messages
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
