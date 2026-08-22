import { Elysia, status, t } from "elysia";
import { eq, type Database } from "@complifine/db";
import { demoRequests } from "@complifine/db";
import { readAuth, requireOperator, type AuthUser } from "./auth/plugin.ts";
import { isEmail, normalizeEmail } from "./auth/crypto.ts";

const hits = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string, limit = 8, windowMs = 60 * 60 * 1000): void {
  const now = Date.now();
  const current = hits.get(ip);
  if (!current || current.reset < now) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    return;
  }
  current.count++;
  if (current.count > limit) throw status(429, { error: "Too many demo requests from this address" });
}

export function demoRoutes(db: Database) {
  return new Elysia({ name: "complifine-demo" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .post(
      "/demo-requests",
      async ({ body, request }) => {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
        rateLimit(ip);
        const email = normalizeEmail(body.email);
        if (!isEmail(email)) throw status(400, { error: "Enter a valid work email" });
        const [row] = await db
          .insert(demoRequests)
          .values({
            name: body.name.trim(),
            company: body.company.trim(),
            email,
            phone: body.phone?.trim() || null,
            interests: body.interests,
            message: body.message?.trim() || null,
          })
          .returning();
        return { id: row!.id, ok: true };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          company: t.String({ minLength: 1 }),
          email: t.String({ minLength: 3 }),
          phone: t.Optional(t.String()),
          interests: t.Union([
            t.Literal("globalgap-ifa"),
            t.Literal("smeta-7"),
            t.Literal("both"),
          ]),
          message: t.Optional(t.String()),
        }),
        detail: { summary: "Book a CompliFine demo" },
      },
    )
    .get(
      "/demo-requests",
      async ({ auth, query }) => {
        requireOperator(auth);
        const rows = await db.select().from(demoRequests).orderBy(demoRequests.createdAt);
        const statusFilter = query.status;
        return statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;
      },
      {
        query: t.Object({ status: t.Optional(t.String()) }),
        detail: { summary: "List demo requests (operators)" },
      },
    )
    .post(
      "/demo-requests/:id/status",
      async ({ auth, params, body }) => {
        requireOperator(auth);
        const [row] = await db
          .update(demoRequests)
          .set({ status: body.status, notes: body.notes ?? undefined, updatedAt: new Date() })
          .where(eq(demoRequests.id, params.id))
          .returning();
        if (!row) throw status(404, { error: "Demo request not found" });
        return row;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          status: t.Union([t.Literal("new"), t.Literal("contacted"), t.Literal("closed")]),
          notes: t.Optional(t.String()),
        }),
      },
    );
}
