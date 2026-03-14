import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamProvider } from "@/lib/team-context";
import { UserProvider } from "@/context/user-context";
import { UserSelector } from "@/components/user-selector";
import { NotificationBell } from "@/components/notification-bell";
import NotFound from "@/pages/not-found";
import Board from "@/pages/board";
import Team from "@/pages/team";
import Projects from "@/pages/projects";
import Settings from "@/pages/settings";
import Landing from "@/pages/landing";
import Admin from "@/pages/admin";

function TeamLayout() {
  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <TeamProvider>
      <UserProvider>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-3">
                <UserSelector />
                <NotificationBell />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <Switch>
                <Route path="/t/:teamSlug" component={Projects} />
                <Route path="/t/:teamSlug/board" component={Board} />
                <Route path="/t/:teamSlug/board/:projectId" component={Board} />
                <Route path="/t/:teamSlug/team" component={Team} />
                <Route path="/t/:teamSlug/settings" component={Settings} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
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
              <Route path="/t/:teamSlug/:rest*" component={TeamLayout} />
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
