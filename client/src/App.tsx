import { Switch, Route, Router } from "wouter";
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

function TeamLayout() {
  return (
    <TeamProvider>
      <UserProvider>
        <Workspace />
      </UserProvider>
    </TeamProvider>
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
              <Route path="/admin/:key" component={Admin} />
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
