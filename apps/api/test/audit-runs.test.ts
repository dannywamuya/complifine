import { describe, expect, test } from "bun:test";
import {
  and,
  assessmentItems,
  assessments,
  auditRunItems,
  auditRuns,
  createDatabase,
  eq,
  findings,
  memberships,
  requirementVersions,
  sites,
  standardVersions,
} from "@complifine/db";
import { createApp } from "../src/app.ts";

const app = createApp();

async function json(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  const response = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function databaseReachable(): Promise<boolean> {
  try {
    return (await json("/status")).status === 200;
  } catch {
    return false;
  }
}

async function register(suffix: string, name: string) {
  const created = await json("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email: `${name}-${suffix}@audit.test`,
      password: "password12",
      company: `${name} ${suffix}`,
    }),
  });
  expect(created.status).toBe(200);
  const token = (created.body as { accessToken: string }).accessToken;
  const userId = (created.body as { user: { id: string } }).user.id;
  return { token, userId };
}

async function addSite(token: string) {
  const site = await json("/sites", {
    method: "POST",
    token,
    body: JSON.stringify({ name: "North field", siteType: "farm" }),
  });
  expect(site.status).toBe(200);
  return (site.body as { id: string }).id;
}

describe("audit runs", () => {
  test("a second run is rejected while one is still running, and another organisation cannot see the site", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "owner");
    const other = await register(suffix, "other");
    const siteId = await addSite(owner.token);
    const db = createDatabase({ max: 1 });
    try {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
      const [version] = await db
        .select()
        .from(standardVersions)
        .where(eq(standardVersions.code, "ifa-v6-gfs-fv"));
      expect(version).toBeTruthy();
      await db.insert(auditRuns).values({
        organizationId: site!.organizationId,
        siteId,
        standardVersionId: version!.id,
        requestedBy: owner.userId,
        status: "running",
      });
      const again = await json(`/sites/${siteId}/audit-runs`, {
        method: "POST",
        token: owner.token,
        body: JSON.stringify({ versionCode: "ifa-v6-gfs-fv" }),
      });
      expect(again.status).toBe(409);
      const foreign = await json(`/sites/${siteId}/audit-runs`, {
        method: "POST",
        token: other.token,
        body: JSON.stringify({ versionCode: "ifa-v6-gfs-fv" }),
      });
      expect(foreign.status).toBe(404);
    } finally {
      await db.$close();
    }
  });

  test("a viewer cannot start an audit", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const viewer = await register(suffix, "viewer");
    const siteId = await addSite(viewer.token);
    const db = createDatabase({ max: 1 });
    try {
      await db
        .update(memberships)
        .set({ role: "viewer", updatedAt: new Date() })
        .where(eq(memberships.userId, viewer.userId));
    } finally {
      await db.$close();
    }
    const signed = await json("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `viewer-${suffix}@audit.test`, password: "password12" }),
    });
    const token = (signed.body as { accessToken: string }).accessToken;
    const denied = await json(`/sites/${siteId}/audit-runs`, {
      method: "POST",
      token,
      body: JSON.stringify({ versionCode: "ifa-v6-gfs-fv" }),
    });
    expect(denied.status).toBe(403);
  });

  test("accept writes the assessment answer and does not open a finding", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "accept");
    const siteId = await addSite(owner.token);
    const db = createDatabase({ max: 1 });
    try {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
      const [version] = await db
        .select()
        .from(standardVersions)
        .where(eq(standardVersions.code, "ifa-v6-gfs-fv"));
      const [requirement] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.standardVersionId, version!.id))
        .limit(1);
      const [run] = await db
        .insert(auditRuns)
        .values({
          organizationId: site!.organizationId,
          siteId,
          standardVersionId: version!.id,
          requestedBy: owner.userId,
          status: "complete",
        })
        .returning();
      const [item] = await db
        .insert(auditRunItems)
        .values({
          auditRunId: run!.id,
          requirementVersionId: requirement!.id,
          verdict: "likely_compliant",
          rationale: "The procedure is on file.",
          recommendation: "Keep the review date current.",
        })
        .returning();
      const accepted = await json(`/audit-runs/${run!.id}/items/${item!.id}/accept`, {
        method: "POST",
        token: owner.token,
        body: JSON.stringify({}),
      });
      expect(accepted.status).toBe(200);
      const [answer] = await db
        .select({ response: assessmentItems.response })
        .from(assessmentItems)
        .innerJoin(assessments, eq(assessments.id, assessmentItems.assessmentId))
        .where(and(eq(assessments.siteId, siteId), eq(assessmentItems.requirementVersionId, requirement!.id)));
      expect(answer?.response).toBe("compliant");
      const opened = await db.select().from(findings).where(eq(findings.siteId, siteId));
      expect(opened).toHaveLength(0);
    } finally {
      await db.$close();
    }
  });

  test("opening a finding points at the requirement", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "finding");
    const siteId = await addSite(owner.token);
    const db = createDatabase({ max: 1 });
    try {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
      const [version] = await db
        .select()
        .from(standardVersions)
        .where(eq(standardVersions.code, "ifa-v6-gfs-fv"));
      const [requirement] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.standardVersionId, version!.id))
        .limit(1);
      const [run] = await db
        .insert(auditRuns)
        .values({
          organizationId: site!.organizationId,
          siteId,
          standardVersionId: version!.id,
          status: "complete",
        })
        .returning();
      const [item] = await db
        .insert(auditRunItems)
        .values({
          auditRunId: run!.id,
          requirementVersionId: requirement!.id,
          verdict: "likely_non_compliant",
          rationale: "No spray record for the last month.",
          recommendation: "File the application register.",
          suggestedSeverity: "major",
        })
        .returning();
      const opened = await json(`/audit-runs/${run!.id}/items/${item!.id}/finding`, {
        method: "POST",
        token: owner.token,
      });
      expect(opened.status).toBe(200);
      expect((opened.body as { requirementVersionId: string }).requirementVersionId).toBe(requirement!.id);
      const [stored] = await db.select().from(auditRunItems).where(eq(auditRunItems.id, item!.id));
      expect(stored?.findingId).toBe((opened.body as { id: string }).id);
    } finally {
      await db.$close();
    }
  });

  test("a failed judgement keeps the items already written", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "fail");
    const siteId = await addSite(owner.token);
    let calls = 0;
    const audited = createApp(createDatabase({ max: 1 }), {
      awaitAudit: true,
      concurrency: 1,
      generator: {
        judge: async () => {
          calls += 1;
          if (calls >= 2) throw new Error("judge failed");
          return {
            verdict: "insufficient_evidence" as const,
            rationale: "Nothing on file.",
            recommendation: "Collect the record.",
            suggestedSeverity: null,
            citedEvidence: [],
            confidence: 0.4,
          };
        },
        async summarize() {
          return { summary: "should not run", recommendations: [] };
        },
      },
    });
    const headers = new Headers({ "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` });
    const response = await audited.handle(
      new Request(`http://localhost/sites/${siteId}/audit-runs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ versionCode: "ifa-v6-gfs-fv" }),
      }),
    );
    const body = (await response.json()) as { id: string; status: string; error: string | null };
    expect(response.status).toBe(202);
    expect(body.status).toBe("failed");
    expect(body.error).toContain("judge failed");
    const db = createDatabase({ max: 1 });
    try {
      const items = await db.select().from(auditRunItems).where(eq(auditRunItems.auditRunId, body.id));
      expect(items.length).toBe(1);
      const answers = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.siteId, siteId)));
      expect(answers).toHaveLength(0);
    } finally {
      await db.$close();
    }
  });
});
