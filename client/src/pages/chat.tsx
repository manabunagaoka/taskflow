import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Member, Message } from "@shared/schema";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserSelector } from "@/components/user-selector";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Send, Trash2, Bot, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function ChatPage() {
  const { teamSlug, teamName, apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: "", description: "", confirmLabel: "", onConfirm: () => {} });

  // Data
  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });
  const { data: chatMessages = [] } = useQuery<Message[]>({
    queryKey: [`${apiBase}/messages`],
    refetchInterval: 3000,
  });

  // Chat mention notifications
  const { data: allNotifications = [] } = useQuery<any[]>({
    queryKey: [`${apiBase}/notifications/${currentUser}`],
    enabled: !!currentUser,
    refetchInterval: 10000,
  });
  const unreadChatMentions = allNotifications.filter(
    (n: any) => n.title === "You were mentioned in chat" && n.read === "false"
  );

  // Auto-mark mentions read on mount
  const markedRef = useRef(false);
  useEffect(() => {
    if (!markedRef.current && unreadChatMentions.length > 0) {
      markedRef.current = true;
      unreadChatMentions.forEach((n: any) => {
        apiRequest("PATCH", `${apiBase}/notifications/${n.id}/read`).then(() => {
          queryClient.invalidateQueries({ queryKey: [`${apiBase}/notifications/${currentUser}`] });
        });
      });
    }
  }, [unreadChatMentions.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  // Find Flower agent member (first agent-type member)
  const flowerAgent = members.find((m: any) => m.type === "agent");

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentUser) return;
    apiRequest("POST", `${apiBase}/messages`, {
      authorName: currentUser,
      content: message.trim(),
    }).then(() => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/messages`] });
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <header className="h-14 border-b flex items-center px-4 gap-3 shrink-0 bg-background">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold leading-tight">Team Chat</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {flowerAgent ? (
                    <span className="flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      {flowerAgent.name} is here
                    </span>
                  ) : (
                    <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <UserSelector />
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>

          {/* Chat body */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Agent banner (if Flower exists) */}
            {flowerAgent && (
              <div className="px-4 py-3 border-b bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {flowerAgent.name}
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">AI Agent</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your AI teammate. Mention <span className="font-mono text-foreground">@{flowerAgent.name}</span> to get help with tasks, questions, or ideas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Start a conversation with your team{flowerAgent ? ` or @${flowerAgent.name}` : ""}.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.authorName === currentUser;
                    const member = members.find(m => m.name === msg.authorName);
                    const isAgent = (member as any)?.type === "agent";
                    return (
                      <div key={msg.id} className={`group flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                          {isAgent ? (
                            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          ) : (
                            <AvatarFallback
                              className="text-[10px] font-semibold text-white"
                              style={{ backgroundColor: member?.color || "#888" }}
                            >
                              {getInitials(msg.authorName)}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className={`max-w-[70%] ${isMe ? "text-right" : ""}`}>
                          <div className={`flex items-center gap-2 mb-1 ${isMe ? "justify-end" : ""}`}>
                            <span className="text-xs font-medium">
                              {isAgent && <Bot className="h-3 w-3 inline mr-1" />}
                              {msg.authorName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                            {isMe && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  setConfirmDialog({
                                    open: true,
                                    title: "Delete message",
                                    description: "This message will be permanently deleted.",
                                    confirmLabel: "Delete",
                                    onConfirm: () => {
                                      apiRequest("DELETE", `${apiBase}/messages/${msg.id}`).then(() => {
                                        queryClient.invalidateQueries({ queryKey: [`${apiBase}/messages`] });
                                      });
                                    },
                                  });
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            )}
                          </div>
                          <div className={`text-sm rounded-2xl px-3 py-2 inline-block whitespace-pre-wrap ${
                            isAgent
                              ? "bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-200 dark:border-violet-800"
                              : isMe
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="border-t bg-background p-3 shrink-0">
              <div className="max-w-3xl mx-auto relative">
                {/* @mention autocomplete */}
                {message.includes("@") && (() => {
                  const lastAt = message.lastIndexOf("@");
                  const afterAt = message.slice(lastAt + 1);
                  if (afterAt.includes(" ") && afterAt.split(" ").length > 2) return null;
                  const filtered = members.filter(m => m.name.toLowerCase().includes(afterAt.toLowerCase()));
                  if (filtered.length === 0) return null;
                  return (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filtered.map(m => (
                        <button
                          key={m.id}
                          className="flex items-center gap-2.5 px-3 py-2 w-full text-left text-sm hover:bg-accent transition-colors"
                          onClick={() => {
                            const before = message.slice(0, lastAt);
                            setMessage(`${before}@${m.name} `);
                          }}
                        >
                          <Avatar className="h-5 w-5">
                            {(m as any).type === "agent" ? (
                              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                                <Bot className="h-3 w-3" />
                              </AvatarFallback>
                            ) : (
                              <AvatarFallback className="text-[7px] font-semibold text-white" style={{ backgroundColor: m.color }}>
                                {getInitials(m.name)}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <span>{(m as any).type === "agent" ? `🤖 ${m.name}` : m.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={currentUser
                      ? (flowerAgent ? `Message your team or @${flowerAgent.name}...` : "Message your team...")
                      : "Select a user first"
                    }
                    disabled={!currentUser}
                    className="flex-1"
                    autoFocus
                  />
                  <Button type="submit" size="icon" disabled={!message.trim() || !currentUser}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant="destructive"
        onConfirm={confirmDialog.onConfirm}
      />
    </SidebarProvider>
  );
}
