import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import type { Project, Task } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PROJECT_COLORS = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#D19900", "#006494", "#A12C7B", "#964219"];

export default function Projects() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const { apiBase } = useTeam();

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: [`${apiBase}/projects`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });

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
    mutationFn: async (id: string) => {
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

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setName(p.name);
    setColor(p.color);
    setDialogOpen(true);
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

  const getProjectStats = (projectId: string) => {
    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.status === "done").length;
    const avgProgress = total > 0 ? Math.round(projectTasks.reduce((s, t) => s + t.progress, 0) / total) : 0;
    return { total, done, avgProgress };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projects</p>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const stats = getProjectStats(p.id);
            return (
              <Card key={p.id} className="p-4" data-testid={`project-card-${p.id}`}>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium truncate">{p.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} data-testid={`button-edit-project-${p.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteProject.mutate(p.id)} data-testid={`button-delete-project-${p.id}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {stats.total} tasks
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {stats.done} done
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={stats.avgProgress} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{stats.avgProgress}%</span>
                    </div>
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
