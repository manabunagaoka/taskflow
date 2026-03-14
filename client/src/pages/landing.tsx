import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [founderEmail, setFounderEmail] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim() || !founderName.trim()) return;
    setCreating(true);
    try {
      const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teamName.trim(),
          slug,
          founderName: founderName.trim(),
          founderEmail: founderEmail.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to create team", variant: "destructive" });
        return;
      }
      const team = await res.json();
      navigate(`/t/${team.slug}`);
    } catch {
      toast({ title: "Error", description: "Failed to create team", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinSlug.trim()) return;
    setJoining(true);
    const slug = joinSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "");
    try {
      const res = await fetch(`/api/teams/${slug}`);
      if (!res.ok) {
        toast({ title: "Team not found", description: `No team with slug "${slug}" exists.`, variant: "destructive" });
        return;
      }
      navigate(`/t/${slug}`);
    } catch {
      toast({ title: "Error", description: "Failed to look up team", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <svg width="36" height="36" viewBox="0 0 28 28" fill="none" aria-label="TaskFlow logo">
              <rect width="28" height="28" rx="6" fill="currentColor" className="text-primary" />
              <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="21" cy="18" r="2.5" fill="white" />
            </svg>
            <span className="text-2xl font-semibold tracking-tight">TaskFlow</span>
          </div>
          <p className="text-muted-foreground">Simple task management for teams</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create a new team</CardTitle>
            <CardDescription>Start a fresh workspace for your team</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input
                placeholder="Team name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
              />
              <Input
                placeholder="Your name (team lead)"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                required
              />
              <Input
                placeholder="Email (optional, for notifications)"
                type="email"
                value={founderEmail}
                onChange={(e) => setFounderEmail(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "..." : "Create Team"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join an existing team</CardTitle>
            <CardDescription>Enter your team's slug to access their workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="flex gap-2">
              <Input
                placeholder="team-slug"
                value={joinSlug}
                onChange={(e) => setJoinSlug(e.target.value)}
                required
              />
              <Button type="submit" variant="outline" disabled={joining}>
                {joining ? "..." : "Join"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center px-4">
          TaskFlow is free to use. Workspaces may be removed after 90 days of inactivity.
          No guarantees of uptime or data retention. We reserve the right to modify or
          discontinue the service at any time.
        </p>
      </div>
    </div>
  );
}
