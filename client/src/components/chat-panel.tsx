import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Member, Message } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Send, Trash2, Sparkles, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { apiBase } = useTeam();
  const { currentUser } = useCurrentUser();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: "", description: "", confirmLabel: "", onConfirm: () => {} });

  // Data
  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });
  const { data: chatMessages = [] } = useQuery<Message[]>({
    queryKey: [`${apiBase}/messages`],
    refetchInterval: open ? 3000 : false,
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

  // Auto-mark mentions read when panel opens
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current && unreadChatMentions.length > 0) {
      unreadChatMentions.forEach((n: any) => {
        apiRequest("PATCH", `${apiBase}/notifications/${n.id}/read`).then(() => {
          queryClient.invalidateQueries({ queryKey: [`${apiBase}/notifications/${currentUser}`] });
        });
      });
    }
    prevOpen.current = open;
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, open]);

  // Find Flower agent member
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
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[340px] max-w-[85vw] bg-background border-l shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">Team Chat</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Agent hint (compact) */}
        {flowerAgent && (
          <div className="px-3 py-2 border-b bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{flowerAgent.name}</span>
              <span className="ml-1 text-[10px] bg-muted px-1 py-0.5 rounded">AI</span>
              {" "}is in this chat. Mention <span className="font-mono text-foreground">@{flowerAgent.name}</span> to interact.
            </p>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-3 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium">No messages yet</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Start a conversation{flowerAgent ? ` or @${flowerAgent.name}` : ""}.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.authorName === currentUser;
                const member = members.find(m => m.name === msg.authorName);
                const isAgent = (member as any)?.type === "agent";
                return (
                  <div key={msg.id} className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      {isAgent ? (
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                          <Sparkles className="h-3 w-3" />
                        </AvatarFallback>
                      ) : (
                        <AvatarFallback
                          className="text-[8px] font-semibold text-white"
                          style={{ backgroundColor: member?.color || "#888" }}
                        >
                          {getInitials(msg.authorName)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className={`max-w-[80%] ${isMe ? "text-right" : ""}`}>
                      <div className={`flex items-center gap-1.5 mb-0.5 ${isMe ? "justify-end" : ""}`}>
                        <span className="text-[10px] font-medium">
                          {msg.authorName}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
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
                            <Trash2 className="h-2.5 w-2.5 text-destructive" />
                          </button>
                        )}
                      </div>
                      <div className={`text-sm rounded-lg px-2.5 py-1.5 inline-block whitespace-pre-wrap ${
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
        <div className="p-2 border-t shrink-0 relative">
          {/* @mention autocomplete */}
          {message.includes("@") && (() => {
            const lastAt = message.lastIndexOf("@");
            const afterAt = message.slice(lastAt + 1);
            if (afterAt.includes(" ") && afterAt.split(" ").length > 2) return null;
            const filtered = members.filter(m => m.name.toLowerCase().includes(afterAt.toLowerCase()));
            if (filtered.length === 0) return null;
            return (
              <div className="absolute bottom-full left-2 right-2 mb-1 bg-popover border rounded-md shadow-lg max-h-32 overflow-y-auto">
                {filtered.map(m => (
                  <button
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => {
                      const before = message.slice(0, lastAt);
                      setMessage(`${before}@${m.name} `);
                    }}
                  >
                    <Avatar className="h-4 w-4">
                      {(m as any).type === "agent" ? (
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                          <Sparkles className="h-2.5 w-2.5" />
                        </AvatarFallback>
                      ) : (
                        <AvatarFallback className="text-[6px] font-semibold text-white" style={{ backgroundColor: m.color }}>
                          {getInitials(m.name)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            );
          })()}
          <form onSubmit={sendMessage} className="flex gap-1.5">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={currentUser
                ? (flowerAgent ? `@${flowerAgent.name} or team...` : "Message team...")
                : "Select a user first"
              }
              disabled={!currentUser}
              className="text-sm h-8 flex-1"
              autoFocus={open}
            />
            <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!message.trim() || !currentUser}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant="destructive"
        onConfirm={confirmDialog.onConfirm}
      />
    </>
  );
}
