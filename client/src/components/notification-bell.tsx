import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const { apiBase } = useTeam();
  const { currentUser } = useCurrentUser();

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: [`${apiBase}/notifications/${currentUser}`],
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n: any) => n.read === "false").length;

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `${apiBase}/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/notifications/${currentUser}`] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${apiBase}/notifications/mark-all-read`, { recipientName: currentUser });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/notifications/${currentUser}`] });
    },
  });

  if (!currentUser) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => markAllRead.mutate()}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[300px]">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No notifications</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n: any) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-2.5 hover:bg-accent transition-colors ${
                    n.read === "false" ? "bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    if (n.read === "false") markRead.mutate(n.id);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {n.read === "false" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
