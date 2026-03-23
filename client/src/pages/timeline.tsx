import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Task, Member, Project } from "@shared/schema";
import { TaskDialog } from "@/components/task-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { UserSelector } from "@/components/user-selector";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addDays,
  differenceInDays,
  format,
  startOfDay,
  startOfWeek,
  endOfWeek,
  addWeeks,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  eachMonthOfInterval,
  eachDayOfInterval,
  getDay,
} from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
} from "lucide-react";
import { Link } from "wouter";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const PIXELS_PER_DAY = 40;

export default function Timeline() {
  const { teamSlug, teamName, apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: [`${apiBase}/projects`],
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: [`${apiBase}/tasks`],
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: [`${apiBase}/members`],
  });

  // Only tasks with at least one date appear on timeline
  const datedTasks = useMemo(
    () => allTasks.filter((t) => t.startDate || t.dueDate),
    [allTasks]
  );
  const undatedCount = allTasks.length - datedTasks.length;

  const today = useMemo(() => startOfDay(new Date()), []);

  // Calculate date range with 2-week padding
  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (datedTasks.length === 0) {
      const min = addDays(today, -14);
      const max = addDays(today, 14);
      return { minDate: min, maxDate: max, totalDays: 28 };
    }
    const dates = datedTasks.flatMap((t) => {
      const d: Date[] = [];
      if (t.startDate) d.push(startOfDay(parseISO(t.startDate)));
      if (t.dueDate) d.push(startOfDay(parseISO(t.dueDate)));
      return d;
    });
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    const latest = dates.reduce((a, b) => (a > b ? a : b));
    const min = addDays(earliest < today ? earliest : today, -14);
    const max = addDays(latest > today ? latest : today, 14);
    return {
      minDate: min,
      maxDate: max,
      totalDays: differenceInDays(max, min),
    };
  }, [datedTasks, today]);

  // Month labels for header
  const months = useMemo(
    () =>
      eachMonthOfInterval({ start: minDate, end: maxDate }).map((m) => ({
        date: m,
        label: format(m, "MMM yyyy"),
        offset: Math.max(0, differenceInDays(m, minDate)),
      })),
    [minDate, maxDate]
  );

  // Daily date ticks
  const days = useMemo(
    () =>
      eachDayOfInterval({ start: minDate, end: maxDate }).map((d) => ({
        date: d,
        dayNum: format(d, "d"),
        offset: differenceInDays(d, minDate),
        isMonday: getDay(d) === 1,
        isToday: differenceInDays(d, today) === 0,
      })),
    [minDate, maxDate, today]
  );

  // Today position for auto-scroll (pixel-based)
  const todayPixelOffset = useMemo(
    () => differenceInDays(today, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2,
    [today, minDate]
  );

  // Group tasks by project
  const projectRows = useMemo(() => {
    return projects
      .filter((p) => datedTasks.some((t) => t.projectId === p.id))
      .map((p) => ({
        project: p,
        tasks: datedTasks.filter((t) => t.projectId === p.id),
      }));
  }, [projects, datedTasks]);

  // Mobile: group by week
  const weekGroups = useMemo(() => {
    if (!isMobile) return { thisWeek: [], nextWeek: [], later: [] };
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });

    const thisWeek: (Task & { project?: Project })[] = [];
    const nextWeek: (Task & { project?: Project })[] = [];
    const later: (Task & { project?: Project })[] = [];

    for (const t of datedTasks) {
      const d = parseISO(t.dueDate || t.startDate!);
      const proj = projects.find((p) => p.id === t.projectId);
      const taskWithProj = { ...t, project: proj };
      if (isBefore(d, weekStart) || (!isAfter(d, weekEnd) && !isBefore(d, weekStart))) {
        thisWeek.push(taskWithProj);
      } else if (!isAfter(d, nextWeekEnd)) {
        nextWeek.push(taskWithProj);
      } else {
        later.push(taskWithProj);
      }
    }
    return { thisWeek, nextWeek, later };
  }, [datedTasks, projects, today, isMobile]);

  // Scroll to today on mount
  useEffect(() => {
    if (!isMobile && scrollRef.current) {
      const container = scrollRef.current;
      const scrollTarget = todayPixelOffset - container.clientWidth / 2;
      container.scrollLeft = Math.max(0, scrollTarget);
    }
  }, [todayPixelOffset, isMobile, projectRows.length]);

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setDialogOpen(true);
  };

  const getMemberName = (task: Task) => {
    if (task.assigneeIds) {
      try {
        const ids = JSON.parse(task.assigneeIds) as number[];
        const names = ids
          .map((id) => members.find((m) => m.id === id)?.name)
          .filter(Boolean);
        if (names.length > 0) return names.join(", ");
      } catch {}
    }
    if (task.assigneeId) {
      return members.find((m) => m.id === task.assigneeId)?.name || "";
    }
    return "Unassigned";
  };

  // ── Mobile vertical list ──
  if (isMobile) {
    const renderGroup = (
      label: string,
      tasks: (Task & { project?: Project })[]
    ) => {
      if (tasks.length === 0) return null;
      return (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            {label}
          </h3>
          <div className="space-y-1">
            {tasks.map((t) => {
              const isOverdue =
                t.status !== "done" && t.dueDate && isBefore(parseISO(t.dueDate), today);
              const dateLabel = t.startDate && t.dueDate
                ? `${format(parseISO(t.startDate), "MMM d")} – ${format(parseISO(t.dueDate), "MMM d")}`
                : t.dueDate
                  ? `Due ${format(parseISO(t.dueDate), "MMM d")}`
                  : `From ${format(parseISO(t.startDate!), "MMM d")}`;
              return (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-accent transition-colors text-left"
                  onClick={() => openTask(t)}
                >
                  <div
                    className="w-1 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: t.project?.color || "#888" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isOverdue ? "text-red-500" : ""
                      }`}
                    >
                      {t.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {dateLabel} —{" "}
                      {getMemberName(t)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="h-12 border-b flex items-center px-4 gap-2 shrink-0">
          <Link href={`/t/${teamSlug}`}>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Timeline</span>
          <div className="ml-auto flex items-center gap-2">
            <UserSelector />
            <NotificationBell />
          </div>
        </header>
        <ScrollArea className="flex-1">
          <div className="py-2">
            {undatedCount > 0 && (
              <p className="text-xs text-muted-foreground px-4 py-2">
                {undatedCount} task{undatedCount !== 1 ? "s" : ""} have no due
                date
              </p>
            )}
            {renderGroup("This Week", weekGroups.thisWeek)}
            {renderGroup("Next Week", weekGroups.nextWeek)}
            {renderGroup("Later", weekGroups.later)}
            {datedTasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No tasks with due dates
              </p>
            )}
          </div>
        </ScrollArea>
        <TaskDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          task={selectedTask}
          members={members}
          projects={projects}
        />
      </div>
    );
  }

  // ── Desktop horizontal timeline ──
  const timelineWidth = totalDays * PIXELS_PER_DAY;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-12 border-b flex items-center px-4 gap-2 shrink-0">
        <Link href={`/t/${teamSlug}`}>
          <Button size="icon" variant="ghost" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Timeline</span>
        {teamName && (
          <span className="text-xs text-muted-foreground">— {teamName}</span>
        )}
        {undatedCount > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            {undatedCount} task{undatedCount !== 1 ? "s" : ""} have no due date
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <UserSelector />
          <NotificationBell />
        </div>
      </header>

      {datedTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No tasks with due dates to display
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Fixed project names column */}
          <div className="w-48 shrink-0 border-r bg-background z-10">
            {/* Header spacer: month row + day row */}
            <div className="h-6 border-b" />
            <div className="h-6 border-b" />
            {projectRows.map(({ project }) => (
              <div
                key={project.id}
                className="h-12 flex items-center gap-2 px-3 border-b"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="text-sm font-medium truncate">
                  {project.name}
                </span>
              </div>
            ))}
          </div>

          {/* Scrollable timeline area */}
          <div
            className="flex-1 overflow-x-auto overflow-y-auto"
            ref={scrollRef}
          >
            <div style={{ width: timelineWidth, minHeight: "100%" }} className="relative">
              {/* Month labels row */}
              <div className="h-6 border-b sticky top-0 bg-background z-20 relative">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center px-2 text-[11px] font-medium text-muted-foreground border-l border-dashed"
                    style={{
                      left: m.offset * PIXELS_PER_DAY,
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Daily date labels row */}
              <div className="h-6 border-b sticky top-6 bg-background z-20 relative">
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 h-full flex items-center justify-center text-[10px] ${
                      d.isToday
                        ? "font-bold text-amber-600"
                        : d.isMonday
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                    style={{
                      left: d.offset * PIXELS_PER_DAY,
                      width: PIXELS_PER_DAY,
                    }}
                  >
                    {d.dayNum}
                  </div>
                ))}
              </div>

              {/* Vertical day gridlines through data area */}
              {days.map((d, i) => (
                <div
                  key={`grid-${i}`}
                  className={`absolute w-px ${
                    d.isMonday ? "bg-border" : "bg-border/40"
                  }`}
                  style={{
                    left: d.offset * PIXELS_PER_DAY,
                    top: 48, // below both header rows (6+6 = 12 tailwind units = 48px)
                    bottom: 0,
                  }}
                />
              ))}

              {/* Today line — centered in today's column */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
                style={{
                  left: differenceInDays(today, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2,
                }}
              >
                <div className="absolute -top-0 -left-2 px-1 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-b">
                  Today
                </div>
              </div>

              {/* Project rows */}
              {projectRows.map(({ project, tasks: projectTasks }) => (
                <div
                  key={project.id}
                  className="h-12 border-b relative flex items-center"
                >
              {projectTasks.map((task) => {
                    const hasStart = !!task.startDate;
                    const hasDue = !!task.dueDate;
                    const taskEndDate = hasDue ? startOfDay(parseISO(task.dueDate!)) : null;
                    const taskStartDate = hasStart ? startOfDay(parseISO(task.startDate!)) : taskEndDate!;
                    const isDone = task.status === "done";
                    const isOverdue =
                      !isDone && hasDue && isBefore(taskEndDate!, today);
                    const isHighPriority = task.priority === "high";

                    // Bar mode: both start and due dates
                    if (hasStart && hasDue) {
                      const startOffset = differenceInDays(taskStartDate, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2;
                      const endOffset = differenceInDays(taskEndDate!, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2;
                      const barWidth = Math.max(endOffset - startOffset, 6);
                      const barHeight = isHighPriority ? 10 : 7;

                      return (
                        <Tooltip key={task.id}>
                          <TooltipTrigger asChild>
                            <button
                              className="absolute rounded-full transition-transform hover:scale-y-150 focus:outline-none focus:ring-2 focus:ring-ring"
                              style={{
                                left: startOffset,
                                width: barWidth,
                                height: barHeight,
                                top: `calc(50% - ${barHeight / 2}px)`,
                                backgroundColor: isOverdue
                                  ? "transparent"
                                  : isDone
                                  ? `${project.color}66`
                                  : project.color,
                                border: isOverdue
                                  ? `2px solid #ef4444`
                                  : isDone
                                  ? `1px solid ${project.color}`
                                  : "none",
                              }}
                              onClick={() => openTask(task)}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs">
                            <p className="font-medium">{task.title}</p>
                            <p className="text-muted-foreground">
                              {format(taskStartDate, "MMM d")} – {format(taskEndDate!, "MMM d, yyyy")} —{" "}
                              {getMemberName(task)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    // Dot mode: only one date
                    const taskDate = taskEndDate || taskStartDate;
                    const dayOffset = differenceInDays(taskDate, minDate);
                    const offset = dayOffset * PIXELS_PER_DAY + PIXELS_PER_DAY / 2;
                    const size = isHighPriority ? 14 : 10;

                    return (
                      <Tooltip key={task.id}>
                        <TooltipTrigger asChild>
                          <button
                            className="absolute rounded-full transition-transform hover:scale-150 focus:outline-none focus:ring-2 focus:ring-ring"
                            style={{
                              left: offset - size / 2,
                              width: size,
                              height: size,
                              top: `calc(50% - ${size / 2}px)`,
                              backgroundColor: isOverdue
                                ? "transparent"
                                : isDone
                                ? `${project.color}66`
                                : project.color,
                              border: isOverdue
                                ? `2px solid #ef4444`
                                : isDone
                                ? `1px solid ${project.color}`
                                : "none",
                            }}
                            onClick={() => openTask(task)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                          <p className="font-medium">{task.title}</p>
                          <p className="text-muted-foreground">
                            {format(taskDate, "MMM d, yyyy")} —{" "}
                            {getMemberName(task)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={selectedTask}
        members={members}
        projects={projects}
      />
    </div>
  );
}
