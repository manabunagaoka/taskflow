import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useLocation } from "wouter";
import type { Project, Task, Member } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderOpen, Calendar, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isPast, isToday, parseISO, format } from "date-fns";

const PROJECT_COLORS = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#D19900", "#006494", "#A12C7B", "#964219"];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const STATUS_DOT: Record<string, string> = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  done: "bg-green-500",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-emerald-500",
};

export default function Projects() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const { apiBase, teamSlug } = useTeam();
  const [, navigate] = useLocation();

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: [`${apiBase}/projects`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });
  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });

  const createProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/projects`, { name, color });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      setDialogOpen(false);
      toast({ title: "Project created" });
    },
  });

  const updateProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `${apiBase}/projects/${editingProject!.id}`, { name, color });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      setDialogOpen(false);
      toast({ title: "Project updated" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      toast({ title: "Project removed" });
    },
  });

  const openNew = () => {
    setEditingProject(null);
    setName("");
    setColor(PROJECT_COLORS[projects.length % PROJECT_COLORS.length]);
    setDialogOpen(true);
  };

  const openEdit = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(p);
    setName(p.name);
    setColor(p.color);
    setDialogOpen(true);
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProject.mutate(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingProject) {
      updateProject.mutate();
    } else {
      createProject.mutate();
    }
  };

  const getProjectTasks = (projectId: number) => {
    return tasks.filter((t) => t.projectId === projectId);
  };

  const getPreviewTasks = (projectId: number) => {
    const pTasks = getProjectTasks(projectId);
    return pTasks
      .sort((a, b) => {
        // Overdue first
        const aOverdue = a.dueDate && a.status !== "done" && isPast(parseISO(a.dueDate)) && !isToday(parseISO(a.dueDate));
        const bOverdue = b.dueDate && b.status !== "done" && isPast(parseISO(b.dueDate)) && !isToday(parseISO(b.dueDate));
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        // Then by due date
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, 5);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projects · {tasks.length} total tasks</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-project">
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium mb-1">No projects yet</p>
          <p className="text-xs mb-4">Create a project to organize your team's tasks.</p>
          <Button size="sm" onClick={openNew}>New Project</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const pTasks = getProjectTasks(p.id);
            const total = pTasks.length;
            const done = pTasks.filter((t) => t.status === "done").length;
            const avgProgress = total > 0 ? Math.round(pTasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
            const preview = getPreviewTasks(p.id);

            return (
              <Card
                key={p.id}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/t/${teamSlug}/project/${p.id}`)}
                data-testid={`project-card-${p.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium truncate">{p.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => openEdit(p, e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => handleDelete(p.id, e)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {total} tasks
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {done} done
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={avgProgress} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{avgProgress}%</span>
                    </div>

                    {/* Mini task preview */}
                    {preview.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t pt-2">
                        {preview.map((task) => {
                          const assignee = members.find((m) => m.id === task.assigneeId);
                          const isOverdue = task.dueDate && task.status !== "done" && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
                          return (
                            <div key={task.id} className="flex items-center gap-2 text-xs">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status] || "bg-gray-400"}`} />
                              <span className="truncate flex-1">{task.title}</span>
                              {task.priority === "high" && (
                                <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                              )}
                              {task.dueDate && (
                                <span className={`text-[10px] shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                  {format(parseISO(task.dueDate), "MMM d")}
                                </span>
                              )}
                              {assignee && (
                                <Avatar className="h-4 w-4 shrink-0">
                                  <AvatarFallback
                                    className="text-[7px] font-semibold text-white"
                                    style={{ backgroundColor: assignee.color }}
                                  >
                                    {getInitials(assignee.name)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1.5">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim()} data-testid="button-save-project">
                {editingProject ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
