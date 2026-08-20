export const EDITIONS = [
  { value: "ifa-v6-smart-fv", label: "IFA v6 Smart" },
  { value: "ifa-v6-gfs-fv", label: "IFA v6 GFS" },
] as const;

export type EditionCode = (typeof EDITIONS)[number]["value"];
