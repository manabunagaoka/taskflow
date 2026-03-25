import { Switch, Route, Router, useParams, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { TeamProvider } from "@/lib/team-context";
import { UserProvider } from "@/context/user-context";
import NotFound from "@/pages/not-found";
import Workspace from "@/pages/workspace";
import Landing from "@/pages/landing";
import Admin from "@/pages/admin";
import Timeline from "@/pages/timeline";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

function TeamLayout() {
  return (
    <TeamProvider>
      <UserProvider>
        <Workspace />
      </UserProvider>
    </TeamProvider>
  );
}

function TeamTimeline() {
  return (
    <TeamProvider>
      <UserProvider>
        <Timeline />
      </UserProvider>
    </TeamProvider>
  );
}



function JoinByToken() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "passkey" | "error">("loading");
  const [teamInfo, setTeamInfo] = useState<{ slug: string; name: string; hasPasskey: boolean } | null>(null);
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.token) return;
    fetch(`/api/join/${params.token}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setTeamInfo(data);
        if (data.hasPasskey) {
          setStatus("passkey");
        } else {
          navigate(`/t/${data.slug}`);
        }
      })
      .catch(() => setStatus("error"));
  }, [params.token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Joining team...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid Invite Link</CardTitle>
            <CardDescription>This invite link is no longer valid or has been regenerated.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/")}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join {teamInfo?.name || "Team"}</CardTitle>
          <CardDescription>This team requires a passkey to join</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!teamInfo) return;
            const res = await fetch(`/api/teams/${teamInfo.slug}/join`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passkey }),
            });
            if (res.ok) {
              navigate(`/t/${teamInfo.slug}`);
            } else {
              setError("Incorrect passkey");
            }
          }} className="space-y-3">
            <Input
              type="password"
              placeholder="Enter passkey"
              value={passkey}
              onChange={(e) => { setPasskey(e.target.value); setError(""); }}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Join <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <Switch>
              <Route path="/" component={Landing} />
              <Route path="/join/:token" component={JoinByToken} />
              <Route path="/admin/:key" component={Admin} />
              <Route path="/t/:teamSlug/timeline" component={TeamTimeline} />

              <Route path="/t/:teamSlug/*" component={TeamLayout} />
              <Route path="/t/:teamSlug" component={TeamLayout} />
              <Route component={NotFound} />
            </Switch>
          </Router>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
