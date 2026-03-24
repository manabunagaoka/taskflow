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
  addMonths,
  addQuarters,
  addYears,
  differenceInDays,
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  endOfWeek,
  addWeeks,
  isAfter,
  isBefore,
  parseISO,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  eachYearOfInterval,
  eachDayOfInterval,
  eachWeekOfInterval,
  getDay,
} from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type ZoomLevel = "month" | "quarter" | "year";

const ZOOM_PIXELS: Record<ZoomLevel, number> = {
  month: 40,     // px per day — shows ~30 days
  quarter: 14,   // px per day — shows ~90 days
  year: 4,       // px per day — shows ~365 days
};

export default function Timeline() {
  const { teamSlug, teamName, apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  // viewAnchor = the start date of the current visible period
  const [viewAnchor, setViewAnchor] = useState(() => startOfMonth(new Date()));

  const PIXELS_PER_DAY = ZOOM_PIXELS[zoom];

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: [`${apiBase}/projects`],
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: [`${apiBase}/tasks`],
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: [`${apiBase}/members`],
  });

  // All tasks appear on timeline — tasks without dates default to today
  const datedTasks = useMemo(
    () => allTasks,
    [allTasks]
  );
  const undatedCount = allTasks.filter((t) => !t.startDate && !t.dueDate).length;

  const today = useMemo(() => startOfDay(new Date()), []);

  // Calculate date range from viewAnchor + zoom level
  const { minDate, maxDate, totalDays, periodLabel } = useMemo(() => {
    let min: Date, max: Date, label: string;
    if (zoom === "month") {
      min = startOfMonth(viewAnchor);
      max = endOfMonth(viewAnchor);
      label = format(min, "MMMM yyyy");
    } else if (zoom === "quarter") {
      min = startOfQuarter(viewAnchor);
      max = endOfQuarter(viewAnchor);
      const q = Math.ceil((min.getMonth() + 1) / 3);
      label = `Q${q} ${format(min, "yyyy")}`;
    } else {
      min = startOfYear(viewAnchor);
      max = endOfYear(viewAnchor);
      label = format(min, "yyyy");
    }
    return {
      minDate: min,
      maxDate: max,
      totalDays: differenceInDays(max, min) + 1,
      periodLabel: label,
    };
  }, [viewAnchor, zoom]);

  // Header labels — zoom-aware
  const headerLabels = useMemo(() => {
    if (zoom === "month") {
      return {
        primary: eachMonthOfInterval({ start: minDate, end: maxDate }).map((m) => ({
          label: format(m, "MMM yyyy"),
          offset: Math.max(0, differenceInDays(m, minDate)),
        })),
        secondary: eachDayOfInterval({ start: minDate, end: maxDate }).map((d) => ({
          label: format(d, "d"),
          offset: differenceInDays(d, minDate),
          width: PIXELS_PER_DAY,
          isBold: getDay(d) === 1,
          isToday: differenceInDays(d, today) === 0,
        })),
      };
    } else if (zoom === "quarter") {
      return {
        primary: eachQuarterOfInterval({ start: minDate, end: maxDate }).map((q) => ({
          label: `Q${Math.ceil((q.getMonth() + 1) / 3)} ${format(q, "yyyy")}`,
          offset: Math.max(0, differenceInDays(q, minDate)),
        })),
        secondary: eachMonthOfInterval({ start: minDate, end: maxDate }).map((m) => ({
          label: format(m, "MMM"),
          offset: differenceInDays(m, minDate),
          width: differenceInDays(addMonths(m, 1), m) * PIXELS_PER_DAY,
          isBold: m.getMonth() % 3 === 0,
          isToday: false,
        })),
      };
    } else {
      return {
        primary: eachYearOfInterval({ start: minDate, end: maxDate }).map((y) => ({
          label: format(y, "yyyy"),
          offset: Math.max(0, differenceInDays(y, minDate)),
        })),
        secondary: eachQuarterOfInterval({ start: minDate, end: maxDate }).map((q) => ({
          label: `Q${Math.ceil((q.getMonth() + 1) / 3)}`,
          offset: differenceInDays(q, minDate),
          width: differenceInDays(addMonths(q, 3), q) * PIXELS_PER_DAY,
          isBold: q.getMonth() === 0,
          isToday: false,
        })),
      };
    }
  }, [minDate, maxDate, today, zoom, PIXELS_PER_DAY]);

  // Gridlines — zoom-aware
  const gridLines = useMemo(() => {
    if (zoom === "month") {
      return eachDayOfInterval({ start: minDate, end: maxDate }).map((d) => ({
        offset: differenceInDays(d, minDate) * PIXELS_PER_DAY,
        isMajor: getDay(d) === 1,
      }));
    } else if (zoom === "quarter") {
      return eachWeekOfInterval({ start: minDate, end: maxDate }).map((w) => ({
        offset: differenceInDays(w, minDate) * PIXELS_PER_DAY,
        isMajor: w.getDate() <= 7,
      }));
    } else {
      return eachMonthOfInterval({ start: minDate, end: maxDate }).map((m) => ({
        offset: differenceInDays(m, minDate) * PIXELS_PER_DAY,
        isMajor: m.getMonth() % 3 === 0,
      }));
    }
  }, [minDate, maxDate, zoom, PIXELS_PER_DAY]);

  // Today position for auto-scroll (pixel-based)
  const todayPixelOffset = useMemo(
    () => differenceInDays(today, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2,
    [today, minDate, PIXELS_PER_DAY]
  );

  // Group tasks by project — each task gets its own row
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
      const d = parseISO(t.dueDate || t.startDate || today.toISOString());
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

  // Scroll to today on mount and view change — center today in viewport
  useEffect(() => {
    if (!isMobile && scrollRef.current) {
      const todayOffset = differenceInDays(today, minDate);
      if (todayOffset >= 0 && todayOffset <= totalDays) {
        const container = scrollRef.current;
        const scrollTarget = todayOffset * PIXELS_PER_DAY - container.clientWidth / 2;
        container.scrollLeft = Math.max(0, scrollTarget);
      } else {
        scrollRef.current.scrollLeft = 0;
      }
    }
  }, [todayPixelOffset, isMobile, projectRows.length, zoom, viewAnchor, minDate, totalDays, PIXELS_PER_DAY, today]);

  // Navigate: flip pages (limit past to 1 year from today)
  const scrollTimeline = (direction: 1 | -1) => {
    setViewAnchor((prev) => {
      const oneYearAgo = addYears(today, -1);
      let next: Date;
      if (zoom === "month") next = addMonths(prev, direction);
      else if (zoom === "quarter") next = addQuarters(prev, direction);
      else next = addYears(prev, direction);
      // Don't allow navigating more than 1 year into the past
      if (isBefore(next, oneYearAgo)) return prev;
      return next;
    });
  };

  // Jump back to today
  const goToToday = () => {
    setViewAnchor(startOfMonth(new Date()));
  };

  // Check if current period contains today
  const periodContainsToday = useMemo(() => {
    return !isBefore(today, minDate) && !isAfter(today, maxDate);
  }, [today, minDate, maxDate]);

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
                  : t.startDate
                    ? `From ${format(parseISO(t.startDate), "MMM d")}`
                    : "No dates set";
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
                {undatedCount} task{undatedCount !== 1 ? "s" : ""} have no dates set
              </p>
            )}
            {renderGroup("This Week", weekGroups.thisWeek)}
            {renderGroup("Next Week", weekGroups.nextWeek)}
            {renderGroup("Later", weekGroups.later)}
            {datedTasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No tasks to display
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
            {undatedCount} task{undatedCount !== 1 ? "s" : ""} have no dates set
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => scrollTimeline(-1)} title="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[100px] text-center">{periodLabel}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => scrollTimeline(1)} title="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!periodContainsToday && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={goToToday}>
              Today
            </Button>
          )}
          <div className="w-px h-5 bg-border mx-1" />
          {(["month", "quarter", "year"] as ZoomLevel[]).map((level) => (
            <Button
              key={level}
              size="sm"
              variant={zoom === level ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setZoom(level)}
            >
              {level === "month" ? "Month" : level === "quarter" ? "Quarter" : "Year"}
            </Button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <UserSelector />
          <NotificationBell />
        </div>
      </header>

      {datedTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No tasks to display
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Fixed project/task names column */}
          <div className="w-48 shrink-0 border-r bg-background z-10">
            {/* Header spacer: month row + day row */}
            <div className="h-6 border-b" />
            <div className="h-6 border-b" />
            {projectRows.map(({ project, tasks: projectTasks }) => (
              <div key={project.id}>
                {/* Project header row */}
                <div className="h-8 flex items-center gap-2 px-3 border-b bg-muted/30">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="text-xs font-semibold truncate uppercase tracking-wide text-muted-foreground">
                    {project.name}
                  </span>
                </div>
                {/* One row per task */}
                {projectTasks.map((task) => (
                  <div
                    key={task.id}
                    className="h-9 flex items-center px-3 pl-6 border-b cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => openTask(task)}
                  >
                    <span className="text-xs truncate">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Scrollable timeline area */}
          <div
            className="flex-1 overflow-x-auto overflow-y-auto"
            ref={scrollRef}
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
          >
            <div style={{ width: timelineWidth, minHeight: "100%" }} className="relative">
              {/* Primary header row (months / quarters / years) */}
              <div className="h-6 border-b sticky top-0 bg-background z-20 relative">
                {headerLabels.primary.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center px-2 text-[11px] font-medium text-muted-foreground border-l border-dashed"
                    style={{ left: m.offset * PIXELS_PER_DAY }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Secondary header row (days / months / quarters) */}
              <div className="h-6 border-b sticky top-6 bg-background z-20 relative">
                {headerLabels.secondary.map((d, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 h-full flex items-center justify-center text-[10px] ${
                      d.isToday
                        ? "font-bold text-amber-600"
                        : d.isBold
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                    style={{
                      left: d.offset * PIXELS_PER_DAY,
                      width: d.width,
                    }}
                  >
                    {d.label}
                  </div>
                ))}
              </div>

              {/* Vertical gridlines */}
              {gridLines.map((g, i) => (
                <div
                  key={`grid-${i}`}
                  className={`absolute w-px ${g.isMajor ? "bg-border" : "bg-border/40"}`}
                  style={{
                    left: g.offset,
                    top: 48,
                    bottom: 0,
                  }}
                />
              ))}

              {/* Today line — only when today is in the visible period */}
              {periodContainsToday && (
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
              )}

              {/* Project rows */}
              {projectRows.map(({ project, tasks: projectTasks }) => (
                <div key={project.id}>
                  {/* Project header row */}
                  <div className="h-8 border-b bg-muted/30" />
                  {/* Individual task rows */}
                  {projectTasks.map((task) => {
                    // Resolve start and end dates — every task is a bar
                    const isRecurring = task.recurring === "daily";
                    const taskStartDate = task.startDate
                      ? startOfDay(parseISO(task.startDate))
                      : task.dueDate
                        ? startOfDay(parseISO(task.dueDate))
                        : today;
                    const taskEndDate = isRecurring
                      ? maxDate
                      : task.dueDate
                        ? startOfDay(parseISO(task.dueDate))
                        : task.startDate
                          ? addDays(startOfDay(parseISO(task.startDate)), 1)
                          : addDays(today, 1);
                    const isDone = task.status === "done";
                    const isOverdue =
                      !isDone && !isRecurring && task.dueDate && isBefore(taskEndDate, today);
                    const isHighPriority = task.priority === "high";

                    // Skip tasks that don't overlap the visible period
                    const hasOverlap = !isBefore(taskEndDate, minDate) && !isAfter(taskStartDate, maxDate);
                    if (!hasOverlap) {
                      return (
                        <div key={task.id} className="h-9 border-b relative flex items-center" />
                      );
                    }

                    // Clamp bar to visible period boundaries
                    const rawStartOffset = differenceInDays(taskStartDate, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2;
                    const rawEndOffset = differenceInDays(taskEndDate, minDate) * PIXELS_PER_DAY + PIXELS_PER_DAY / 2;
                    const startOffset = Math.max(0, rawStartOffset);
                    const endOffset = Math.min(timelineWidth, rawEndOffset);
                    const barWidth = Math.max(endOffset - startOffset, PIXELS_PER_DAY / 2);
                    const barHeight = isHighPriority ? 10 : 7;

                    return (
                      <div key={task.id} className="h-9 border-b relative flex items-center">
                        <Tooltip>
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
                                borderStyle: isRecurring ? "dashed" : undefined,
                              }}
                              onClick={() => openTask(task)}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs">
                            <p className="font-medium">{task.title}{isRecurring ? " 🔁" : ""}</p>
                            <p className="text-muted-foreground">
                              {format(taskStartDate, "MMM d")} – {isRecurring ? "Ongoing" : format(taskEndDate, "MMM d, yyyy")} —{" "}
                              {getMemberName(task)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
