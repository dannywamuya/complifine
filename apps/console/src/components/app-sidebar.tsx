"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Database,
  FileSearch,
  FolderTree,
  GitCompare,
  LayoutDashboard,
  Network,
  Radar,
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

const GROUPS = [
  {
    label: "Operate",
    links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Knowledge",
    links: [
      { href: "/registry", label: "Catalog", icon: FolderTree },
      { href: "/graph", label: "Map", icon: Network },
      { href: "/search", label: "Search", icon: Search },
      { href: "/diff", label: "Compare", icon: GitCompare },
      { href: "/watch", label: "Watch", icon: Radar },
    ],
  },
  {
    label: "Pipeline",
    links: [{ href: "/ingest", label: "Ingest", icon: Database }],
  },
  {
    label: "Quality",
    links: [
      { href: "/gates", label: "Gates", icon: ShieldCheck },
      { href: "/review", label: "Review & publish", icon: Stamp },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/demo", label: "Demos", icon: Calendar },
      { href: "/audit", label: "Audit", icon: FileSearch },
    ],
  },
] as const;

const CATALOG_PATHS = ["/registry", "/versions", "/sources", "/criteria"];

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
        {GROUPS.map((group, index) => (
          <SidebarGroup key={group.label} id={index === 0 ? "tour-sidebar" : undefined}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.links.map((link) => {
                  const Icon = link.icon;
                  const active =
                    link.href === "/"
                      ? path === "/"
                      : link.href === "/registry"
                        ? CATALOG_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
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
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
