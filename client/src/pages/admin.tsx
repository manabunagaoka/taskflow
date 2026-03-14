import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ExternalLink } from "lucide-react";

interface TeamWithCounts {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  taskCount: number;
}

export default function Admin() {
  const { key } = useParams<{ key: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
                    <TableRow key={team.id}>
                      <TableCell className="font-mono text-xs">{team.id}</TableCell>
                      <TableCell className="font-medium">{team.name}</TableCell>
                      <TableCell className="text-muted-foreground">{team.slug}</TableCell>
                      <TableCell className="text-center">{team.memberCount}</TableCell>
                      <TableCell className="text-center">{team.projectCount}</TableCell>
                      <TableCell className="text-center">{team.taskCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(team.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
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
