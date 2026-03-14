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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { apiBase } = useTeam();

  const { data: members = [] } = useQuery<Member[]>({ queryKey: [`${apiBase}/members`] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: [`${apiBase}/tasks`] });

  const createMember = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/members`, { name, role, color });
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
      const res = await apiRequest("PATCH", `${apiBase}/members/${editingMember!.id}`, { name, role, color });
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
    setDialogOpen(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setName(m.name);
    setRole(m.role);
    setColor(m.color);
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
                      onClick={() => deleteMember.mutate(m.id)}
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim()} data-testid="button-save-member">
                {editingMember ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
