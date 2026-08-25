/** Operator-facing labels for the knowledge catalog. Keep in sync with VERSION_STATUS_GUIDANCE. */

export function documentFetchLabel(status: string): string {
  if (status === "registered") return "Not fetched";
  if (status === "fetched") return "On file";
  return status.replaceAll("_", " ");
}

export function editionLane(status: string): "live" | "pipeline" | "retired" {
  if (status === "published") return "live";
  if (status === "retired") return "retired";
  return "pipeline";
}

export function laneLabel(status: string): string {
  const lane = editionLane(status);
  if (lane === "live") return "Live";
  if (lane === "retired") return "Retired";
  return "In pipeline";
}

export const STATUS_STORY: Record<string, { headline: string; detail: string }> = {
  draft: {
    headline: "Not ingested yet",
    detail: "Registered in the catalog. Run Registry, then Fetch through Gates on Ingest.",
  },
  ingesting: {
    headline: "Ingest in progress",
    detail: "Wait for the running job, then continue until criteria are extracted.",
  },
  extracted: {
    headline: "Extracted — not live",
    detail: "Criteria are in the database. Producers cannot see them until a human publishes.",
  },
  validation: {
    headline: "Waiting on quality gates",
    detail: "Fix every blocking gate, then send the edition to review.",
  },
  review: {
    headline: "Needs a named human decision",
    detail: "Record approved, rejected, or changes requested before this can go live.",
  },
  approved: {
    headline: "Approved — ready to publish",
    detail: "A reviewer has signed off. Publish when producers and the agent should cite this.",
  },
  published: {
    headline: "Live",
    detail: "Producers and the agent may cite this edition.",
  },
  retired: {
    headline: "Retired",
    detail: "Hidden from producers. This is a terminal state.",
  },
};

export function nextStep(status: string, code: string): { href: string; label: string } {
  switch (status) {
    case "draft":
      return { href: `/ingest?version=${code}`, label: "Register and ingest" };
    case "ingesting":
      return { href: `/ingest?version=${code}`, label: "Continue ingest" };
    case "extracted":
    case "validation":
      return { href: `/gates?version=${code}`, label: "Check quality gates" };
    case "review":
      return { href: `/review?version=${code}`, label: "Record a review" };
    case "approved":
      return { href: `/review?version=${code}`, label: "Publish when ready" };
    case "published":
      return { href: `/criteria?version=${code}`, label: "Browse criteria" };
    case "retired":
      return { href: `/versions/${code}`, label: "Inspect retired edition" };
    default:
      return { href: `/versions/${code}`, label: "Open edition" };
  }
}

/** Prefer Smart → GFS when both exist; otherwise the first two editions of one standard. */
export function defaultComparePair(
  versions: Array<{ code: string; name: string; standardCode: string }>,
): { from?: string; to?: string } {
  const named = (hint: RegExp) =>
    versions.find((version) => hint.test(version.code) || hint.test(version.name));
  const smart = named(/smart/i);
  const gfs = named(/gfs/i);
  if (smart && gfs && smart.code !== gfs.code) {
    return { from: smart.code, to: gfs.code };
  }
  const from = versions[0]?.code;
  const to =
    versions.find((version) => version.code !== from && version.standardCode === versions[0]?.standardCode)
      ?.code ?? versions.find((version) => version.code !== from)?.code;
  return { from, to };
}
