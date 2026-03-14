import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import type { Member, Task } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, LogOut, Mail, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const MEMBER_COLORS = ["#4F98A3", "#A84B2F", "#437A22", "#7A39BB", "#006494", "#964219", "#A12C7B", "#D19900"];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function Team() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState(false);
  const [memberType, setMemberType] = useState("person");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveMemberId, setLeaveMemberId] = useState<number | null>(null);
  const { apiBase } = useTeam();
  const [, navigate] = useLocation();

  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });

  const createMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/members`, {
        name, role, color,
        type: memberType,
        email: email || null,
        phone: phone || null,
        notifyEmail: notifyEmail ? "on" : "off",
        notifyPhone: notifyPhone ? "on" : "off",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      setDialogOpen(false);
      toast({ title: "Member added" });
    },
  });

  const updateMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `${apiBase}/members/${editingMember!.id}`, {
        name, role, color,
        type: memberType,
        email: email || null,
        phone: phone || null,
        notifyEmail: notifyEmail ? "on" : "off",
        notifyPhone: notifyPhone ? "on" : "off",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      setDialogOpen(false);
      toast({ title: "Member updated" });
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${apiBase}/members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/members`] });
      toast({ title: "Member removed" });
    },
  });

  const openNew = () => {
    setEditingMember(null);
    setName("");
    setRole("");
    setColor(MEMBER_COLORS[members.length % MEMBER_COLORS.length]);
    setEmail("");
    setPhone("");
    setNotifyEmail(false);
    setNotifyPhone(false);
    setMemberType("person");
    setDialogOpen(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setName(m.name);
    setRole(m.role);
    setColor(m.color);
    setEmail((m as any).email || "");
    setPhone((m as any).phone || "");
    setNotifyEmail((m as any).notifyEmail === "on");
    setNotifyPhone((m as any).notifyPhone === "on");
    setMemberType((m as any).type || "person");
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingMember) {
      updateMember.mutate();
    } else {
      createMember.mutate();
    }
  };

  const getMemberStats = (memberId: string) => {
    const memberTasks = tasks.filter((t) => t.assigneeId === memberId);
    const total = memberTasks.length;
    const done = memberTasks.filter((t) => t.status === "done").length;
    const inProgress = memberTasks.filter((t) => t.status === "in_progress").length;
    return { total, done, inProgress, completion: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">{members.length} members</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-member">
          <Plus className="h-4 w-4 mr-1" />
          Add Member
        </Button>
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium mb-1">No team members yet</p>
          <p className="text-xs mb-4">Add your first team member to start tracking tasks.</p>
          <Button size="sm" onClick={openNew}>Add Member</Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {members.map((m) => {
            const stats = getMemberStats(m.id);
            return (
              <Card key={m.id} className="p-4" data-testid={`member-card-${m.id}`}>
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm font-semibold text-white" style={{ backgroundColor: m.color }}>
                      {getInitials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{m.name}</h3>
                      {(m as any).type === "agent" && <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Badge variant="secondary" className="text-[10px]">{m.role}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Progress value={stats.completion} className="h-1.5 max-w-[120px]" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{stats.completion}%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {stats.done}/{stats.total} tasks done
                      </span>
                      {stats.inProgress > 0 && (
                        <span className="text-[10px] text-primary">
                          {stats.inProgress} active
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)} data-testid={`button-edit-member-${m.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setLeaveMemberId(m.id); setLeaveDialogOpen(true); }}
                      title="Leave team"
                    >
                      <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from the team?`)) deleteMember.mutate(m.id);
                      }}
                      data-testid={`button-delete-member-${m.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                data-testid="input-member-name"
              />
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <Input
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Product Manager"
                data-testid="input-member-role"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1.5">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={memberType} onValueChange={setMemberType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Person</SelectItem>
                  <SelectItem value="agent">Agent (AI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <Label htmlFor="member-phone">Phone</Label>
              <Input
                id="member-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-3 pt-1">
              <Label className="text-xs text-muted-foreground">Notification Preferences</Label>
              <div className="flex items-center justify-between">
                <Label htmlFor="notify-email" className="text-sm font-normal">Email notifications</Label>
                <Switch id="notify-email" checked={notifyEmail} onCheckedChange={setNotifyEmail} disabled={!email} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notify-phone" className="text-sm font-normal">SMS notifications</Label>
                <Switch id="notify-phone" checked={notifyPhone} onCheckedChange={setNotifyPhone} disabled={!phone} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim()} data-testid="button-save-member">
                {editingMember ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Leave Team Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave Team</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to leave this team? Your tasks will be unassigned.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (leaveMemberId) {
                  deleteMember.mutate(leaveMemberId);
                  setLeaveDialogOpen(false);
                  navigate("/");
                }
              }}
            >
              Leave Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
