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
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/brand-logo";

const SIDEBAR_CLASS =
  "border-0 **:data-[slot=sidebar-inner]:overflow-hidden **:data-[slot=sidebar-inner]:rounded-2xl **:data-[slot=sidebar-inner]:ring-0";

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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" variant="floating" className={SIDEBAR_CLASS}>
      <SidebarHeader className="gap-3 px-2 pt-2">
        <Link
          href="/"
          aria-label="CompliFine console"
          className="flex h-10 items-center overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <BrandLogo collapsed={collapsed} tone="light" className={collapsed ? undefined : "dark:hidden"} />
          {collapsed ? null : <BrandLogo tone="dark" className="hidden dark:block" />}
        </Link>
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
