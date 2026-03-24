import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Task, Member, Project } from "@shared/schema";
import { TaskDialog } from "@/components/task-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { UserSelector } from "@/components/user-selector";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addDays,
  addMonths,
  differenceInDays,
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addWeeks,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  eachDayOfInterval,
  getDay,
} from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  X,
} from "lucide-react";
import { Link } from "wouter";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// Priority color helpers
const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export default function Timeline() {
  const { teamSlug, teamName, apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const isMobile = useIsMobile();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showOverdue, setShowOverdue] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(320);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: [`${apiBase}/projects`],
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: [`${apiBase}/tasks`],
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: [`${apiBase}/members`],
  });

  const today = useMemo(() => startOfDay(new Date()), []);

  // Build a map: dateKey -> tasks for that day
  const tasksByDay = useMemo(() => {
    const map = new Map<string, (Task & { project?: Project })[]>();
    for (const task of allTasks) {
      const proj = projects.find((p) => p.id === task.projectId);
      const taskWithProj = { ...task, project: proj };
      const isRecurring = task.recurring === "daily";
      const start = task.startDate
        ? startOfDay(parseISO(task.startDate))
        : task.dueDate
          ? startOfDay(parseISO(task.dueDate))
          : today;
      const end = isRecurring
        ? addDays(today, 90) // show recurring up to 90 days out
        : task.dueDate
          ? startOfDay(parseISO(task.dueDate))
          : start;

      // Add task to each day in its range
      const rangeStart = start;
      const rangeEnd = end;
      const days = Math.min(differenceInDays(rangeEnd, rangeStart) + 1, 365);
      for (let i = 0; i < days; i++) {
        const d = addDays(rangeStart, i);
        const key = format(d, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(taskWithProj);
      }
    }
    return map;
  }, [allTasks, projects, today]);

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.status === "done") return false;
        if (t.recurring === "daily") return false;
        if (!t.dueDate) return false;
        return isBefore(startOfDay(parseISO(t.dueDate)), today);
      })
      .map((t) => ({ ...t, project: projects.find((p) => p.id === t.projectId) }));
  }, [allTasks, projects, today]);

  // Recurring tasks
  const recurringTasks = useMemo(() => {
    return allTasks
      .filter((t) => t.recurring === "daily")
      .map((t) => ({ ...t, project: projects.find((p) => p.id === t.projectId) }));
  }, [allTasks, projects]);

  // Calendar grid: 6 weeks covering the view month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const navigateMonth = (direction: 1 | -1) => {
    setViewMonth((prev) => addMonths(prev, direction));
    setSelectedDay(null);
  };

  const goToToday = () => {
    setViewMonth(startOfMonth(new Date()));
    setSelectedDay(today);
  };

  // Month picker: year navigation
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const selectPickerMonth = (monthIndex: number) => {
    setViewMonth(new Date(pickerYear, monthIndex, 1));
    setMonthPickerOpen(false);
    setSelectedDay(null);
  };

  // Draggable divider handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: drawerWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const newWidth = Math.min(600, Math.max(200, dragRef.current.startWidth + delta));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [drawerWidth]);

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

  const getMemberInitials = (task: Task) => {
    const name = getMemberName(task);
    if (name === "Unassigned") return "?";
    return getInitials(name);
  };

  // Get tasks for the selected day
  const selectedDayTasks = useMemo(() => {
    if (showOverdue) return overdueTasks;
    if (!selectedDay) return [];
    const key = format(selectedDay, "yyyy-MM-dd");
    return tasksByDay.get(key) || [];
  }, [selectedDay, tasksByDay, showOverdue, overdueTasks]);

  const drawerTitle = showOverdue
    ? `${overdueTasks.length} Overdue`
    : selectedDay
      ? format(selectedDay, "EEEE, MMMM d")
      : "";

  // Heatmap intensity: 0 = empty, 1 = light, 2 = medium, 3 = heavy
  const getIntensity = (dayTasks: (Task & { project?: Project })[]) => {
    if (dayTasks.length === 0) return 0;
    const hasHigh = dayTasks.some((t) => t.priority === "high");
    if (hasHigh || dayTasks.length >= 4) return 3;
    if (dayTasks.length >= 2) return 2;
    return 1;
  };

  const isCurrentMonth = (d: Date) => d.getMonth() === viewMonth.getMonth();

  // ── Render ──
  const monthLabel = format(viewMonth, "MMMM yyyy");
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Task card component used in the detail drawer
  const TaskCard = ({ task }: { task: Task & { project?: Project } }) => {
    const isRecurring = task.recurring === "daily";
    const isOverdue =
      !isRecurring && task.status !== "done" && task.dueDate && isBefore(parseISO(task.dueDate), today);
    const isDone = task.status === "done";
    const priority = task.priority || "medium";

    return (
      <button
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
          isDone ? "opacity-50" : ""
        } hover:bg-accent`}
        onClick={() => openTask(task)}
      >
        {/* Project color bar */}
        <div
          className="w-1 h-10 rounded-full shrink-0"
          style={{ backgroundColor: task.project?.color || "#888" }}
        />
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium truncate ${
                isOverdue ? "text-red-500" : isDone ? "line-through text-muted-foreground" : ""
              }`}
            >
              {task.title}
            </span>
            {isRecurring && <span className="text-xs">🔁</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: PRIORITY_COLORS[priority] + "20",
                color: PRIORITY_COLORS[priority],
              }}
            >
              {PRIORITY_LABELS[priority] || "Med"}
            </span>
            {task.project && (
              <span className="text-[10px] text-muted-foreground truncate">
                {task.project.name}
              </span>
            )}
          </div>
        </div>
        {/* Assignee avatar */}
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback className="text-[9px] bg-muted">
            {getMemberInitials(task)}
          </AvatarFallback>
        </Avatar>
      </button>
    );
  };

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
        <span className="text-sm font-semibold">Calendar</span>
        {teamName && (
          <span className="text-xs text-muted-foreground">— {teamName}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
            <PopoverTrigger asChild>
              <button
                className="text-xs font-medium min-w-[120px] text-center hover:text-primary transition-colors"
              >
                {monthLabel}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="center">
              {/* Year nav */}
              <div className="flex items-center justify-between mb-3">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPickerYear((y) => y - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-sm font-semibold">{pickerYear}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPickerYear((y) => y + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              {/* Month grid */}
              <div className="grid grid-cols-3 gap-1">
                {monthNames.map((name, i) => {
                  const isActive = viewMonth.getFullYear() === pickerYear && viewMonth.getMonth() === i;
                  const isCurrent = today.getFullYear() === pickerYear && today.getMonth() === i;
                  return (
                    <button
                      key={name}
                      className={`
                        text-xs py-1.5 rounded-md transition-colors
                        ${isActive ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent"}
                        ${isCurrent && !isActive ? "font-semibold text-amber-600" : ""}
                      `}
                      onClick={() => selectPickerMonth(i)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              {/* Today shortcut */}
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => { goToToday(); setMonthPickerOpen(false); }}
              >
                Today
              </Button>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <UserSelector />
          <NotificationBell />
        </div>
      </header>

      <div className={`flex-1 flex ${isMobile ? "flex-col" : "flex-row"} overflow-hidden`}>
        {/* ── Calendar Heatmap Grid ── */}
        <div className={`${isMobile ? "shrink-0" : "flex-1"} flex flex-col p-3 ${isMobile ? "" : "p-6"}`}>
          {/* Day of week headers */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider py-1">
                {isMobile ? d[0] : d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 flex-1 gap-px bg-border/50 rounded-lg overflow-hidden">
            {calendarDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay.get(key) || [];
              const intensity = getIntensity(dayTasks);
              const isToday = isSameDay(day, today);
              const inMonth = isCurrentMonth(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const hasOverdue = dayTasks.some(
                (t) => t.status !== "done" && t.recurring !== "daily" && t.dueDate && isBefore(parseISO(t.dueDate), today)
              );
              const hasRecurring = dayTasks.some((t) => t.recurring === "daily");

              // Collect unique project colors (max 4)
              const projectColors = Array.from(new Set(dayTasks.map((t) => t.project?.color).filter((c): c is string => !!c))).slice(0, 4);

              return (
                <button
                  key={key}
                  className={`
                    relative flex flex-col items-center justify-start bg-background transition-all
                    ${isMobile ? "min-h-[48px] p-0.5" : "min-h-[72px] p-1.5"}
                    ${!inMonth ? "opacity-30" : ""}
                    ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                    ${isToday ? "bg-amber-50 dark:bg-amber-950/30" : ""}
                    hover:bg-accent/50
                  `}
                  onClick={() => {
                    setShowOverdue(false);
                    setSelectedDay(isSameDay(day, selectedDay!) ? null : day);
                  }}
                >
                  {/* Day number */}
                  <span
                    className={`
                      text-xs leading-none
                      ${isToday ? "font-bold text-amber-600 bg-amber-500/20 rounded-full w-5 h-5 flex items-center justify-center" : ""}
                      ${!isToday && inMonth ? "text-foreground" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Intensity bar */}
                  {intensity > 0 && !isMobile && (
                    <div
                      className="w-full mt-1 rounded-sm"
                      style={{
                        height: 3,
                        backgroundColor:
                          hasOverdue
                            ? "#ef4444"
                            : intensity === 3
                              ? projectColors[0] || "#6366f1"
                              : intensity === 2
                                ? (projectColors[0] || "#6366f1") + "99"
                                : (projectColors[0] || "#6366f1") + "44",
                      }}
                    />
                  )}

                  {/* Project dots */}
                  {projectColors.length > 0 && (
                    <div className={`flex gap-0.5 ${isMobile ? "mt-0.5" : "mt-1"}`}>
                      {projectColors.map((color, i) => (
                        <div
                          key={i}
                          className={`rounded-full ${isMobile ? "w-1 h-1" : "w-1.5 h-1.5"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      {dayTasks.length > 4 && (
                        <span className="text-[7px] text-muted-foreground leading-none">
                          +{dayTasks.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Recurring indicator (subtle stripe) */}
                  {hasRecurring && !isMobile && (
                    <div className="absolute bottom-0.5 right-0.5 text-[7px] text-muted-foreground">
                      🔁
                    </div>
                  )}

                  {/* Overdue glow */}
                  {hasOverdue && inMonth && (
                    <div className="absolute inset-0 rounded-sm ring-1 ring-inset ring-red-400/40 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Recurring tasks strip — below calendar on desktop */}
          {!isMobile && recurringTasks.length > 0 && (
            <div className="mt-4 border rounded-lg p-3">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recurring Tasks
              </h3>
              <div className="flex flex-wrap gap-2">
                {recurringTasks.map((t) => (
                  <button
                    key={t.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 hover:bg-accent transition-colors text-xs"
                    onClick={() => openTask(t)}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.project?.color || "#888" }}
                    />
                    <span className="font-medium">{t.title}</span>
                    <span className="text-muted-foreground">🔁</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Detail Drawer (right panel on desktop, bottom sheet on mobile) ── */}
        {(selectedDay || showOverdue) && (
          <div
            className={`
              border-t ${isMobile ? "" : "border-t-0"} bg-background
              ${isMobile ? "h-[45vh] shrink-0" : "shrink-0"}
              flex ${isMobile ? "flex-col" : "flex-row"}
            `}
            style={isMobile ? undefined : { width: drawerWidth }}
          >
            {/* Draggable divider (desktop only) */}
            {!isMobile && (
              <div
                className="w-1.5 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors border-l flex items-center justify-center group"
                onMouseDown={handleDragStart}
              >
                <div className="w-0.5 h-8 bg-border group-hover:bg-primary/40 rounded-full" />
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
            {/* Drawer header */}
            <div className="h-10 border-b flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-2">
                {showOverdue && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                <span className={`text-xs font-semibold ${showOverdue ? "text-red-500" : ""}`}>
                  {drawerTitle}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {selectedDayTasks.length}
                </Badge>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => { setSelectedDay(null); setShowOverdue(false); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Task list */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {selectedDayTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No tasks on this day
                  </p>
                ) : (
                  selectedDayTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))
                )}
              </div>
            </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* ── Overdue FAB ── */}
      {overdueTasks.length > 0 && !showOverdue && (
        <button
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-full shadow-lg transition-all animate-pulse hover:animate-none"
          onClick={() => { setShowOverdue(true); setSelectedDay(null); }}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">{overdueTasks.length} Overdue</span>
        </button>
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
