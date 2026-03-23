CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"avatar" text,
	"color" text NOT NULL,
	"type" text DEFAULT 'person' NOT NULL,
	"email" text,
	"phone" text,
	"notify_email" text DEFAULT 'off' NOT NULL,
	"notify_phone" text DEFAULT 'off' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"recipient_name" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"task_id" integer,
	"project_id" integer,
	"read" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"provider" text DEFAULT 'link' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"owner_id" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"assignee_id" integer,
	"assignee_ids" text,
	"project_id" integer,
	"start_date" text,
	"due_date" text,
	"recurring" text DEFAULT 'none' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"passkey" text,
	"invite_token" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug"),
	CONSTRAINT "teams_invite_token_unique" UNIQUE("invite_token")
);
