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
