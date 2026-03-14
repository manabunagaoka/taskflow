import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ExternalLink, ChevronDown, ChevronRight, Users } from "lucide-react";

interface TeamWithCounts {
  id: number;
  name: string;
  slug: string;
  createdBy: number | null;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  taskCount: number;
}

interface Member {
  id: number;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
}

function TeamMembers({ teamId, adminKey }: { teamId: number; adminKey: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  if (isLoading) return <p className="text-xs text-muted-foreground px-10 py-2">Loading...</p>;
  if (members.length === 0) return <p className="text-xs text-muted-foreground px-10 py-2">No members</p>;

  return (
    <div className="px-10 py-2 space-y-1">
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
          <div className="flex items-center gap-3">
            <span className="font-medium">{m.name}</span>
            <span className="text-muted-foreground">{m.role}</span>
            {m.email && <span className="text-muted-foreground">{m.email}</span>}
            {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Remove ${m.name}?`)) deleteMember.mutate(m.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { key } = useParams<{ key: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
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
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead className="text-center">Tasks</TableHead>
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
                        <TableCell className="text-center">{team.projectCount}</TableCell>
                        <TableCell className="text-center">{team.taskCount}</TableCell>
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
                          <TableCell colSpan={8} className="p-0 bg-muted/30">
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
