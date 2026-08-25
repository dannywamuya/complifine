export interface Me {
  id: string;
  email: string;
  name: string;
  kind: string;
  orgId: string | null;
  role: string | null;
}

export interface FarmSite {
  id: string;
  name: string;
  siteType: string;
  location: string | null;
}

export interface FarmScope {
  id: string;
  code: string;
  name: string;
  edition: string;
}

export interface FarmOrg {
  id: string;
  name: string;
  country: string;
  sedexZc: string | null;
}

export interface OrgPayload {
  organization: FarmOrg | null;
  sites: FarmSite[];
  scopes: FarmScope[];
  role: string | null;
}

export const SITE_TYPE_LABELS: Record<string, string> = {
  farm: "Farm",
  packhouse: "Packhouse",
  collection_centre: "Collection centre",
  warehouse: "Warehouse",
};

export const SITE_TYPE_HELP: Record<string, string> = {
  farm: "Growing and harvest. Scoping answers here are about the fields.",
  packhouse: "Packing, grading, or processing. Different rules often apply than at a growing site.",
  collection_centre: "A hub that receives produce from growing sites.",
  warehouse: "Storage before dispatch.",
};

/** True until the company has at least one certification and one site. */
export function needsSetup(payload: OrgPayload | null | undefined): boolean {
  if (!payload?.organization) return true;
  return payload.scopes.length === 0 || payload.sites.length === 0;
}

export const ORG_CHANGED = "cf-org-changed";
