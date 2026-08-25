/**
 * Certification catalog and knowledge-graph payload.
 *
 * Standards and versions are first-class: a new cert is another ingested row,
 * not a branch in the console. The graph is aggregated so the UI can show
 * scope without loading every criterion as a node.
 */

import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, inArray, type Database } from "@complifine/db";
import {
  controlRequirements,
  controls,
  requirementRelationships,
  requirementVersions,
  standardDocuments,
  standardSections,
  standardVersions,
  standards,
} from "@complifine/db";
import {
  AUTHORITY_LEVEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  type AuthorityLevel,
} from "@complifine/core";

export function parseCodeList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function listStandards(
  db: Database,
  options: { publishedOnly?: boolean } = {},
) {
  const standardRows = await db.select().from(standards).orderBy(asc(standards.code));
  const versionRows = await db
    .select({
      id: standardVersions.id,
      code: standardVersions.code,
      name: standardVersions.name,
      edition: standardVersions.edition,
      version: standardVersions.version,
      scope: standardVersions.scope,
      status: standardVersions.status,
      levelScheme: standardVersions.levelScheme,
      standardId: standardVersions.standardId,
      criteria: count(requirementVersions.id),
    })
    .from(standardVersions)
    .leftJoin(
      requirementVersions,
      and(
        eq(requirementVersions.standardVersionId, standardVersions.id),
        options.publishedOnly ? eq(requirementVersions.status, "published") : undefined,
      ),
    )
    .where(options.publishedOnly ? eq(standardVersions.status, "published") : undefined)
    .groupBy(standardVersions.id)
    .orderBy(asc(standardVersions.code));

  const nested = standardRows.map((standard) => ({
    id: standard.id,
    code: standard.code,
    name: standard.name,
    publisher: standard.publisher,
    description: standard.description,
    homepageUrl: standard.homepageUrl,
    versions: versionRows
      .filter((version) => version.standardId === standard.id)
      .map((version) => ({
        id: version.id,
        code: version.code,
        name: version.name,
        edition: version.edition,
        version: version.version,
        scope: version.scope,
        status: version.status,
        levelScheme: version.levelScheme,
        criteria: Number(version.criteria),
      })),
  }));

  return {
    standards: options.publishedOnly
      ? nested.filter((standard) => standard.versions.length > 0)
      : nested,
  };
}

export async function registryTree(
  db: Database,
  options: { publishedOnly?: boolean; standardCodes?: string[] } = {},
) {
  const catalog = await listStandards(db, { publishedOnly: options.publishedOnly });
  const standardsInView = options.standardCodes?.length
    ? catalog.standards.filter((standard) => options.standardCodes!.includes(standard.code))
    : catalog.standards;
  const versionIds = standardsInView.flatMap((standard) => standard.versions.map((version) => version.id));

  const documents =
    versionIds.length === 0
      ? []
      : await db
          .select({
            slug: standardDocuments.slug,
            title: standardDocuments.title,
            type: standardDocuments.documentType,
            authorityLevel: standardDocuments.authorityLevel,
            edition: standardVersions.code,
            sourceUrl: standardDocuments.sourceUrl,
            pages: standardDocuments.pageCount,
            status: standardDocuments.status,
            sha256: standardDocuments.fileHash,
          })
          .from(standardDocuments)
          .innerJoin(standardVersions, eq(standardVersions.id, standardDocuments.standardVersionId))
          .where(inArray(standardDocuments.standardVersionId, versionIds))
          .orderBy(asc(standardDocuments.authorityLevel), asc(standardDocuments.slug));

  return {
    standards: standardsInView.map((standard) => ({
      ...standard,
      versions: standard.versions.map((version) => ({
        ...version,
        documents: documents
          .filter((document) => document.edition === version.code)
          .map((document) => ({
            slug: document.slug,
            title: document.title,
            type: DOCUMENT_TYPE_LABELS[document.type],
            authority: AUTHORITY_LEVEL_LABELS[document.authorityLevel as AuthorityLevel],
            edition: document.edition,
            sourceUrl: document.sourceUrl,
            pages: document.pages,
            status: document.status,
            sha256: options.publishedOnly ? null : document.sha256,
            binding: (document.authorityLevel as AuthorityLevel) <= 3,
          })),
      })),
    })),
  };
}

export async function knowledgeGraph(
  db: Database,
  options: {
    standardCodes?: string[];
    detail?: "overview" | "sections";
    publishedOnly?: boolean;
  },
) {
  const wanted = options.standardCodes ?? [];
  const detail = options.detail ?? "overview";
  const catalog = await listStandards(db, { publishedOnly: options.publishedOnly });
  const scopedStandards = wanted.length
    ? catalog.standards.filter((standard) => wanted.includes(standard.code))
    : catalog.standards;
  const scopedCodes = scopedStandards.flatMap((standard) => standard.versions.map((v) => v.code));
  const scopedVersionIds = scopedStandards.flatMap((standard) => standard.versions.map((v) => v.id));

  const standardNodes = scopedStandards.map((standard) => ({
    id: `standard:${standard.code}`,
    kind: "standard" as const,
    code: standard.code,
    label: standard.name,
    subtitle: standard.publisher,
    versions: standard.versions.length,
    requirements: standard.versions.reduce((sum, version) => sum + version.criteria, 0),
  }));

  const versionNodes = scopedStandards.flatMap((standard) =>
    standard.versions.map((version) => ({
      id: `version:${version.code}`,
      kind: "version" as const,
      code: version.code,
      label: version.name,
      subtitle: version.edition,
      standardCode: standard.code,
      status: version.status,
      requirements: version.criteria,
    })),
  );

  const belongsEdges = versionNodes.map((version) => ({
    id: `${version.id}->standard:${version.standardCode}`,
    kind: "belongs" as const,
    from: version.id,
    to: `standard:${version.standardCode}`,
  }));

  const relatedEdges = await versionRelationshipEdges(db, scopedCodes);
  const controlGraph = await controlNodesAndEdges(db, scopedCodes);
  const sectionGraph =
    detail === "sections" && scopedVersionIds.length > 0
      ? await sectionNodesAndEdges(db, scopedVersionIds, scopedStandards)
      : { nodes: [], edges: [] };

  return {
    detail,
    standards: scopedStandards.map((standard) => ({
      code: standard.code,
      name: standard.name,
      publisher: standard.publisher,
    })),
    nodes: [...standardNodes, ...versionNodes, ...controlGraph.nodes, ...sectionGraph.nodes],
    edges: [...belongsEdges, ...relatedEdges, ...controlGraph.edges, ...sectionGraph.edges],
  };
}

async function versionRelationshipEdges(db: Database, versionCodes: string[]) {
  if (versionCodes.length === 0) return [];

  const fromReq = alias(requirementVersions, "from_req");
  const toReq = alias(requirementVersions, "to_req");
  const fromVer = alias(standardVersions, "from_ver");
  const toVer = alias(standardVersions, "to_ver");

  const rows = await db
    .select({
      fromCode: fromVer.code,
      toCode: toVer.code,
      type: requirementRelationships.relationshipType,
      count: count(),
    })
    .from(requirementRelationships)
    .innerJoin(fromReq, eq(fromReq.id, requirementRelationships.fromRequirementVersionId))
    .innerJoin(toReq, eq(toReq.id, requirementRelationships.toRequirementVersionId))
    .innerJoin(fromVer, eq(fromVer.id, fromReq.standardVersionId))
    .innerJoin(toVer, eq(toVer.id, toReq.standardVersionId))
    .where(and(inArray(fromVer.code, versionCodes), inArray(toVer.code, versionCodes)))
    .groupBy(fromVer.code, toVer.code, requirementRelationships.relationshipType);

  return rows.map((row) => ({
    id: `rel:${row.fromCode}:${row.toCode}:${row.type}`,
    kind: "related" as const,
    from: `version:${row.fromCode}`,
    to: `version:${row.toCode}`,
    type: row.type,
    count: Number(row.count),
  }));
}

async function controlNodesAndEdges(db: Database, versionCodes: string[]) {
  if (versionCodes.length === 0) return { nodes: [] as ControlNode[], edges: [] as ControlEdge[] };

  const rows = await db
    .select({
      slug: controls.slug,
      title: controls.title,
      versionCode: standardVersions.code,
    })
    .from(controls)
    .innerJoin(controlRequirements, eq(controlRequirements.controlId, controls.id))
    .innerJoin(
      requirementVersions,
      eq(requirementVersions.id, controlRequirements.requirementVersionId),
    )
    .innerJoin(standardVersions, eq(standardVersions.id, requirementVersions.standardVersionId))
    .where(inArray(standardVersions.code, versionCodes))
    .groupBy(controls.slug, controls.title, standardVersions.code);

  const byControl = new Map<string, { slug: string; title: string; versions: Set<string> }>();
  for (const row of rows) {
    const current = byControl.get(row.slug) ?? {
      slug: row.slug,
      title: row.title,
      versions: new Set<string>(),
    };
    current.versions.add(row.versionCode);
    byControl.set(row.slug, current);
  }

  const nodes: ControlNode[] = [...byControl.values()].map((control) => ({
    id: `control:${control.slug}`,
    kind: "control" as const,
    code: control.slug,
    label: control.title,
    subtitle: `${control.versions.size} version${control.versions.size === 1 ? "" : "s"}`,
    versions: control.versions.size,
  }));

  const edges: ControlEdge[] = [];
  for (const control of byControl.values()) {
    for (const versionCode of control.versions) {
      edges.push({
        id: `control:${control.slug}->version:${versionCode}`,
        kind: "satisfies",
        from: `control:${control.slug}`,
        to: `version:${versionCode}`,
      });
    }
  }

  return { nodes, edges };
}

async function sectionNodesAndEdges(
  db: Database,
  versionIds: string[],
  scopedStandards: Awaited<ReturnType<typeof listStandards>>["standards"],
) {
  const sections = await db
    .select({
      id: standardSections.id,
      versionId: standardSections.standardVersionId,
      number: standardSections.sourceIdentifier,
      title: standardSections.title,
      requirements: count(requirementVersions.id),
    })
    .from(standardSections)
    .leftJoin(requirementVersions, eq(requirementVersions.sectionId, standardSections.id))
    .where(and(inArray(standardSections.standardVersionId, versionIds), eq(standardSections.depth, 1)))
    .groupBy(standardSections.id)
    .orderBy(asc(standardSections.sectionOrder));

  const versionById = new Map(
    scopedStandards.flatMap((standard) =>
      standard.versions.map((version) => [version.id, version.code] as const),
    ),
  );

  const nodes = sections.map((section) => {
    const versionCode = versionById.get(section.versionId) ?? "unknown";
    return {
      id: `section:${section.id}`,
      kind: "section" as const,
      code: section.number ?? section.id.slice(0, 8),
      label: section.title,
      subtitle: versionCode,
      versionCode,
      requirements: Number(section.requirements),
    };
  });

  const edges = nodes.map((section) => ({
    id: `${section.id}->version:${section.versionCode}`,
    kind: "section_of" as const,
    from: section.id,
    to: `version:${section.versionCode}`,
  }));

  return { nodes, edges };
}

export async function lookupRequirementIds(raw: string): Promise<string[]> {
  const { canonicalizeCriterionNumber } = await import("@complifine/core");
  const trimmed = raw.trim();
  const candidates = new Set<string>([trimmed]);
  const canonical = canonicalizeCriterionNumber(trimmed);
  if (canonical) candidates.add(canonical);
  for (const prefix of ["FV-Smart", "FV-GFS"]) {
    const prefixed = canonicalizeCriterionNumber(`${prefix} ${trimmed}`);
    if (prefixed) candidates.add(prefixed);
  }
  return [...candidates];
}

type ControlNode = {
  id: string;
  kind: "control";
  code: string;
  label: string;
  subtitle: string;
  versions: number;
};

type ControlEdge = {
  id: string;
  kind: "satisfies";
  from: string;
  to: string;
};
