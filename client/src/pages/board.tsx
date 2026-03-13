import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, Member, Project } from "@shared/schema";
import { TaskCard } from "@/components/task-card";
import { TaskDialog } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
  { id: "todo", label: "To Do", color: "hsl(var(--muted-foreground))" },
  { id: "in_progress", label: "In Progress", color: "hsl(188, 35%, 47%)" },
  { id: "review", label: "Review", color: "hsl(42, 92%, 41%)" },
  { id: "done", label: "Done", color: "hsl(103, 56%, 31%)" },
];

export default function Board() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: members = [] } = useQuery<Member[]>({ queryKey: ["/api/members"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Task> & { id: string }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMember !== "all" && String(t.assigneeId) !== filterMember) return false;
      if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterMember, filterProject, filterPriority]);

  const columnTasks = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const col of COLUMNS) {
      grouped[col.id] = filteredTasks
        .filter((t) => t.status === col.id)
        .sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [filteredTasks]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const draggedId = parseInt(draggableId);

    const sourceCol = source.droppableId;
    const destCol = destination.droppableId;
    const task = tasks.find((t) => t.id === draggedId);
    if (!task) return;

    // Reorder within same column or move across columns
    const destTasks = [...(columnTasks[destCol] || [])];
    if (sourceCol === destCol) {
      destTasks.splice(source.index, 1);
    }
    destTasks.splice(destination.index, 0, task);

    // Update order for all tasks in destination
    destTasks.forEach((t, i) => {
      if (t.id === draggedId) {
        updateTask.mutate({ id: t.id, status: destCol, order: i, progress: destCol === "done" ? 100 : t.progress });
      } else if (t.order !== i) {
        updateTask.mutate({ id: t.id, order: i });
      }
    });

    // If moved across columns, reorder source too
    if (sourceCol !== destCol) {
      const srcTasks = (columnTasks[sourceCol] || []).filter((t) => t.id !== draggedId);
      srcTasks.forEach((t, i) => {
        if (t.order !== i) updateTask.mutate({ id: t.id, order: i });
      });
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleNewTask = (status?: string) => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const activeFilters = [filterMember, filterProject, filterPriority].filter((f) => f !== "all").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterMember} onValueChange={setFilterMember}>
            <SelectTrigger className="w-[150px] h-8 text-sm" data-testid="select-filter-member">
              <SelectValue placeholder="All Members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-filter-project">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[130px] h-8 text-sm" data-testid="select-filter-priority">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterMember("all"); setFilterProject("all"); setFilterPriority("all"); }}
              className="text-xs text-muted-foreground"
              data-testid="button-clear-filters"
            >
              Clear filters ({activeFilters})
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => handleNewTask()} data-testid="button-new-task">
          <Plus className="h-4 w-4 mr-1" />
          New Task
        </Button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {tasksLoading ? (
          <div className="flex gap-4 h-full">
            {COLUMNS.map((col) => (
              <div key={col.id} className="flex-1 min-w-[280px] max-w-[360px]">
                <Skeleton className="h-8 w-32 mb-3" />
                <div className="space-y-3">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-28 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full">
              {COLUMNS.map((col) => (
                <div key={col.id} className="flex-1 min-w-[280px] max-w-[360px] flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-semibold">{col.label}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {(columnTasks[col.id] || []).length}
                    </Badge>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 rounded-lg p-2 space-y-2 overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : "bg-muted/30"
                        }`}
                        data-testid={`column-${col.id}`}
                      >
                        {(columnTasks[col.id] || []).map((task, index) => (
                          <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                <TaskCard
                                  task={task}
                                  members={members}
                                  projects={projects}
                                  onClick={() => handleEditTask(task)}
                                  isDragging={snapshot.isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {(columnTasks[col.id] || []).length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <p className="text-xs">No tasks</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        members={members}
        projects={projects}
      />
    </div>
  );
}
