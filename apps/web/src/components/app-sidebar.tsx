"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, MessageSquare, Tractor } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/ask", label: "Chat", icon: MessageSquare },
  { href: "/app/criteria", label: "Criteria", icon: ListChecks },
  { href: "/app/farm", label: "Farm", icon: Tractor },
];

export function AppSidebar() {
  const path = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="CompliFine">
              <Link href="/app">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-[11px] font-medium text-primary-foreground">
                  CF
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-heading text-sm">CompliFine</span>
                  <span className="truncate text-[11px] text-muted-foreground">Producer</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((link) => {
                const Icon = link.icon;
                const active =
                  link.href === "/app"
                    ? path === "/app"
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
      <SidebarFooter>
        <p className="truncate px-2 pb-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          Grounded in published standards
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
