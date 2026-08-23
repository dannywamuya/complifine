export const TOOL_LABELS: Record<string, string> = {
  searchRequirements: "Searching criteria",
  getRequirement: "Opening a criterion",
  listSections: "Listing sections",
  getSection: "Reading a section",
  getApplicability: "Checking applicability",
  filterChecklist: "Resolving the checklist",
  compareEditions: "Comparing Smart and GFS",
  compareStandards: "Comparing mapped controls",
  searchGeneralRegulations: "Searching the General Regulations",
  getDocument: "Opening a document",
  getCompanyContext: "Reading the company profile",
  listMySites: "Listing sites",
  getSiteProfile: "Opening a site profile",
  getMyApplicableRequirements: "Resolving saved applicability",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}
