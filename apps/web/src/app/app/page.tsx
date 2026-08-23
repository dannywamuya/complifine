"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  ListChecks,
  MapPin,
  MessageSquare,
  Plus,
  Tractor,
} from "lucide-react";
import { api } from "@/lib/api";
import { SITE_TYPE_LABELS, type OrgPayload } from "@/lib/farm";
import { CreateOrgForm } from "@/components/create-org-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}

export default function OverviewPage() {
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [chats, setChats] = useState<ConversationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [farm, history] = await Promise.all([
          api<OrgPayload>("/org"),
          api<{ conversations: ConversationRow[] }>("/conversations?limit=6").catch(
            () => ({ conversations: [] as ConversationRow[] }),
          ),
        ]);
        if (cancelled) return;
        setOrg(farm);
        setChats(history.conversations);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the dashboard</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const name = org?.organization?.name ?? "Your farm";
  const sites = org?.sites ?? [];
  const scopes = org?.scopes ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      {!org?.organization ? (
        <Card>
          <CardHeader>
            <CardTitle>Create your farm profile</CardTitle>
            <CardDescription>
              Chat can already answer the published standard. A profile lets it name your sites and
              keep answers in scope.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrgForm
              onCreated={async () => {
                const farm = await api<OrgPayload>("/org");
                setOrg(farm);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Dashboard</p>
          <h1 className="font-heading text-3xl font-medium tracking-tight">{name}</h1>
          <p className="max-w-xl text-muted-foreground">
            Ask the published standard, keep your sites in scope, and read the criteria that apply
            to this organisation.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/ask">
            Open chat
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Tractor}
          label="Sites"
          value={String(sites.length)}
          hint={sites.length === 0 ? "Add a farm or packhouse" : sites.map((s) => s.name).slice(0, 2).join(" · ")}
          href="/app/farm"
        />
        <StatCard
          icon={Building2}
          label="Certification scope"
          value={String(scopes.length)}
          hint={scopes.length === 0 ? "Choose IFA or SMETA" : scopes.map((s) => s.name).join(" · ")}
          href="/app/farm"
        />
        <StatCard
          icon={MessageSquare}
          label="Conversations"
          value={String(chats.length)}
          hint={chats[0] ? chats[0].title : "No chats yet"}
          href="/app/ask"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent chats</CardTitle>
            <CardDescription>Continue a thread or start a new one.</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/ask">
                  <Plus />
                  New
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing saved yet. Ask in the words you would use on the farm — every answer cites
                the published text.
              </p>
            ) : (
              <ul className="divide-y">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      href="/app/ask"
                      className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-foreground"
                    >
                      <span className="min-w-0 truncate font-medium">{chat.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(chat.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sites</CardTitle>
            <CardDescription>Locations the agent can name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites yet.</p>
            ) : (
              sites.slice(0, 6).map((site) => (
                <div key={site.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{site.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {SITE_TYPE_LABELS[site.siteType] ?? site.siteType}
                      {site.location ? ` · ${site.location}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/app/farm">Manage farm</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Criteria library</CardTitle>
            <CardDescription>
              Browse principles and criteria for the editions in your scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {scopes.length > 0 ? (
              scopes.map((scope) => (
                <Badge key={scope.id} variant="secondary">
                  {scope.name}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Add a certification to your farm profile first.</p>
            )}
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/criteria">
                <ListChecks />
                Open criteria
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Try asking</CardTitle>
            <CardDescription>Grounded answers, not a generic checklist.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[
              "When can workers go back into a field after spraying?",
              "Is irrigation water testing a Major Must?",
              "What applies to our packhouse hygiene?",
            ].map((q) => (
              <Button key={q} asChild variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal">
                <Link href="/app/ask">{q}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof Tractor;
  label: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Icon className="size-3.5" />
            {label}
          </CardDescription>
          <CardTitle className="font-heading text-3xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="truncate text-sm text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
