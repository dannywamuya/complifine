export const EDITIONS = [
  { value: "ifa-v6-smart-fv", label: "IFA v6 Smart" },
  { value: "ifa-v6-gfs-fv", label: "IFA v6 GFS" },
  { value: "smeta-7-2-pillar", label: "SMETA 7.0 2-pillar" },
  { value: "smeta-7-4-pillar", label: "SMETA 7.0 4-pillar" },
] as const;

export type EditionCode = (typeof EDITIONS)[number]["value"];
