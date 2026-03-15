import { useLocation, Link } from "wouter";
import { Users, FolderKanban, Settings, ArrowLeftRight, Mail } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTeam } from "@/lib/team-context";

const navItems = [
  { title: "Projects", path: "", icon: FolderKanban },
  { title: "Team", path: "/team", icon: Users },
  { title: "Settings", path: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { teamSlug, teamName } = useTeam();
  const base = `/t/${teamSlug}`;

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="TaskFlow logo">
            <rect width="28" height="28" rx="6" fill="currentColor" className="text-primary" />
            <path d="M8 10h12M8 14h8M8 18h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <circle cx="21" cy="18" r="2.5" fill="white" />
          </svg>
          <div className="min-w-0">
            <span className="text-base font-semibold tracking-tight block">TaskFlow</span>
            <span className="text-xs text-muted-foreground truncate block">{teamName || teamSlug}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const href = `${base}${item.path}`;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === href || (item.path === "" && (location.startsWith(`${base}/board`) || location.startsWith(`${base}/project`)))}
                    >
                      <Link href={href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 space-y-2">
        <Link href="/">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground">
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
            Switch / Create Team
          </Button>
        </Link>
        <a href="mailto:hello@manaboodle.com">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Contact Admin
          </Button>
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
