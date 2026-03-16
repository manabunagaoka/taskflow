import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, ArrowRight } from "lucide-react";

export default function Landing() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [founderName, setFounderName] = useState("");
  const [founderEmail, setFounderEmail] = useState("");
  const [passkey, setPasskey] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [joinPasskey, setJoinPasskey] = useState("");
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Validation
  const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-|-$/g, "").replace(/-{2,}/g, "-");
  const hasInvalidChars = slug !== slugClean && slug.length > 0;
  const tooShort = slug.length > 0 && slugClean.length < 2;

  function handleSlugChange(value: string) {
    // Auto-convert: lowercase, replace spaces with hyphens
    const cleaned = value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
    setSlug(cleaned);
  }

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}#/t/${createdSlug}`
    : "";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!slugClean || slugClean.length < 2 || !founderName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slugClean,
          slug: slugClean,
          passkey: passkey.trim() || undefined,
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
      setCreatedSlug(team.slug);
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
    const clean = joinSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    try {
      // First check if team exists and needs passkey
      const checkRes = await fetch(`/api/teams/${clean}`);
      if (!checkRes.ok) {
        toast({ title: "Team not found", description: `No team called "${clean}" exists.`, variant: "destructive" });
        return;
      }
      const teamInfo = await checkRes.json();
      if (teamInfo.hasPasskey && !needsPasskey) {
        setNeedsPasskey(true);
        return;
      }
      // If passkey required, verify it
      if (teamInfo.hasPasskey) {
        const joinRes = await fetch(`/api/teams/${clean}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passkey: joinPasskey }),
        });
        if (!joinRes.ok) {
          const data = await joinRes.json();
          toast({ title: "Access denied", description: data.error || "Incorrect passkey", variant: "destructive" });
          return;
        }
      }
      navigate(`/t/${clean}`);
    } catch {
      toast({ title: "Error", description: "Failed to look up team", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Post-creation: show share link ───
  if (createdSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <svg width="36" height="36" viewBox="0 0 28 28" fill="none" aria-label="TaskFlow logo">
                <rect width="28" height="28" rx="6" fill="currentColor" className="text-primary" />
                <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="21" cy="18" r="2.5" fill="white" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight">TaskFlow</span>
            </div>
            <h2 className="text-lg font-semibold">Team created!</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Share this link with your team</CardTitle>
              <CardDescription>Anyone with this link can access the workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={copyLink} title="Copy link">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={() => navigate(`/t/${createdSlug}`)}>
                Go to workspace
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Next: Add team members, create projects, and start assigning tasks.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main landing ───
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
            <CardDescription>Pick a short name for your team workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Input
                  placeholder="team-name"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  maxLength={30}
                  className="font-mono"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Lowercase letters, numbers, and hyphens only. This is your team ID.
                </p>
                {tooShort && (
                  <p className="text-[11px] text-destructive mt-0.5">Must be at least 2 characters</p>
                )}
              </div>
              <Input
                placeholder="Your name"
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
              <div>
                <Input
                  placeholder="Passkey (optional)"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  maxLength={50}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Set a passkey to require it when others join your team.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={creating || slugClean.length < 2}>
                {creating ? "Creating..." : "Create Team"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join an existing team</CardTitle>
            <CardDescription>Enter the team name shared with you</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="team-name"
                  value={joinSlug}
                  onChange={(e) => { setJoinSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setNeedsPasskey(false); }}
                  className="font-mono"
                  required
                />
                <Button type="submit" variant="outline" disabled={joining}>
                  {joining ? "..." : "Join"}
                </Button>
              </div>
              {needsPasskey && (
                <div>
                  <Input
                    placeholder="Enter passkey"
                    value={joinPasskey}
                    onChange={(e) => setJoinPasskey(e.target.value)}
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">This team requires a passkey to join.</p>
                </div>
              )}
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
