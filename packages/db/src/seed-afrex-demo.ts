#!/usr/bin/env bun
/**
 * Demo company for the AFREX form library.
 *
 * Creates (or resets) one organisation, an operations manager, a farm and a
 * packhouse, and submitted records drawn from the library templates. Re-running
 * replaces that company's records and keeps the login.
 *
 *   bun --env-file .env packages/db/src/seed-afrex-demo.ts
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { cadenceExpiry, validateEntry, validateHeader, type FormDefinition, type FormValues } from "@complifine/core";
import { createDatabase, type Database } from "./client.ts";
import { FORM_LIBRARY } from "./form-library.ts";
import {
  controlEvidenceTypes,
  controlRequirements,
  evidence,
  evidenceControls,
  evidenceRequirements,
  findings,
  formRecordEntries,
  formRecords,
  formTemplates,
  memberships,
  organizationScopes,
  organizations,
  sites,
  standardVersions,
  users,
} from "./schema/index.ts";

const EMAIL = "mary.wanjiku@afrexgold.example";
const PASSWORD = "AfrexDemo1";
const ORG_NAME = "AFREX Gold";
const VERSION_CODE = "ifa-v6-gfs-fv";

const FARM = "Karagita Farm";
const PACKHOUSE = "Karagita Packhouse";

type SiteKey = "farm" | "packhouse";

interface RecordSeed {
  readonly slug: string;
  readonly site: SiteKey;
  readonly status: "submitted" | "draft" | "verified";
  /** Days before today. Drives recordedAt when an entry has no date. */
  readonly daysAgo: number;
  readonly header: FormValues;
  readonly entries: readonly FormValues[];
  /** When set, also opens a finding (finding-category templates). */
  readonly finding?: string;
}

function iso(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function at(daysAgo: number, hour = 8): Date {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

function grid(definition: FormDefinition, row: FormValues): FormValues[] {
  return (definition.fixedItems ?? []).map((item) => ({ item: item.key, ...row }));
}

function records(library: Map<string, FormDefinition>): RecordSeed[] {
  const toilet = library.get("toilet-cleaning")!;
  const hygiene = library.get("hygiene-inspection")!;
  const cleaning = library.get("facility-cleaning")!;
  const premises = library.get("premises-daily-cleaning")!;
  const equipment = library.get("equipment-cleaning")!;
  const glass = library.get("glass-hard-plastic-audit")!;
  const packline = library.get("packline-inspection")!;
  const fire = library.get("fire-equipment-service")!;
  const firstAid = library.get("first-aid-kit-inspection")!;
  const consolidation = library.get("produce-consolidation-checklist")!;
  const transport = library.get("transport-vehicle-inspection")!;
  const coldroom = library.get("coldroom-monthly-checklist")!;

  const today = iso(0);
  const yesterday = iso(1);

  return [
    {
      slug: "food-safety-health-wildlife-policy",
      site: "farm",
      status: "verified",
      daysAgo: 40,
      header: { company: "AFREX Gold" },
      entries: [{ signed_by: "Mary Wanjiku", position: "Operations manager", date: iso(40) }],
    },
    {
      slug: "hygiene-rules",
      site: "farm",
      status: "verified",
      daysAgo: 30,
      header: {},
      entries: [
        { worker: "Peter Kamau", language: "Swahili", date: iso(30), acknowledged: true },
        { worker: "Asha Njeri", language: "English", date: iso(30), acknowledged: true },
        { worker: "John Otieno", language: "Swahili", date: iso(29), acknowledged: true },
        { worker: "Grace Chebet", language: "English", date: iso(29), acknowledged: true },
      ],
    },
    {
      slug: "safety-instructions",
      site: "farm",
      status: "submitted",
      daysAgo: 30,
      header: {},
      entries: [
        { worker: "Peter Kamau", language: "Swahili", date: iso(30), acknowledged: true },
        { worker: "David Mwangi", language: "English", date: iso(30), acknowledged: true },
      ],
    },
    {
      slug: "training-record",
      site: "farm",
      status: "submitted",
      daysAgo: 12,
      header: {
        course: "Harvest hygiene and personal cleanliness",
        date: iso(12),
        provider: "AFREX Gold",
        venue: "Karagita farm shed",
        trainers: "Mary Wanjiku",
      },
      entries: [
        { trainee: "Peter Kamau", signed: true },
        { trainee: "Asha Njeri", signed: true },
        { trainee: "John Otieno", signed: true },
        { trainee: "Grace Chebet", signed: true },
      ],
    },
    {
      slug: "workers-overview",
      site: "farm",
      status: "submitted",
      daysAgo: 20,
      header: { year: 2026, working_time: "Monday to Saturday, 07:30–16:30. Overtime only with the supervisor's sign-off." },
      entries: [
        { worker: "Peter Kamau", area: "Harvest", entry_date: "2024-03-04", handles_chemicals: false },
        { worker: "Asha Njeri", area: "Grading shed", entry_date: "2023-11-12", handles_chemicals: false },
        { worker: "John Otieno", area: "Spray", entry_date: "2022-06-01", handles_chemicals: true },
        { worker: "David Mwangi", area: "Irrigation", entry_date: "2025-01-15", handles_chemicals: false },
      ],
    },
    {
      slug: "planting-record",
      site: "farm",
      status: "submitted",
      daysAgo: 200,
      header: {},
      entries: [
        {
          crop: "Avocado",
          variety: "Hass",
          block: "A",
          area_ha: 4.2,
          planting_date: "2021-04-12",
          method: "Transplanted seedlings",
          rate: "7 m x 7 m",
          quantity: "860 trees",
          maturity_date: "2024-04-01",
          rotation: "Permanent orchard",
        },
        {
          crop: "Avocado",
          variety: "Fuerte",
          block: "B",
          area_ha: 2.1,
          planting_date: "2022-03-18",
          method: "Transplanted seedlings",
          rate: "7 m x 7 m",
          quantity: "420 trees",
        },
      ],
    },
    {
      slug: "fertilizer-application",
      site: "farm",
      status: "submitted",
      daysAgo: 18,
      header: { block: "A", area_ha: 4.2, crop: "Avocado" },
      entries: [
        {
          date: iso(18),
          product: "CAN",
          npk: "27-0-0",
          rate: "150 g/tree",
          quantity: "129 kg",
          method: "Ring application",
          machinery: "Hand",
          operator: "David Mwangi",
          advisor: "Mary Wanjiku",
        },
      ],
    },
    {
      slug: "irrigation-record",
      site: "farm",
      status: "submitted",
      daysAgo: 2,
      header: { pump_rate: 18 },
      entries: [
        { date: iso(3), block: "A", crop: "Hass", pump_on: "06:00", pump_off: "08:30", minutes: 150, water_m3: 45, remarks: "Dry week" },
        { date: iso(2), block: "B", crop: "Fuerte", pump_on: "06:15", pump_off: "08:00", minutes: 105, water_m3: 32 },
      ],
    },
    {
      slug: "pesticide-application",
      site: "farm",
      status: "submitted",
      daysAgo: 9,
      header: { block: "A", area_ha: 4.2, crop: "Avocado", variety: "Hass" },
      entries: [
        {
          date: iso(9),
          justification: "Thrips",
          trade_name: "Tracer 480 SC",
          active_ingredient: "Spinosad",
          quantity: "200 ml",
          water_l: 400,
          phi_days: 3,
          phi_clear: iso(6),
          reentry: iso(8),
          weather: "Calm, dry",
          operator: "John Otieno",
          equipment: "KN-SP-014",
          advisor: "Mary Wanjiku",
        },
      ],
    },
    {
      slug: "pest-scouting",
      site: "farm",
      status: "submitted",
      daysAgo: 2,
      header: { block: "A", size_ha: 4.2, crop: "Avocado Hass", crop_age: "5 years", date: iso(2), scout: "Peter Kamau" },
      entries: [
        { pest: "Thrips", average: 2, threshold: "5 of 10 plants", decision: "Monitor" },
        { pest: "False codling moth (FCM)", average: 0, threshold: "1 of 10 fruit", decision: "No spray" },
        { pest: "Fruit fly (Bactrocera spp.)", average: 1, threshold: "3 of 10 traps", decision: "Monitor" },
      ],
    },
    {
      slug: "harvest-record",
      site: "farm",
      status: "submitted",
      daysAgo: 1,
      header: {},
      entries: [
        { date: iso(2), block: "A", kg: 1860, lead: "Peter Kamau" },
        { date: iso(1), block: "A", kg: 1420, lead: "Peter Kamau" },
        { date: iso(1), block: "B", kg: 640, lead: "Grace Chebet" },
      ],
    },
    {
      slug: "visitor-rules",
      site: "farm",
      status: "submitted",
      daysAgo: 4,
      header: {},
      entries: [
        { visitor: "James Kariuki", company: "Buyer QA", date: iso(4), time_in: "09:10", time_out: "11:40", acknowledged: true },
        { visitor: "Lucy Achieng", company: "Sprayer service", date: iso(4), time_in: "13:00", time_out: "15:20", acknowledged: true },
      ],
    },
    {
      slug: "incident-record",
      site: "farm",
      status: "submitted",
      daysAgo: 15,
      header: {},
      entries: [
        {
          date: iso(15),
          location: "Block A, row 12",
          what: "Harvester slipped on wet grass and bruised a knee. No cut.",
          injured: 1,
          injury: "Bruise",
          reported_by: "Peter Kamau",
          action: "First aider checked the knee. Worker rested for the afternoon and returned the next day.",
        },
      ],
    },
    {
      slug: "energy-use-record",
      site: "farm",
      status: "submitted",
      daysAgo: 6,
      header: { source: "Diesel" },
      entries: [
        { date: iso(6), supplier: "Naivasha Fuels", quantity_in: 200, quantity_out: 40, issued_to: "Pump", balance: 160, storekeeper: "David Mwangi" },
      ],
    },
    {
      slug: "toilet-cleaning",
      site: "farm",
      status: "submitted",
      daysAgo: 0,
      header: { location: "Field ablution, Block A" },
      entries: grid(toilet, { date: today, cleaned: true, cleaned_by: "Asha Njeri", checked_by: "Mary Wanjiku" }),
    },
    {
      slug: "hygiene-inspection",
      site: "farm",
      status: "submitted",
      daysAgo: 0,
      header: { personnel: 18 },
      entries: grid(hygiene, { date: today, result: "OK", checked_by: "Mary Wanjiku" }),
    },
    {
      slug: "facility-cleaning",
      site: "farm",
      status: "submitted",
      daysAgo: 0,
      header: { checked_by: "Mary Wanjiku" },
      entries: grid(cleaning, { date: today, cleaned: true }),
    },
    {
      slug: "produce-consolidation-checklist",
      site: "farm",
      status: "submitted",
      daysAgo: 1,
      header: { shed: "Karagita field shed", completed_by: "Mary Wanjiku", date: yesterday },
      entries: grid(consolidation, { answer: "Yes" }),
    },
    {
      slug: "crate-cleaning",
      site: "farm",
      status: "submitted",
      daysAgo: 12,
      header: {},
      entries: [{ date: iso(12), colour: "Green", count: 80, cleaned_by: "Asha Njeri", checked_by: "Peter Kamau" }],
    },
    {
      slug: "pesticide-application",
      site: "farm",
      status: "draft",
      daysAgo: 0,
      header: { block: "B", area_ha: 2.1, crop: "Avocado", variety: "Fuerte" },
      entries: [
        {
          date: today,
          justification: "Persea mites",
          trade_name: "Abalone 18 EC",
          active_ingredient: "Abamectin",
          quantity: "80 ml",
          phi_days: 7,
          operator: "John Otieno",
          advisor: "Mary Wanjiku",
        },
      ],
    },
    {
      slug: "non-conformance-report",
      site: "farm",
      status: "submitted",
      daysAgo: 8,
      header: { date: iso(8), standard: "IFA v6 GFS", crops: "Avocado", auditor: "Mary Wanjiku", auditee: "Peter Kamau" },
      entries: [
        {
          section: "Harvest hygiene",
          non_compliance: "Two harvesters in Block B were wearing watches during picking.",
          grade: "Minor Must",
          responsible: "Peter Kamau",
          close_by: iso(-7),
          checked_by: "Mary Wanjiku",
        },
      ],
      finding: "Two harvesters in Block B were wearing watches during picking.",
    },
    {
      slug: "training-record",
      site: "packhouse",
      status: "submitted",
      daysAgo: 10,
      header: {
        course: "Packhouse hygiene and glass breakage",
        date: iso(10),
        venue: "Packhouse meeting room",
        trainers: "Mary Wanjiku",
      },
      entries: [
        { trainee: "Grace Chebet", signed: true },
        { trainee: "Asha Njeri", signed: true },
        { trainee: "David Mwangi", signed: true },
      ],
    },
    {
      slug: "toilet-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 0,
      header: { location: "Packhouse staff washroom" },
      entries: grid(toilet, { date: today, cleaned: true, cleaned_by: "Grace Chebet", checked_by: "Mary Wanjiku" }),
    },
    {
      slug: "premises-daily-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 0,
      header: { detergent: "Neutral detergent" },
      entries: grid(premises, { date: today, cleaned: true, cleaned_by: "Grace Chebet", inspected_by: "Mary Wanjiku" }),
    },
    {
      slug: "equipment-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 0,
      header: { detergent: "Neutral detergent" },
      entries: grid(equipment, { date: today, cleaned: true, cleaned_by: "David Mwangi", checked_by: "Mary Wanjiku" }),
    },
    {
      slug: "cold-room-temperature",
      site: "packhouse",
      status: "submitted",
      daysAgo: 0,
      header: { room: "Cold room 1", range: "5 to 7 °C" },
      entries: [
        { date: today, time: "06:00", temperature: 5.8, monitored_by: "David Mwangi" },
        { date: today, time: "08:00", temperature: 6.1, monitored_by: "David Mwangi" },
        { date: today, time: "10:00", temperature: 6.4, monitored_by: "Grace Chebet" },
        { date: today, time: "12:00", temperature: 6.2, monitored_by: "Grace Chebet" },
      ],
    },
    {
      slug: "pest-monitoring",
      site: "packhouse",
      status: "submitted",
      daysAgo: 2,
      header: {},
      entries: [
        {
          date: iso(2),
          bait_stations: "1–12, all intact",
          insectocutors: "Loading bay and rejects, lamps on",
          pests: "None",
          insects: "None",
          checked_by: "David Mwangi",
          verified_by: "Mary Wanjiku",
        },
      ],
    },
    {
      slug: "glass-hard-plastic-audit",
      site: "packhouse",
      status: "submitted",
      daysAgo: 1,
      header: { verified_by: "Mary Wanjiku" },
      entries: grid(glass, { date: yesterday, status: "OK", checked_by: "Grace Chebet" }),
    },
    {
      slug: "fire-equipment-service",
      site: "packhouse",
      status: "submitted",
      daysAgo: 5,
      header: { date: iso(5), checked_by: "David Mwangi", confirmed_by: "Mary Wanjiku" },
      entries: grid(fire, { status: "OK" }),
    },
    {
      slug: "first-aid-kit-inspection",
      site: "packhouse",
      status: "submitted",
      daysAgo: 30,
      header: { kit: "Packhouse reception", date: iso(30), first_aider: "Grace Chebet" },
      entries: grid(firstAid, { quantity: 4, expiry: "2027-06-30" }),
    },
    {
      slug: "packaging-stock",
      site: "packhouse",
      status: "submitted",
      daysAgo: 1,
      header: {},
      entries: [
        { date: yesterday, item: "4 kg carton", received: 500, issued: 180, stock: 820 },
        { date: yesterday, item: "Sea pallets", received: 20, issued: 6, stock: 34 },
        { date: yesterday, item: "Layer pads", received: 0, issued: 40, stock: 210 },
      ],
    },
    {
      slug: "vehicle-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 1,
      header: {},
      entries: [
        { date: yesterday, vehicle: "Isuzu FRR", registration: "KDG 214H", cleaned_by: "David Mwangi", checked_by: "Mary Wanjiku", comments: "Swept and washed before loading" },
      ],
    },
    {
      slug: "crate-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 0,
      header: {},
      entries: [{ date: today, colour: "Blue", count: 120, cleaned_by: "Grace Chebet", checked_by: "Mary Wanjiku" }],
    },
    {
      slug: "meeting-record",
      site: "packhouse",
      status: "submitted",
      daysAgo: 20,
      header: {
        committee: "Health and safety",
        date: iso(20),
        venue: "Packhouse meeting room",
        minutes: "Agreed to replace two worn crate stacks and to repeat the jewellery reminder at the morning briefing.",
      },
      entries: [
        { member: "Mary Wanjiku", signed: true },
        { member: "Grace Chebet", signed: true },
        { member: "Peter Kamau", signed: true },
      ],
    },
    {
      slug: "water-tank-cleaning",
      site: "packhouse",
      status: "submitted",
      daysAgo: 40,
      header: {},
      entries: [{ date: iso(40), tank: "Roof tank 1", cleaned_by: "David Mwangi", checked_by: "Mary Wanjiku", remarks: "Drained, scrubbed, refilled" }],
    },
    {
      slug: "transport-vehicle-inspection",
      site: "packhouse",
      status: "submitted",
      daysAgo: 1,
      header: {
        date: yesterday,
        truck: "KDG 214H",
        trailer: "T-18",
        container: "MSCU 4412390",
        driver: "Samuel Kiptoo",
        accepted: true,
        checked_by: "Mary Wanjiku",
      },
      entries: grid(transport, { status: "Yes" }),
    },
    {
      slug: "coldroom-monthly-checklist",
      site: "packhouse",
      status: "submitted",
      daysAgo: 16,
      header: { date: iso(16), checked_by: "David Mwangi", confirmed_by: "Mary Wanjiku" },
      entries: grid(coldroom, {}),
    },
    {
      slug: "packline-inspection",
      site: "packhouse",
      status: "submitted",
      daysAgo: 6,
      header: {},
      entries: grid(packline, { date: iso(6), clean: "OK", working: "OK", inspected_by: "David Mwangi" }),
    },
    {
      slug: "cleaning-chemical-issuance",
      site: "packhouse",
      status: "submitted",
      daysAgo: 1,
      header: {},
      entries: [
        { date: yesterday, chemical: "Detergent", product: "Neutral detergent", quantity: "5 L", section: "Packing area", issued_by: "Grace Chebet" },
        { date: yesterday, chemical: "Chlorine", product: "Sodium hypochlorite", quantity: "1 L", section: "Washroom", issued_by: "Grace Chebet" },
      ],
    },
  ];
}

async function main() {
  const db = createDatabase({ max: 1 });
  try {
    const result = await seedAfrexDemo(db);
    console.log(`Organisation: ${result.org}`);
    console.log(`Sign in: ${result.email}`);
    console.log(`Password: ${result.password}`);
    console.log(`Sites: ${result.sites.join(", ")}`);
    console.log(`Edition: ${result.edition}`);
    console.log(`Records: ${result.submitted} submitted, ${result.drafts} draft`);
  } catch (error) {
    console.error("AFREX demo seed failed:", error);
    process.exit(1);
  } finally {
    await db.$close();
  }
}

export async function seedAfrexDemo(db: Database) {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(and(eq(standardVersions.code, VERSION_CODE), eq(standardVersions.status, "published")));
  if (!version) throw new Error(`Published edition ${VERSION_CODE} is not in the database. Ingest it first.`);

  const templates = await db
    .select()
    .from(formTemplates)
    .where(isNull(formTemplates.organizationId));
  const bySlug = new Map(templates.map((row) => [row.slug, row]));
  const definitions = new Map(
    FORM_LIBRARY.map((template) => [template.slug, template.definition]),
  );

  const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });
  const [existingUser] = await db.select().from(users).where(eq(users.email, EMAIL));
  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await db
      .update(users)
      .set({ name: "Mary Wanjiku", passwordHash, kind: "member", updatedAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    const [created] = await db
      .insert(users)
      .values({ email: EMAIL, name: "Mary Wanjiku", passwordHash, kind: "member" })
      .returning();
    userId = created!.id;
  }

  const [membership] = await db.select().from(memberships).where(eq(memberships.userId, userId));
  let orgId: string;
  if (membership) {
    orgId = membership.organizationId;
    await db
      .update(organizations)
      .set({ name: ORG_NAME, country: "KE", updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    await db
      .update(memberships)
      .set({ role: "owner", updatedAt: new Date() })
      .where(eq(memberships.id, membership.id));
  } else {
    const [org] = await db.insert(organizations).values({ name: ORG_NAME, country: "KE" }).returning();
    orgId = org!.id;
    await db.insert(memberships).values({ userId, organizationId: orgId, role: "owner" });
  }

  const siteIds = await ensureSites(db, orgId);
  const [scope] = await db
    .select()
    .from(organizationScopes)
    .where(and(eq(organizationScopes.organizationId, orgId), eq(organizationScopes.standardVersionId, version.id)));
  if (!scope) {
    await db.insert(organizationScopes).values({ organizationId: orgId, standardVersionId: version.id });
  }

  await db.delete(findings).where(eq(findings.organizationId, orgId));
  await db.delete(formRecords).where(eq(formRecords.organizationId, orgId));

  let submitted = 0;
  let drafts = 0;
  for (const seed of records(definitions)) {
    const template = bySlug.get(seed.slug);
    const definition = definitions.get(seed.slug);
    if (!template?.definition || !template.evidenceTypeId || !definition) {
      throw new Error(`Library template ${seed.slug} is not seeded`);
    }
    const header = validateHeader(definition, seed.header);
    if (!header.ok) throw new Error(`${seed.slug} header: ${JSON.stringify(header.issues)}`);
    const rows = seed.entries.map((entry, index) => {
      const checked = validateEntry(definition, entry);
      if (!checked.ok) throw new Error(`${seed.slug} row ${index + 1}: ${JSON.stringify(checked.issues)}`);
      return checked.data;
    });
    if (rows.length === 0) throw new Error(`${seed.slug} has no rows`);

    const fallback = at(seed.daysAgo);
    const times = rows.map((row) => entryTime(row, fallback));
    const latest = times.reduce((max, time) => (time > max ? time : max), times[0]!);
    const status = seed.status === "draft" ? "draft" : seed.status === "verified" ? "verified" : "submitted";

    const [record] = await db
      .insert(formRecords)
      .values({
        organizationId: orgId,
        siteId: siteIds[seed.site],
        templateId: template.id,
        templateVersion: template.version,
        status,
        origin: "manual",
        header: header.data,
        createdBy: userId,
        submittedBy: status === "draft" ? null : userId,
        submittedAt: status === "draft" ? null : latest,
        verifiedBy: status === "verified" ? userId : null,
        verifiedAt: status === "verified" ? latest : null,
      })
      .returning();

    await db.insert(formRecordEntries).values(
      rows.map((data, index) => ({
        recordId: record!.id,
        recordedAt: times[index]!,
        data,
        enteredBy: userId,
      })),
    );

    if (status === "draft") {
      drafts += 1;
      continue;
    }

    const expiresAt = cadenceExpiry(template.cadence, latest);
    const [filed] = await db
      .insert(evidence)
      .values({
        organizationId: orgId,
        siteId: siteIds[seed.site],
        evidenceTypeId: template.evidenceTypeId,
        formRecordId: record!.id,
        ownerId: userId,
        validFrom: latest,
        expiresAt,
        verificationStatus: status === "verified" ? "verified" : "unverified",
        source: "form",
      })
      .returning();
    await db.update(formRecords).set({ evidenceId: filed!.id }).where(eq(formRecords.id, record!.id));
    await linkEvidence(db, filed!.id, template.evidenceTypeId);
    if (seed.finding) {
      await db.insert(findings).values({
        organizationId: orgId,
        siteId: siteIds[seed.site],
        description: seed.finding,
        section: template.title,
        severity: "minor",
        responsibleId: userId,
        dueDate: at(-7),
        status: "open",
        sourceFormRecordId: record!.id,
      });
    }
    submitted += 1;
  }

  return {
    org: ORG_NAME,
    email: EMAIL,
    password: PASSWORD,
    sites: [FARM, PACKHOUSE],
    edition: version.name,
    submitted,
    drafts,
  };
}

function entryTime(data: FormValues, fallback: Date): Date {
  const date = typeof data.date === "string" ? data.date : null;
  if (!date) return fallback;
  const time = typeof data.time === "string" ? data.time : "08:00";
  return new Date(`${date}T${time}:00.000Z`);
}

async function ensureSites(db: Database, orgId: string): Promise<Record<SiteKey, string>> {
  const wanted = [
    { key: "farm" as const, name: FARM, siteType: "farm" as const, location: "Karagita, Naivasha" },
    { key: "packhouse" as const, name: PACKHOUSE, siteType: "packhouse" as const, location: "Karagita, Naivasha" },
  ];
  const ids = {} as Record<SiteKey, string>;
  for (const site of wanted) {
    const [existing] = await db
      .select()
      .from(sites)
      .where(and(eq(sites.organizationId, orgId), eq(sites.name, site.name)));
    if (existing) {
      ids[site.key] = existing.id;
      continue;
    }
    const [created] = await db
      .insert(sites)
      .values({ organizationId: orgId, name: site.name, siteType: site.siteType, location: site.location })
      .returning();
    ids[site.key] = created!.id;
  }
  return ids;
}

async function linkEvidence(db: Database, evidenceId: string, evidenceTypeId: string) {
  const controlsForType = await db
    .select({ controlId: controlEvidenceTypes.controlId })
    .from(controlEvidenceTypes)
    .where(eq(controlEvidenceTypes.evidenceTypeId, evidenceTypeId));
  if (controlsForType.length === 0) return;
  await db.insert(evidenceControls).values(controlsForType.map((row) => ({ evidenceId, controlId: row.controlId })));
  const requirements = await db
    .select({ requirementVersionId: controlRequirements.requirementVersionId })
    .from(controlRequirements)
    .where(inArray(controlRequirements.controlId, controlsForType.map((row) => row.controlId)));
  const seen = new Set<string>();
  const rows = requirements.filter((row) => {
    if (seen.has(row.requirementVersionId)) return false;
    seen.add(row.requirementVersionId);
    return true;
  });
  if (rows.length === 0) return;
  await db.insert(evidenceRequirements).values(rows.map((row) => ({ evidenceId, ...row })));
}

if (import.meta.main) await main();
