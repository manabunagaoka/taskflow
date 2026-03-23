import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Task, Member, Project } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Send, MessageSquare, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  progress: z.number().min(0).max(100),
  assigneeId: z.string().optional(),
  assigneeIds: z.string().optional(),
  projectId: z.string().min(1, "Project is required"),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export function TaskDialog({
  open,
  onOpenChange,
  task,
  members,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  members: Member[];
  projects: Project[];
  defaultProjectId?: number;
}) {
  const { toast } = useToast();
  const { apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const isEditing = !!task;
  const [comment, setComment] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const commentRef = useRef<HTMLInputElement>(null);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      progress: 0,
      assigneeId: "",
      projectId: "",
      startDate: "",
      dueDate: "",
    },
  });

  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title,
        description: task.description || "",
        status: task.status,
        priority: task.priority,
        progress: task.progress,
        assigneeId: task.assigneeId ? String(task.assigneeId) : "",
        assigneeIds: (task as any).assigneeIds || "",
        projectId: task.projectId ? String(task.projectId) : "",
        startDate: task.startDate || "",
        dueDate: task.dueDate || "",
      });
      // Parse assigneeIds
      let ids: number[] = [];
      if ((task as any).assigneeIds) {
        try { ids = JSON.parse((task as any).assigneeIds); } catch { /* ignore */ }
      } else if (task.assigneeId) {
        ids = [task.assigneeId];
      }
      setSelectedAssigneeIds(ids);
    } else {
      form.reset({
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        progress: 0,
        assigneeId: "",
        assigneeIds: "",
        projectId: defaultProjectId ? String(defaultProjectId) : "",
        startDate: "",
        dueDate: "",
      });
      setSelectedAssigneeIds([]);
    }
    setComment("");
  }, [task, open]);

  // Activity log query
  const { data: activityLogs = [] } = useQuery<any[]>({
    queryKey: [`${apiBase}/tasks/${task?.id}/activity`],
    enabled: !!task,
  });

  const createTask = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      const body = {
        ...data,
        assigneeId: selectedAssigneeIds[0] || null,
        assigneeIds: selectedAssigneeIds.length > 0 ? JSON.stringify(selectedAssigneeIds) : null,
        projectId: parseInt(data.projectId),
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        description: data.description || null,
      };
      const res = await apiRequest("POST", `${apiBase}/tasks`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      onOpenChange(false);
      toast({ title: "Task created" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      const body = {
        ...data,
        assigneeId: selectedAssigneeIds[0] || null,
        assigneeIds: selectedAssigneeIds.length > 0 ? JSON.stringify(selectedAssigneeIds) : null,
        projectId: parseInt(data.projectId),
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        description: data.description || null,
        changedBy: currentUser || "Someone",
      };
      const res = await apiRequest("PATCH", `${apiBase}/tasks/${task!.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks/${task?.id}/activity`] });
      onOpenChange(false);
      toast({ title: "Task updated" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `${apiBase}/tasks/${task!.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks`] });
      onOpenChange(false);
      toast({ title: "Task deleted" });
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/tasks/${task!.id}/activity`, {
        authorName: currentUser || "Anonymous",
        content: comment,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/tasks/${task?.id}/activity`] });
      setComment("");
    },
  });

  const onSubmit = (data: TaskFormValues) => {
    if (isEditing) {
      updateTask.mutate(data);
    } else {
      createTask.mutate(data);
    }
  };

  const handleCommentChange = (value: string) => {
    setComment(value);
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1 && lastAt === value.length - 1) {
      setShowMentions(true);
      setMentionFilter("");
    } else if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
        setShowMentions(true);
        setMentionFilter(afterAt);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (memberName: string) => {
    const lastAt = comment.lastIndexOf("@");
    setComment(comment.slice(0, lastAt) + `@${memberName} `);
    setShowMentions(false);
    commentRef.current?.focus();
  };

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );



  const progress = form.watch("progress");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              {...form.register("title")}
              placeholder="Task title"
              data-testid="input-task-title"
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="relative">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.watch("description") || ""}
              onChange={(e) => form.setValue("description", e.target.value)}
              placeholder="Add details..."
              className="resize-none overflow-hidden"
              rows={2}
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
              onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}>
                <SelectTrigger data-testid="select-task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.watch("priority")} onValueChange={(v) => form.setValue("priority", v)}>
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Assignees</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-9 mt-1" data-testid="select-task-assignee">
                    {selectedAssigneeIds.length === 0
                      ? <span className="text-muted-foreground">Unassigned</span>
                      : selectedAssigneeIds.length === members.length && members.length > 0
                        ? "All Members"
                        : (() => {
                            const names = members.filter(m => selectedAssigneeIds.includes(m.id)).map(m => m.name);
                            return names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}`;
                          })()
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm font-medium">
                      <Checkbox
                        checked={selectedAssigneeIds.length === members.length && members.length > 0}
                        onCheckedChange={(checked) => setSelectedAssigneeIds(checked ? members.map(m => m.id) : [])}
                      />
                      All Members
                    </label>
                    <div className="border-t my-1" />
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedAssigneeIds.includes(m.id)}
                          onCheckedChange={(checked) => {
                            setSelectedAssigneeIds(prev =>
                              checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                            );
                          }}
                        />
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px] font-semibold text-white" style={{ backgroundColor: m.color }}>
                            {getInitials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        {(m as any).type === "agent" ? "🤖 " : ""}{m.name}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Project</Label>
              <Select value={form.watch("projectId")} onValueChange={(v) => form.setValue("projectId", v)}>
                <SelectTrigger data-testid="select-task-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                {...form.register("startDate")}
                data-testid="input-task-start-date"
              />
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                {...form.register("dueDate")}
                data-testid="input-task-due-date"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Progress</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{progress}%</span>
            </div>
            <Slider
              value={[progress]}
              onValueChange={([v]) => form.setValue("progress", v)}
              max={100}
              step={5}
              data-testid="slider-task-progress"
            />
          </div>

          {/* Activity section (only for editing) */}
          {isEditing && (
            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-semibold">Activity</Label>
              <ScrollArea className="h-[200px] rounded-md border p-3">
                {activityLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-3">
                    {activityLogs.map((log: any) => (
                      <div key={log.id} className="flex gap-2 text-xs">
                        <span className="shrink-0 mt-0.5">
                          {log.type === "comment" ? <MessageSquare className="h-3.5 w-3.5 text-blue-500" /> : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="break-words">{log.content}</p>
                          <p className="text-muted-foreground mt-0.5">
                            by {log.authorName} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Comment input */}
              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    ref={commentRef}
                    value={comment}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    placeholder={`Add a comment... (type @ to mention)`}
                    className="flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && comment.trim()) {
                        e.preventDefault();
                        addComment.mutate();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => comment.trim() && addComment.mutate()}
                    disabled={!comment.trim() || addComment.isPending}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* @mention dropdown */}
                {showMentions && filteredMembers.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 w-48 bg-popover border rounded-md shadow-md z-50 max-h-32 overflow-y-auto">
                    {filteredMembers.map((m) => (
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
            </div>
          )}

          <DialogFooter className="gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => deleteTask.mutate()}
                disabled={deleteTask.isPending}
                data-testid="button-delete-task"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTask.isPending || updateTask.isPending}
              data-testid="button-save-task"
            >
              {isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
