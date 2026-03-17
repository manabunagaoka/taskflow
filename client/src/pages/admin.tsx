import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ExternalLink, ChevronDown, ChevronRight, Plus, Pencil, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface TeamWithCounts {
  id: number;
  name: string;
  slug: string;
  createdBy: number | null;
  createdAt: string;
  memberCount: number;
}

interface Member {
  id: number;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  color: string;
  type: string;
}

const COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];

function MemberDialog({ open, onOpenChange, title, initial, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: { name: string; role: string; email: string | null; phone: string | null; type: string };
  onSubmit: (data: { name: string; role: string; email: string; phone: string; type: string; color: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Member");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("person");

  const handleOpenChange = (o: boolean) => {
    if (o && initial) {
      setName(initial.name); setRole(initial.role);
      setEmail(initial.email || ""); setPhone(initial.phone || "");
      setType(initial.type);
    } else if (o) {
      setName(""); setRole("Member"); setEmail(""); setPhone(""); setType("person");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSubmit({ name: name.trim(), role, email, phone, type, color: "" }); }} className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Member name" required autoFocus /></div>
          <div><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="person">Person</SelectItem><SelectItem value="agent">Agent</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamMembers({ teamId, adminKey }: { teamId: number; adminKey: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["admin", "members", teamId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/teams/${teamId}/members`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/teams/${teamId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "members", teamId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      toast({ title: "Member removed" });
    },
  });

  const updateMember = useMutation({
    mutationFn: async (data: { id: number; name: string; role: string; email: string; phone: string; type: string }) => {
      const res = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/teams/${teamId}/members/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, role: data.role, email: data.email || null, phone: data.phone || null, type: data.type }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "members", teamId] });
      setEditMember(null);
      toast({ title: "Member updated" });
    },
  });

  const addMember = useMutation({
    mutationFn: async (data: { name: string; role: string; email: string; phone: string; color: string; type: string }) => {
      const res = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, email: data.email || null, phone: data.phone || null }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "members", teamId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      setAddOpen(false);
      toast({ title: "Member added" });
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground px-10 py-2">Loading...</p>;

  return (
    <div className="px-10 py-2 space-y-1">
      {members.length === 0 && <p className="text-xs text-muted-foreground py-1">No members</p>}
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
            <span className="font-medium">{m.name}</span>
            <span className="text-muted-foreground">{m.role}</span>
            {m.type === "agent" && <Badge variant="outline" className="text-[10px] py-0">Agent</Badge>}
            {m.email && <span className="text-muted-foreground">{m.email}</span>}
            {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditMember(m)}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Remove ${m.name}?`)) deleteMember.mutate(m.id); }}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </div>
      ))}
      <div className="pt-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddOpen(true)}><Plus className="h-3 w-3 mr-1" />Add Member</Button>
      </div>
      <MemberDialog open={!!editMember} onOpenChange={(o) => { if (!o) setEditMember(null); }} title="Edit Member" initial={editMember || undefined} onSubmit={(data) => editMember && updateMember.mutate({ ...data, id: editMember.id })} isPending={updateMember.isPending} />
      <MemberDialog open={addOpen} onOpenChange={setAddOpen} title="Add Member" onSubmit={(data) => addMember.mutate({ ...data, color: COLORS[Math.floor(Math.random() * COLORS.length)] })} isPending={addMember.isPending} />
    </div>
  );
}

export default function Admin() {
  const { key } = useParams<{ key: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const { data: teams, isLoading, error } = useQuery<TeamWithCounts[]>({
    queryKey: ["admin", "teams", key],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${encodeURIComponent(key!)}/teams`);
      if (res.status === 403) throw new Error("Forbidden");
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await fetch(`/api/admin/${encodeURIComponent(key!)}/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      toast({ title: "Team deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete team", variant: "destructive" });
    },
  });

  if (error?.message === "Forbidden") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-3 border-b">
        <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            Home
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Teams</span>
              {teams && <Badge variant="secondary">{teams.length} teams</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : teams && teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teams yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-center">Members</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams?.map((team) => (
                    <>
                      <TableRow key={team.id} className="cursor-pointer" onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {expandedTeam === team.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {team.id}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell className="text-muted-foreground">{team.slug}</TableCell>
                        <TableCell className="text-center">{team.memberCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(team.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => navigate(`/t/${team.slug}`)}
                              title="Open team"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete team "${team.name}" and all its data? This cannot be undone.`)) {
                                  deleteMutation.mutate(team.id);
                                }
                              }}
                              title="Delete team"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedTeam === team.id && (
                        <TableRow key={`${team.id}-members`}>
                          <TableCell colSpan={6} className="p-0 bg-muted/30">
                            <TeamMembers teamId={team.id} adminKey={key!} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
