import type { Task, Member, Project } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, AlertTriangle } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  low: { label: "Low", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TaskCard({
  task,
  members,
  projects,
  onClick,
  isDragging,
}: {
  task: Task;
  members: Member[];
  projects: Project[];
  onClick: () => void;
  isDragging: boolean;
}) {
  const assignee = members.find((m) => m.id === task.assigneeId);
  const project = projects.find((p) => p.id === task.projectId);
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  const isOverdue = task.dueDate && task.status !== "done" && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
  const isDueToday = task.dueDate && isToday(parseISO(task.dueDate));

  return (
    <Card
      className={`p-3 cursor-pointer transition-all hover-elevate ${
        isDragging ? "shadow-lg ring-2 ring-primary/20 rotate-[2deg]" : ""
      }`}
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      {/* Top row: project + priority */}
      <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
        {project && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-medium"
            style={{ borderColor: project.color, color: project.color }}
          >
            {project.name}
          </Badge>
        )}
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priority.className}`}>
          {priority.label}
        </Badge>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium leading-snug mb-1 line-clamp-2">{task.title}</h4>

      {/* Description preview */}
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
      )}

      {/* Progress */}
      {task.progress > 0 && task.status !== "done" && (
        <div className="flex items-center gap-2 mb-2">
          <Progress value={task.progress} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{task.progress}%</span>
        </div>
      )}

      {/* Bottom row: assignee + due date */}
      <div className="flex items-center justify-between gap-2 mt-1">
        {assignee ? (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarFallback
                className="text-[9px] font-semibold text-white"
                style={{ backgroundColor: assignee.color }}
              >
                {getInitials(assignee.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-muted-foreground">{assignee.name.split(" ")[0]}</span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground italic">Unassigned</span>
        )}

        {task.dueDate && (
          <div className={`flex items-center gap-1 text-[11px] ${
            isOverdue ? "text-red-500" : isDueToday ? "text-amber-500" : "text-muted-foreground"
          }`}>
            {isOverdue && <AlertTriangle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            <span className="tabular-nums">{format(parseISO(task.dueDate), "MMM d")}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
