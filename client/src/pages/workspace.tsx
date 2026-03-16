import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Task, Member, Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Plus, Trash2, Users, Pencil, Bot, Send,
  MessageSquare, RefreshCw, AlertTriangle,
  LogOut, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { UserSelector } from "@/components/user-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, isPast, isToday, parseISO } from "date-fns";
import { useLocation } from "wouter";

const PROJECT_COLORS = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#D19900", "#006494", "#A12C7B", "#964219"];
const MEMBER_COLORS = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219", "#A12C7B", "#D19900"];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// Debounce hook for text inputs
function useDebouncedMutate(mutate: (data: any) => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return useCallback((data: any) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => mutate(data), delay);
  }, [mutate, delay]);
}

export default function Workspace() {
  const { toast } = useToast();
  const { apiBase, teamSlug, teamName } = useTeam();
  const { currentUser } = useCurrentUser();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();

  // Mobile navigation: which panel is showing
  const [mobileView, setMobileView] = useState<"projects" | "tasks" | "details">("projects");

  // Selection state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // Dialog states
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[0]);

  const [addingTask, setAddingTask] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberColor, setMemberColor] = useState(MEMBER_COLORS[0]);
  const [memberType, setMemberType] = useState("person");
  const [memberEmail, setMemberEmail] = useState("");

  // Local editing state for debounced fields
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Comment state
  const [comment, setComment] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const commentRef = useRef<HTMLInputElement>(null);

  // Data queries
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: [`${apiBase}/projects`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });
  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  // Sync local edit fields when selected task changes
  const prevTaskIdRef = useRef<number | null>(null);
  if (selectedTask && selectedTask.id !== prevTaskIdRef.current) {
    prevTaskIdRef.current = selectedTask.id;
    setEditTitle(selectedTask.title);
    setEditDescription(selectedTask.description || "");
  }
  if (!selectedTask && prevTaskIdRef.current !== null) {
    prevTaskIdRef.current = null;
  }

  const projectTasks = useMemo(() => {
    if (!selectedProjectId) return [];
    const active = tasks.filter((t) => t.projectId === selectedProjectId && t.status !== "done").sort((a, b) => a.order - b.order);
    const done = tasks.filter((t) => t.projectId === selectedProjectId && t.status === "done").sort((a, b) => a.order - b.order);
    return [...active, ...done];
  }, [tasks, selectedProjectId]);

  const sortedProjects = useMemo(() => {
    const active = projects.filter((p) => {
      const pTasks = tasks.filter((t) => t.projectId === p.id);
      return pTasks.length === 0 || pTasks.some((t) => t.status !== "done");
    });
    const completed = projects.filter((p) => {
      const pTasks = tasks.filter((t) => t.projectId === p.id);
      return pTasks.length > 0 && pTasks.every((t) => t.status === "done");
    });
    return [...active, ...completed];
  }, [projects, tasks]);

  // Activity logs for selected task
  const { data: activityLogs = [] } = useQuery<any[]>({
    queryKey: [`${apiBase}/tasks/${selectedTaskId}/activity`],
    enabled: !!selectedTaskId,
  });

  // === MUTATIONS ===
  const createProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/projects`, { name: projectName, color: projectColor });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      setProjectDialogOpen(false);
      setSelectedProjectId(data.id);
      toast({ title: "Project created" });
    },
  });

  const updateProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `${apiBase}/projects/${editingProject!.id}`, { name: projectName, color: projectColor });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      setProjectDialogOpen(false);
      toast({ title: "Project updated" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${apiBase}/projects/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/projects`] });
      setSelectedProjectId(null); setSelectedTaskId(null);
      toast({ title: "Project deleted" });
    },
  });

  const createTask = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", `${apiBase}/tasks`, {
        title,
        teamId: 0,
        projectId: selectedProjectId,
        status: "todo",
        priority: "medium",
        progress: 0,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      setSelectedTaskId(data.id);
      setAddingTask(false);
      if (isMobile) setMobileView("details");
    },
  });

  const updateTask = useMutation({
    mutationFn: async (data: Partial<Task> & { id: number }) => {
      const { id, ...body } = data;
      const res = await apiRequest("PATCH", `${apiBase}/tasks/${id}`, { ...body, changedBy: currentUser || "Someone" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      if (selectedTaskId) queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks/${selectedTaskId}/activity`] });
    },
  });

  const debouncedUpdateTask = useDebouncedMutate(updateTask.mutate);

  const deleteTask = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${apiBase}/tasks/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      setSelectedTaskId(null);
      if (isMobile) setMobileView("tasks");
      toast({ title: "Task deleted" });
    },
  });

  // Member mutations
  const createMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/members`, {
        name: memberName, role: memberRole, color: memberColor, type: memberType, email: memberEmail || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      setMemberDialogOpen(false);
      toast({ title: "Member added" });
    },
  });

  const updateMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `${apiBase}/members/${editingMember!.id}`, {
        name: memberName, role: memberRole, color: memberColor, type: memberType, email: memberEmail || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      setMemberDialogOpen(false);
      toast({ title: "Member updated" });
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${apiBase}/members/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      toast({ title: "Member removed" });
    },
  });

  // Comment
  const addComment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/tasks/${selectedTaskId}/activity`, {
        authorName: currentUser || "Anonymous",
        content: comment,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks/${selectedTaskId}/activity`] });
      setComment("");
    },
  });

  const handleCommentChange = (value: string) => {
    setComment(value);
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1 && lastAt === value.length - 1) {
      setShowMentions(true); setMentionFilter("");
    } else if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
        setShowMentions(true); setMentionFilter(afterAt);
      } else { setShowMentions(false); }
    } else { setShowMentions(false); }
  };

  const insertMention = (name: string) => {
    const lastAt = comment.lastIndexOf("@");
    setComment(comment.slice(0, lastAt) + `@${name} `);
    setShowMentions(false);
    commentRef.current?.focus();
  };

  const filteredMentionMembers = members.filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase()));

  // Project helpers
  const isProjectComplete = (p: Project) => {
    const pTasks = tasks.filter((t) => t.projectId === p.id);
    return pTasks.length > 0 && pTasks.every((t) => t.status === "done");
  };

  const openNewProject = () => {
    setEditingProject(null);
    setProjectName("");
    setProjectColor(PROJECT_COLORS[projects.length % PROJECT_COLORS.length]);
    setProjectDialogOpen(true);
  };

  const openEditProject = (p: Project) => {
    setEditingProject(p);
    setProjectName(p.name);
    setProjectColor(p.color);
    setProjectDialogOpen(true);
  };

  const openNewMember = () => {
    setEditingMember(null);
    setMemberName(""); setMemberRole(""); setMemberEmail("");
    setMemberColor(MEMBER_COLORS[members.length % MEMBER_COLORS.length]);
    setMemberType("person");
    setMemberDialogOpen(true);
  };

  const openEditMember = (m: Member) => {
    setEditingMember(m);
    setMemberName(m.name); setMemberRole(m.role); setMemberColor(m.color);
    setMemberEmail((m as any).email || ""); setMemberType((m as any).type || "person");
    setMemberDialogOpen(true);
  };

  // New task inline
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Mobile select helpers
  const selectProject = (id: number) => {
    setSelectedProjectId(id);
    setSelectedTaskId(null);
    if (isMobile) setMobileView("tasks");
  };

  const selectTask = (id: number) => {
    setSelectedTaskId(id);
    // Sync local fields immediately
    const task = tasks.find(t => t.id === id);
    if (task) { setEditTitle(task.title); setEditDescription(task.description || ""); }
    if (isMobile) setMobileView("details");
  };

  // ==== COLUMN COMPONENTS ====

  const ProjectsColumn = (
    <div className="flex flex-col h-full">
      <div className="h-10 flex items-center justify-center border-b shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-1">
          {sortedProjects.map((p) => {
            const complete = isProjectComplete(p);
            const selected = selectedProjectId === p.id;
            const pTasks = tasks.filter((t) => t.projectId === p.id);
            const doneTasks = pTasks.filter((t) => t.status === "done").length;
            return (
              <div
                key={p.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  selected ? "bg-accent" : "hover:bg-accent/50"
                } ${complete ? "opacity-50" : ""}`}
                onClick={() => selectProject(p.id)}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className={`text-sm flex-1 truncate ${complete ? "line-through" : ""}`}>{p.name}</span>
                {complete && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                {!complete && pTasks.length > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{doneTasks}/{pTasks.length}</span>
                )}
                <Button
                  size="icon" variant="ghost"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => { e.stopPropagation(); openEditProject(p); }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          {/* + Add Project at the bottom */}
          <button
            onClick={openNewProject}
            className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Project</span>
          </button>
        </div>
      </ScrollArea>
    </div>
  );

  const TasksColumn = (
    <div className="flex flex-col h-full">
      <div className="h-10 flex items-center justify-center border-b shrink-0 relative">
        {isMobile && (
          <Button size="icon" variant="ghost" className="h-6 w-6 absolute left-2" onClick={() => setMobileView("projects")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks</span>
      </div>
      <ScrollArea className="flex-1">
        {!selectedProject ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            Select a project
          </div>
        ) : (
          <div className="py-1">
            {projectTasks.map((t) => {
              const assignee = members.find((m) => m.id === t.assigneeId);
              const isDone = t.status === "done";
              const selected = selectedTaskId === t.id;
              const isOverdue = t.dueDate && !isDone && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate));
              return (
                <div
                  key={t.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    selected ? "bg-accent" : "hover:bg-accent/50"
                  } ${isDone ? "opacity-50" : ""}`}
                  onClick={() => selectTask(t.id)}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      t.priority === "high" ? "bg-red-500" : t.priority === "medium" ? "bg-amber-500" : "bg-emerald-500"
                    }`} />
                  )}
                  <span className={`text-sm flex-1 truncate ${isDone ? "line-through" : ""}`}>{t.title}</span>
                  {isOverdue && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                  {assignee && (
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarFallback className="text-[8px] font-semibold text-white" style={{ backgroundColor: assignee.color }}>
                        {getInitials(assignee.name)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
            {/* + Add Task at the bottom */}
            {addingTask ? (
              <div className="px-3 py-1.5">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (newTaskTitle.trim()) { createTask.mutate(newTaskTitle.trim()); setNewTaskTitle(""); }
                }}>
                  <Input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    className="text-sm h-8"
                    onBlur={() => { if (!newTaskTitle.trim()) setAddingTask(false); }}
                    onKeyDown={(e) => { if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); } }}
                  />
                </form>
              </div>
            ) : (
              <button
                onClick={() => setAddingTask(true)}
                className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Task</span>
              </button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const DetailsColumn = (
    <div className="flex flex-col h-full">
      <div className="h-10 flex items-center justify-center border-b shrink-0 relative">
        {isMobile && (
          <Button size="icon" variant="ghost" className="h-6 w-6 absolute left-2" onClick={() => setMobileView("tasks")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</span>
      </div>
      {!selectedTask ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {selectedProject ? "Select a task" : "Select a project"}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Title + delete */}
            <div className="flex items-start gap-2">
              <Input
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  debouncedUpdateTask({ id: selectedTask.id, title: e.target.value });
                }}
                className="text-base font-semibold border-none shadow-none px-0 h-auto focus-visible:ring-0 flex-1"
              />
              <Button
                size="icon" variant="ghost" className="shrink-0 text-destructive h-7 w-7"
                onClick={() => { if (confirm("Delete this task?")) deleteTask.mutate(selectedTask.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Progress slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs text-muted-foreground">Progress</Label>
                <span className="text-xs font-medium tabular-nums">{selectedTask.progress}%</span>
              </div>
              <Slider
                value={[selectedTask.progress]}
                onValueCommit={([v]) => {
                  if (v === 100) {
                    updateTask.mutate({ id: selectedTask.id, progress: 100, status: "done" });
                  } else {
                    updateTask.mutate({ id: selectedTask.id, progress: v, status: v > 0 ? "in_progress" : "todo" });
                  }
                }}
                max={100}
                step={5}
              />
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Assignee</Label>
                <Select
                  value={selectedTask.assigneeId ? String(selectedTask.assigneeId) : "none"}
                  onValueChange={(v) => updateTask.mutate({ id: selectedTask.id, assigneeId: v === "none" ? null : parseInt(v) })}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {(m as any).type === "agent" ? "🤖 " : ""}{m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select
                  value={selectedTask.priority}
                  onValueChange={(v) => updateTask.mutate({ id: selectedTask.id, priority: v })}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">🔴 High</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="low">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input
                  type="date"
                  className="mt-1 h-8 text-sm"
                  value={selectedTask.dueDate || ""}
                  onChange={(e) => updateTask.mutate({ id: selectedTask.id, dueDate: e.target.value || null })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={String(selectedTask.progress)}
                  onValueChange={(v) => {
                    const pct = parseInt(v);
                    const status = pct === 0 ? "todo" : pct === 100 ? "done" : "in_progress";
                    updateTask.mutate({ id: selectedTask.id, progress: pct, status });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% — Not Started</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                    <SelectItem value="75">75%</SelectItem>
                    <SelectItem value="90">90%</SelectItem>
                    <SelectItem value="100">100% — Done ✅</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                className="mt-1 resize-none text-sm"
                rows={3}
                value={editDescription}
                onChange={(e) => {
                  setEditDescription(e.target.value);
                  debouncedUpdateTask({ id: selectedTask.id, description: e.target.value || null });
                }}
                placeholder="Add details..."
              />
            </div>

            {/* Activity / Progress Notes */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-semibold">Activity</Label>
                {!addingNote && (
                  <button
                    onClick={() => setAddingNote(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Activity Note</span>
                  </button>
                )}
              </div>

              {/* Inline note input */}
              {addingNote && (
                <div className="relative mb-3">
                  <div className="flex gap-2">
                    <Input
                      ref={commentRef}
                      value={comment}
                      onChange={(e) => handleCommentChange(e.target.value)}
                      placeholder="Add a note... (@ to mention)"
                      className="flex-1 text-sm h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && comment.trim()) {
                          e.preventDefault();
                          addComment.mutate();
                          setAddingNote(false);
                        }
                        if (e.key === "Escape") { setAddingNote(false); setComment(""); }
                      }}
                    />
                    <Button
                      size="sm" variant="secondary" className="h-8 w-8 p-0"
                      onClick={() => { if (comment.trim()) { addComment.mutate(); setAddingNote(false); } }}
                      disabled={!comment.trim() || addComment.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {showMentions && filteredMentionMembers.length > 0 && (
                    <div className="absolute bottom-full mb-1 left-0 w-48 bg-popover border rounded-md shadow-md z-50 max-h-32 overflow-y-auto">
                      {filteredMentionMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          onClick={() => insertMention(m.name)}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Activity feed */}
              <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 480px)" }}>
                {activityLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No activity yet</p>
                ) : (
                  activityLogs.map((log: any) => (
                    <div key={log.id} className="flex gap-2 text-xs">
                      <span className="shrink-0 mt-0.5">
                        {log.type === "comment" ? <MessageSquare className="h-3 w-3 text-blue-500" /> : <RefreshCw className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="break-words">{log.content}</p>
                        <p className="text-muted-foreground mt-0.5">
                          {log.authorName} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full">
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-background">
        <button
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          onClick={() => setTeamDialogOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-label="TaskFlow logo">
            <rect width="28" height="28" rx="6" fill="currentColor" className="text-primary" />
            <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <circle cx="21" cy="18" r="2.5" fill="white" />
          </svg>
          <div className="text-left">
            <span className="text-sm font-semibold block leading-tight">TaskFlow</span>
            <span className="text-[10px] text-muted-foreground block leading-tight">{teamName || teamSlug}</span>
          </div>
          <Users className="h-3.5 w-3.5 text-muted-foreground ml-1" />
        </button>
        <div className="flex items-center gap-2">
          <UserSelector />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>

      {/* ===== LAYOUT ===== */}
      {isMobile ? (
        /* Mobile: show one panel at a time */
        <div className="flex-1 overflow-hidden">
          {mobileView === "projects" && ProjectsColumn}
          {mobileView === "tasks" && TasksColumn}
          {mobileView === "details" && DetailsColumn}
        </div>
      ) : (
        /* Desktop: resizable 3-column layout, full width */
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
              {ProjectsColumn}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              {TasksColumn}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={57} minSize={30}>
              {DetailsColumn}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {/* ===== PROJECT DIALOG ===== */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!projectName.trim()) return; editingProject ? updateProject.mutate() : createProject.mutate(); }} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" autoFocus />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1.5">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} type="button" className={`w-7 h-7 rounded-full transition-all ${projectColor === c ? "ring-2 ring-offset-2 ring-primary" : ""}`} style={{ backgroundColor: c }} onClick={() => setProjectColor(c)} />
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2">
              {editingProject && (
                <Button type="button" variant="destructive" size="sm" onClick={() => { deleteProject.mutate(editingProject.id); setProjectDialogOpen(false); }}>
                  <Trash2 className="h-4 w-4 mr-1" />Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!projectName.trim()}>
                {editingProject ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== TEAM MANAGEMENT DIALOG ===== */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team — {teamName || teamSlug}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{members.length} members</span>
              <Button size="sm" onClick={openNewMember}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Member
              </Button>
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: m.color }}>
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    {(m as any).type === "agent" && <Bot className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <span className="text-xs text-muted-foreground">{m.role}</span>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditMember(m)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Remove ${m.name}?`)) deleteMember.mutate(m.id); }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setTeamDialogOpen(false); navigate("/"); }}>
              <LogOut className="h-3 w-3 mr-1" />Switch Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MEMBER ADD/EDIT DIALOG ===== */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!memberName.trim()) return; editingMember ? updateMember.mutate() : createMember.mutate(); }} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Full name" autoFocus />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={memberRole} onChange={(e) => setMemberRole(e.target.value)} placeholder="e.g. Designer" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1.5">
                {MEMBER_COLORS.map((c) => (
                  <button key={c} type="button" className={`w-7 h-7 rounded-full transition-all ${memberColor === c ? "ring-2 ring-offset-2 ring-primary" : ""}`} style={{ backgroundColor: c }} onClick={() => setMemberColor(c)} />
                ))}
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={memberType} onValueChange={setMemberType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Person</SelectItem>
                  <SelectItem value="agent">Agent (AI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!memberName.trim()}>
                {editingMember ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
