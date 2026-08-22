"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Database,
  FileSearch,
  GitCompare,
  LayoutDashboard,
  ListChecks,
  Network,
  Radar,
  ScrollText,
  Search,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/ingest", label: "Ingest", icon: Database },
  { href: "/versions", label: "Versions", icon: BookOpen },
  { href: "/sources", label: "Sources", icon: ScrollText },
  { href: "/criteria", label: "Criteria", icon: ListChecks },
  { href: "/search", label: "Search", icon: Search },
  { href: "/gates", label: "Gates", icon: ShieldCheck },
  { href: "/review", label: "Review", icon: Stamp },
  { href: "/diff", label: "Compare", icon: GitCompare },
  { href: "/watch", label: "Watch", icon: Radar },
  { href: "/demo", label: "Demos", icon: Calendar },
  { href: "/audit", label: "Audit", icon: FileSearch },
];

export function AppSidebar() {
  const path = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="CompliFine console">
              <Link href="/">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-heading text-[10px] font-medium">
                  CF
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-heading text-sm">CompliFine</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Console
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup id="tour-sidebar">
          <SidebarGroupLabel>Knowledge base</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((link) => {
                const Icon = link.icon;
                const active =
                  link.href === "/"
                    ? path === "/"
                    : path === link.href || path.startsWith(`${link.href}/`);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                      <Link href={link.href}>
                        <Icon />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
