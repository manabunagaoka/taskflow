import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useParams, useLocation, Link } from "wouter";
import type { Task, Member, Project } from "@shared/schema";
import { TaskDialog } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Plus, ArrowLeft, LayoutDashboard, AlertTriangle, Trash2 } from "lucide-react";
import { isPast, isToday, parseISO, format } from "date-fns";

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

const STATUS_COLOR: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const PRIORITY_ICON: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-emerald-500",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function ProjectDetail() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { apiBase, teamSlug } = useTeam();
  const params = useParams<{ projectId: string }>();
  const projectId = parseInt(params.projectId);
  const [, navigate] = useLocation();

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: [`${apiBase}/projects`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });
  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });

  const project = projects.find((p) => p.id === projectId);
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);

  const deleteTask = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
    },
  });

  const stats = useMemo(() => {
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.status === "done").length;
    const inProgress = projectTasks.filter((t) => t.status === "in_progress").length;
    const review = projectTasks.filter((t) => t.status === "review").length;
    const todo = projectTasks.filter((t) => t.status === "todo").length;
    const avgProgress = total > 0 ? Math.round(projectTasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
    return { total, done, inProgress, review, todo, avgProgress };
  }, [projectTasks]);

  // Group tasks by status
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of projectTasks) {
      (groups[t.status] || groups.todo).push(t);
    }
    // Sort each group by order
    for (const key in groups) {
      groups[key].sort((a, b) => a.order - b.order);
    }
    return groups;
  }, [projectTasks]);

  const handleNewTask = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  if (!project) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Project not found</p>
        <Link href={`/t/${teamSlug}`} className="text-sm text-primary mt-2 inline-block">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link href={`/t/${teamSlug}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-xl font-semibold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/t/${teamSlug}/board/${projectId}`)}
          >
            <LayoutDashboard className="h-4 w-4 mr-1" />
            Board View
          </Button>
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 flex-1">
          <Progress value={stats.avgProgress} className="h-2 flex-1 max-w-xs" />
          <span className="text-sm text-muted-foreground tabular-nums">{stats.avgProgress}%</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{stats.total} tasks</Badge>
          <Badge variant="secondary" className="text-xs">{stats.done} done</Badge>
          <Badge variant="secondary" className="text-xs">{stats.review} review</Badge>
          <Badge variant="secondary" className="text-xs">{stats.inProgress} in progress</Badge>
        </div>
      </div>

      {/* Task list grouped by status */}
      {projectTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm font-medium mb-1">No tasks yet</p>
          <p className="text-xs mb-4">Add tasks to this project to get started.</p>
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {(["todo", "in_progress", "review", "done"] as const).map((status) => {
            const statusTasks = groupedTasks[status];
            if (statusTasks.length === 0) return null;
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {STATUS_LABEL[status]}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">{statusTasks.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {statusTasks.map((task) => {
                    const assignee = members.find((m) => m.id === task.assigneeId);
                    const isOverdue = task.dueDate && task.status !== "done" && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
                    return (
                      <Card
                        key={task.id}
                        className="px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow"
                        onClick={() => handleEditTask(task)}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className={`text-[10px] shrink-0 ${STATUS_COLOR[task.status]}`}>
                            {STATUS_LABEL[task.status]}
                          </Badge>
                          <span className="text-sm flex-1 truncate">{task.title}</span>
                          {task.priority === "high" && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          {task.dueDate && (
                            <span className={`text-xs shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                              {format(parseISO(task.dueDate), "MMM d")}
                            </span>
                          )}
                          {task.progress > 0 && task.progress < 100 && (
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{task.progress}%</span>
                          )}
                          {assignee && (
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarFallback
                                className="text-[9px] font-semibold text-white"
                                style={{ backgroundColor: assignee.color }}
                              >
                                {getInitials(assignee.name)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask.mutate(task.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        members={members}
        projects={projects}
        defaultProjectId={projectId}
      />
    </div>
  );
}
