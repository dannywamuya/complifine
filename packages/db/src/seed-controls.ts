/**
 * Control library: what a company does to satisfy requirements, and what
 * evidence that work should produce.
 *
 * Controls are knowledge, not company rows. Each names the IFA v6 criterion
 * numbers it serves (Smart and GFS share numbering, so one number links both
 * editions) and, where the topic genuinely overlaps, ETI Base Code clauses.
 * Numbers were taken from the ingested P&Cs, not typed from memory; the seed
 * gate in `seed-forms.ts` fails if one stops resolving.
 *
 * Evidence types come from two places: every form template produces one, and
 * a short list here covers third-party documents no form produces (lab
 * reports, permits, invoices).
 *
 * Re-running replaces each control's requirement and evidence links, so a
 * mapping removed here disappears from the database too.
 */

import { eq, inArray } from "drizzle-orm";
import type { Database } from "./client.ts";
import { applicabilityQuestions, requirementVersions, standardVersions } from "./schema/index.ts";
import {
  controlEvidenceTypes,
  controlRequirements,
  controls,
  evidenceTypes,
} from "./schema/controls.ts";
import { FORM_LIBRARY } from "./form-library.ts";

interface EvidenceSeed {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

/** Evidence produced by uploading a document rather than filling a form. */
const UPLOAD_EVIDENCE: readonly EvidenceSeed[] = [
  {
    slug: "hs-induction-record",
    title: "H&S induction record",
    description: "Record that each worker received a health and safety induction before starting work.",
  },
  {
    slug: "ppe-issue-log",
    title: "PPE issue log",
    description: "What protective equipment was issued, when, and to whom.",
  },
  {
    slug: "reentry-signage-photo",
    title: "Re-entry interval signage",
    description: "Photograph showing the re-entry interval posted at the field entrance after spraying.",
  },
  {
    slug: "drinking-water-test",
    title: "Drinking water test report",
    description: "Laboratory report for potable water used by workers.",
  },
  {
    slug: "water-analysis-report",
    title: "Water analysis report",
    description: "Laboratory analysis of water used in production and postharvest, against the water risk assessment.",
  },
  {
    slug: "water-use-permit",
    title: "Water use permit",
    description: "Permit or licence for abstraction or use of water, where legally required.",
  },
  {
    slug: "hygiene-procedure",
    title: "Hygiene procedure",
    description: "Written procedure covering handwashing, toilets, and harvest hygiene.",
  },
  {
    slug: "grievance-procedure",
    title: "Grievance and disciplinary procedure",
    description: "Written procedure prohibiting harsh or inhumane treatment and explaining how workers raise a complaint.",
  },
  {
    slug: "document-control-procedure",
    title: "Document control procedure",
    description: "How documents and records are controlled, versioned and kept for at least two years.",
  },
  {
    slug: "continuous-improvement-plan",
    title: "Continuous improvement plan",
    description: "Documented improvement plan, with evidence that it is being carried out.",
  },
  {
    slug: "advisor-competence",
    title: "Technical advisor qualification",
    description: "Certificate or record showing the person who decides on inputs is competent to do so.",
  },
  {
    slug: "mrl-residue-report",
    title: "Residue (MRL) test report",
    description: "Laboratory residue analysis of registered products against destination-market MRLs.",
  },
  {
    slug: "ppp-purchase-invoices",
    title: "Plant protection product invoices",
    description: "Invoices or procurement records for all plant protection products and postharvest treatments.",
  },
];

/** Titles for evidence types more than one template produces. */
const SHARED_EVIDENCE_TITLES: Record<string, EvidenceSeed> = {
  "training-attendance-register": {
    slug: "training-attendance-register",
    title: "Training attendance register",
    description: "Dated register of who was trained, on what, and by whom.",
  },
  "equipment-maintenance-record": {
    slug: "equipment-maintenance-record",
    title: "Equipment maintenance record",
    description: "Maintenance and service carried out on equipment, trolleys and vehicles.",
  },
  "plant-monthly-checklist": {
    slug: "plant-monthly-checklist",
    title: "Monthly plant checklist",
    description: "Monthly fault check of packline and cold storage plant, with repairs.",
  },
};

export function libraryEvidenceTypes(): EvidenceSeed[] {
  const bySlug = new Map<string, EvidenceSeed>();
  for (const item of UPLOAD_EVIDENCE) bySlug.set(item.slug, item);
  for (const template of FORM_LIBRARY) {
    if (bySlug.has(template.evidence)) continue;
    bySlug.set(
      template.evidence,
      SHARED_EVIDENCE_TITLES[template.evidence] ?? {
        slug: template.evidence,
        title: template.title,
        description: template.description,
      },
    );
  }
  return [...bySlug.values()];
}

type ControlType = "policy" | "procedure" | "training" | "inspection" | "record" | "physical";

export interface ControlSeed {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly objective: string;
  readonly controlType: ControlType;
  readonly ownerRole: string;
  readonly frequency: string;
  readonly implementationGuidance: string;
  readonly reviewFrequency: string;
  /** Evidence an auditor expects; drives the gap list. */
  readonly evidence: readonly string[];
  /** Evidence that supports the control but is not on its own expected. */
  readonly supporting?: readonly string[];
  /** IFA v6 criterion numbers without the edition prefix, e.g. `32.02.01`. */
  readonly ifa: readonly string[];
  /** ETI Base Code clause numbers, e.g. `3.3`. */
  readonly eti?: readonly string[];
}

export const CONTROL_LIBRARY: readonly ControlSeed[] = [
  {
    slug: "document-control",
    title: "Document and record control",
    description: "Documents are versioned and approved, and records are kept for at least two years.",
    objective: "Auditors can trust that what they see is current and complete.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Continuous; master list reviewed annually",
    implementationGuidance: "CompliFine versions every template and generates the master list. Keep the written procedure on file.",
    reviewFrequency: "Annual",
    evidence: ["document-control-procedure"],
    ifa: ["01.01", "01.02"],
  },
  {
    slug: "self-assessment-and-corrective-action",
    title: "Internal audit and corrective action",
    description: "At least one self-assessment a year, with non-conformances closed by effective corrective action.",
    objective: "Problems are found and fixed before the certification body finds them.",
    controlType: "inspection",
    ownerRole: "compliance_manager",
    frequency: "At least annually",
    implementationGuidance: "Record each non-conformance with a grade, an owner and a close date, then the root cause and preventive action.",
    reviewFrequency: "Annual",
    evidence: ["internal-audit-ncr", "corrective-action-record"],
    ifa: ["01.03", "01.04"],
  },
  {
    slug: "continuous-improvement",
    title: "Continuous improvement plan",
    description: "A documented improvement plan, and evidence it is implemented.",
    objective: "The farm gets measurably better year on year.",
    controlType: "procedure",
    ownerRole: "owner",
    frequency: "Annual",
    implementationGuidance: "Draw actions from internal audits, complaints and incidents; review progress at management meetings.",
    reviewFrequency: "Annual",
    evidence: ["continuous-improvement-plan"],
    supporting: ["management-worker-meeting-record"],
    ifa: ["02.01", "02.02"],
  },
  {
    slug: "roles-and-competence",
    title: "Roles, responsibilities and advisor competence",
    description: "Roles that affect the standard are defined, and whoever decides on inputs is competent.",
    objective: "The right person makes each technical decision.",
    controlType: "record",
    ownerRole: "owner",
    frequency: "On appointment; reviewed annually",
    implementationGuidance: "Keep the workers overview current and the advisor's qualification on file.",
    reviewFrequency: "Annual",
    evidence: ["workers-register", "advisor-competence"],
    ifa: ["03.01", "03.02"],
  },
  {
    slug: "hs-induction-training",
    title: "Worker training",
    description: "Every worker receives recorded training in the skills their job needs, including hygiene and H&S, before starting and at intervals after.",
    objective: "Workers know the hazards of this site and how to avoid them.",
    controlType: "training",
    ownerRole: "site_manager",
    frequency: "On hiring, then at least annually and after a serious incident",
    implementationGuidance: "Keep a dated attendance register per session. Include seasonal and contractor workers.",
    reviewFrequency: "Annual",
    evidence: ["training-attendance-register"],
    supporting: ["hs-induction-record"],
    ifa: ["03.03", "03.04", "19.03", "20.01.03"],
    eti: ["3.3"],
  },
  {
    slug: "outsourcing-and-ggn-use",
    title: "Exporter agreement, segregation and GGN use",
    description: "Responsibilities between exporter and producer are agreed, certified product is segregated, and the GGN is used correctly.",
    objective: "Certified product is never mixed with or labelled as non-certified product.",
    controlType: "policy",
    ownerRole: "owner",
    frequency: "Each contract period",
    implementationGuidance: "Sign the agreement for every contract period and keep it with the GGN registration.",
    reviewFrequency: "Annual",
    evidence: ["exporter-producer-agreement"],
    ifa: ["04.01", "07.01", "17.01", "18.01"],
  },
  {
    slug: "product-specifications",
    title: "Product specifications and non-conforming product",
    description: "Harvest and quality specifications are available, and product that does not meet them is handled.",
    objective: "Only product that meets specification leaves the site.",
    controlType: "procedure",
    ownerRole: "site_manager",
    frequency: "Per season",
    implementationGuidance: "Brief every harvest lead on the specification and record it.",
    reviewFrequency: "Annual",
    evidence: ["product-specification"],
    ifa: ["05.01", "11.01"],
  },
  {
    slug: "chemical-storage-and-stock",
    title: "Chemical storage, stock and purchasing",
    description: "Plant protection products and fertilisers are stored safely, stock is tracked, and purchases are documented.",
    objective: "Every litre can be accounted for and nothing is stored where it can contaminate food.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every movement in or out",
    implementationGuidance: "Keep one stock card per product with expiry dates; reconcile against invoices.",
    reviewFrequency: "Quarterly",
    evidence: ["chemical-stock-inventory", "ppp-purchase-invoices"],
    ifa: ["05.02", "29.02.01", "32.09.01", "32.11.01"],
  },
  {
    slug: "traceability-and-mass-balance",
    title: "Traceability and production records",
    description: "Every product is traceable to the block it came from, and quantities produced and sold are recorded.",
    objective: "A consignment can be traced to its field in minutes.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every planting and harvest",
    implementationGuidance: "Record planting by block and harvest kilograms by block and day.",
    reviewFrequency: "Per season",
    evidence: ["planting-records", "harvest-record"],
    supporting: ["agronomic-activity-log"],
    ifa: ["06.01", "08.01", "08.02", "28.01.03"],
  },
  {
    slug: "recall-and-withdrawal",
    title: "Recall and withdrawal",
    description: "A recall procedure exists and is tested every year.",
    objective: "Unsafe product can be pulled back quickly and completely.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Mock recall annually",
    implementationGuidance: "Run a mock recall each year and reconcile dispatched against recalled quantities.",
    reviewFrequency: "Annual",
    evidence: ["recall-and-mock-recall-record"],
    ifa: ["09.01"],
  },
  {
    slug: "complaints",
    title: "Complaint handling",
    description: "Complaints are recorded, investigated for root cause, and closed with corrective action.",
    objective: "Every complaint leads to a fix, not just a reply.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Every complaint",
    implementationGuidance: "Record the corrective action per area (farm, packhouse, technical, transit) and the date the reply was sent.",
    reviewFrequency: "Annual",
    evidence: ["complaint-record"],
    ifa: ["10.01"],
  },
  {
    slug: "no-harsh-treatment",
    title: "Worker rights, grievance and no harsh treatment",
    description: "Workers know their rights and can raise a grievance without retaliation; abuse and intimidation are prohibited.",
    objective: "A workplace where discipline is never violence.",
    controlType: "policy",
    ownerRole: "compliance_manager",
    frequency: "Always in force; briefed at induction",
    implementationGuidance: "A short written procedure, translated if needed, and a named person who receives complaints.",
    reviewFrequency: "Annual",
    evidence: ["grievance-procedure"],
    supporting: ["management-worker-meeting-record"],
    ifa: ["10.02"],
    eti: ["9", "9.1"],
  },
  {
    slug: "worker-communication",
    title: "Management and worker communication",
    description: "Management and workers meet on health, safety and welfare.",
    objective: "Workers have a regular, recorded voice.",
    controlType: "procedure",
    ownerRole: "owner",
    frequency: "At least quarterly",
    implementationGuidance: "Hold committee meetings and keep minutes with attendance.",
    reviewFrequency: "Annual",
    evidence: ["management-worker-meeting-record"],
    ifa: ["20.04.01"],
    eti: ["2.2", "2.3"],
  },
  {
    slug: "workers-and-working-hours",
    title: "Employment records and working hours",
    description: "Every worker is recorded with start and end dates, and working time and overtime rules are defined.",
    objective: "Regular employment on recognised terms, with hours that are not excessive.",
    controlType: "record",
    ownerRole: "owner",
    frequency: "On hiring and leaving",
    implementationGuidance: "Keep the workers overview current and state regular hours, rest days and overtime rates.",
    reviewFrequency: "Annual",
    evidence: ["workers-register"],
    ifa: ["03.01"],
    eti: ["5.2", "6.1", "6.5", "8.1"],
  },
  {
    slug: "equipment-maintenance-and-calibration",
    title: "Equipment maintenance and calibration",
    description: "Equipment is fit for purpose, maintained, calibrated, and stored so it cannot contaminate product.",
    objective: "Scales weigh true, sprayers apply the label rate, and machines do not fail on the line.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Per maintenance schedule; scales quarterly, sprayers annually",
    implementationGuidance: "Record every service by serial number; calibrate against a standard weight or measured nozzle output.",
    reviewFrequency: "Annual",
    evidence: ["equipment-maintenance-record", "scale-calibration-record"],
    supporting: ["sprayer-calibration-record", "packline-inspection-record", "plant-monthly-checklist"],
    ifa: ["13.01", "13.02"],
  },
  {
    slug: "transport-and-vehicles",
    title: "Vehicles and produce transport",
    description: "Vehicles used for produce are clean and fit, and each load is checked before dispatch.",
    objective: "Produce leaves in a vehicle that cannot contaminate it.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Every load",
    implementationGuidance: "Clean vehicles before loading and inspect containers against the checklist.",
    reviewFrequency: "Annual",
    evidence: ["vehicle-cleaning-record"],
    supporting: ["produce-transport-inspection"],
    ifa: ["13.03", "07.03", "20.04.04"],
  },
  {
    slug: "food-safety-policy",
    title: "Food safety policy declaration",
    description: "The producer has signed the food safety policy declaration.",
    objective: "Management commitment to food safety is on record.",
    controlType: "policy",
    ownerRole: "owner",
    frequency: "Signed once, reviewed yearly",
    implementationGuidance: "Sign the combined food safety, worker health and wildlife policy and display it.",
    reviewFrequency: "Annual",
    evidence: ["food-safety-policy-declaration"],
    ifa: ["14.01"],
  },
  {
    slug: "hygiene",
    title: "Hygiene risk assessment, rules and inspection",
    description: "Hygiene risks are assessed, rules are signed by every handler, visitors follow them, and compliance is checked.",
    objective: "People do not contaminate produce.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Risk assessment yearly; inspection daily in season",
    implementationGuidance: "Have every worker sign the hygiene rules in a language they read, and inspect against the checklist.",
    reviewFrequency: "Annual",
    evidence: ["hygiene-risk-assessment", "hygiene-rules-acknowledgement"],
    supporting: ["hygiene-procedure", "hygiene-inspection-checklist", "visitor-register"],
    ifa: ["19.01", "19.02", "19.04"],
    eti: ["3.1"],
  },
  {
    slug: "drinking-water-and-sanitation",
    title: "Toilets, handwashing and drinking water",
    description: "Workers have clean toilets, handwashing, potable water, and places to eat and rest.",
    objective: "Meet basic welfare and hygiene conditions on site.",
    controlType: "inspection",
    ownerRole: "compliance_manager",
    frequency: "Toilets cleaned daily; water tested per risk assessment",
    implementationGuidance: "Keep the latest water test on file and record toilet cleaning daily.",
    reviewFrequency: "Monthly",
    evidence: ["toilet-cleaning-record", "drinking-water-test"],
    ifa: ["19.05", "19.06", "20.04.02"],
    eti: ["3.4"],
  },
  {
    slug: "cleaning-and-sanitation",
    title: "Cleaning of containers, equipment and premises",
    description: "Harvest containers, equipment and handling areas are cleaned on a schedule.",
    objective: "Nothing that touches produce carries contamination.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Daily during operation",
    implementationGuidance: "Use the cleaning grid that matches the site and record who cleaned and who checked.",
    reviewFrequency: "Monthly",
    evidence: ["cleaning-records"],
    supporting: [
      "crate-cleaning-record",
      "premises-cleaning-record",
      "equipment-cleaning-record",
      "consolidation-facility-checklist",
      "packline-inspection-record",
    ],
    ifa: ["19.08", "21.04", "33.01.02"],
  },
  {
    slug: "cleaning-chemicals",
    title: "Cleaning chemicals",
    description: "Detergents, chlorine and lubricants are approved, stored and issued so they cannot contaminate product.",
    objective: "Cleaning never becomes a chemical hazard.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every issue",
    implementationGuidance: "Issue cleaning chemicals against a register and keep stock reconciled.",
    reviewFrequency: "Quarterly",
    evidence: ["cleaning-chemical-issuance"],
    supporting: ["cleaning-chemical-stock"],
    ifa: ["33.01.04"],
  },
  {
    slug: "health-and-safety",
    title: "Worker health and safety",
    description: "Health and safety risks are assessed, procedures exist, workers sign the safety rules, and incidents are recorded.",
    objective: "Prevent accidents and injury.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Risk assessment yearly; incidents as they happen",
    implementationGuidance: "Assess each activity, have workers sign the safety instructions, and record every incident however minor.",
    reviewFrequency: "Annual",
    evidence: ["hs-risk-assessment", "safety-rules-acknowledgement"],
    supporting: ["accident-incident-log"],
    ifa: ["20.01.01", "20.01.02"],
    eti: ["3.1", "3.2", "3.6"],
  },
  {
    slug: "accident-and-emergency",
    title: "Accident, emergency, first aid and fire",
    description: "Emergency procedures and contacts are displayed, first aid kits are stocked, and fire equipment works.",
    objective: "When something goes wrong, everyone knows what to do and has what they need.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "First aid monthly; fire equipment weekly",
    implementationGuidance: "Display emergency contacts at every site and check first aid kits for expiry.",
    reviewFrequency: "Annual",
    evidence: ["emergency-contacts-display", "first-aid-kit-check"],
    supporting: ["fire-equipment-check", "accident-incident-log"],
    ifa: ["20.02.01", "20.02.03", "20.02.04"],
    eti: ["3.2"],
  },
  {
    slug: "ppe-and-reentry",
    title: "PPE and spray re-entry",
    description: "Workers who mix or apply plant protection products have clean, suitable PPE, and nobody re-enters a treated area before the interval expires.",
    objective: "Prevent chemical exposure during and after spraying.",
    controlType: "physical",
    ownerRole: "site_manager",
    frequency: "Every application",
    implementationGuidance: "Clean PPE after every round. Post the re-entry interval at field entry with a red flag.",
    reviewFrequency: "Per spray round / season review",
    evidence: ["ppe-cleaning-log"],
    supporting: ["ppe-issue-log", "reentry-signage-photo"],
    ifa: ["20.03.01", "20.03.02", "20.03.03", "32.10.06"],
    eti: ["3.1"],
  },
  {
    slug: "site-risk-and-management-plan",
    title: "Site risk assessment and management plan",
    description: "Every registered site has a documented risk assessment and a management plan for the risks found.",
    objective: "The land is suitable for food production and its risks are managed.",
    controlType: "procedure",
    ownerRole: "owner",
    frequency: "Annually, and before planting a new site",
    implementationGuidance: "Work through the 33 considerations and sign the declaration of land suitability.",
    reviewFrequency: "Annual",
    evidence: ["site-risk-assessment-and-management-plan"],
    ifa: ["21.01", "21.02", "21.03"],
  },
  {
    slug: "biodiversity-and-environment",
    title: "Biodiversity and environmental impact",
    description: "Environmental impacts are assessed and biodiversity on the farm is known, protected and managed.",
    objective: "Farming does not degrade the landscape around it.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Annual",
    implementationGuidance: "Record a fauna and flora baseline and update the impact assessment each year.",
    reviewFrequency: "Annual",
    evidence: ["environmental-impact-assessment", "biodiversity-baseline-audit"],
    ifa: ["22.01.01", "22.01.02", "22.03.01"],
  },
  {
    slug: "energy-efficiency",
    title: "Energy monitoring and efficiency",
    description: "On-farm energy use is monitored and there is a plan to use less.",
    objective: "Energy use is known and falling.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every purchase and issue",
    implementationGuidance: "Record fuel and electricity in and out, then set an efficiency target.",
    reviewFrequency: "Annual",
    evidence: ["energy-use-record"],
    ifa: ["23.01", "23.02"],
  },
  {
    slug: "waste-management",
    title: "Waste and pollution management",
    description: "Waste and pollution sources are identified across the farm and each has a disposal route.",
    objective: "Every waste stream goes somewhere safe.",
    controlType: "procedure",
    ownerRole: "site_manager",
    frequency: "Annual review",
    implementationGuidance: "List each waste, its source and its disposal procedure, including plastics.",
    reviewFrequency: "Annual",
    evidence: ["waste-management-plan"],
    ifa: ["25.01", "25.02", "25.08"],
  },
  {
    slug: "fertiliser-management",
    title: "Fertiliser application",
    description: "Every fertiliser and biostimulant application is recorded with product, nutrient content, rate, method, operator and advisor.",
    objective: "Nutrients are applied deliberately and traceably.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every application",
    implementationGuidance: "Record per block. The advisor must be competent and sign the record.",
    reviewFrequency: "Per season",
    evidence: ["fertilizer-application-record"],
    ifa: ["29.01.01", "29.01.02", "29.01.03", "29.01.04", "29.01.05", "29.01.06", "29.04.01"],
  },
  {
    slug: "water-risk-and-use",
    title: "Water risk assessment, plan and use",
    description: "Water risks are assessed, there is a water management plan, permits are held, and water use is measured.",
    objective: "Water is used legally, safely and efficiently.",
    controlType: "procedure",
    ownerRole: "owner",
    frequency: "Plan yearly; irrigation every event",
    implementationGuidance: "Work through the water considerations, keep the permit on file, and record every irrigation.",
    reviewFrequency: "Annual",
    evidence: ["water-risk-assessment-and-plan", "irrigation-record"],
    supporting: ["water-use-permit"],
    ifa: ["30.01.01", "30.01.02", "30.01.03", "30.02.01", "30.06.01", "30.06.02"],
  },
  {
    slug: "water-quality-and-storage",
    title: "Water quality and storage",
    description: "Water is analysed per the risk assessment, contact water meets drinking standard, and storage does not contaminate it.",
    objective: "Water never carries a food safety risk onto produce.",
    controlType: "inspection",
    ownerRole: "compliance_manager",
    frequency: "Analysis per risk assessment; tanks cleaned quarterly",
    implementationGuidance: "Keep laboratory reports on file and record tank cleaning.",
    reviewFrequency: "Annual",
    evidence: ["water-analysis-report", "water-tank-cleaning-record"],
    ifa: ["30.04.02", "30.05.01", "30.05.02", "30.05.04"],
  },
  {
    slug: "integrated-pest-management",
    title: "Integrated pest management",
    description: "Crops are scouted against thresholds, prevention measures are used, and interventions are justified.",
    objective: "Spray only when monitoring says so.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Scouting weekly in season",
    implementationGuidance: "Scout each block, compare against economic thresholds, and record the spray decision.",
    reviewFrequency: "Per season",
    evidence: ["pest-scouting-record"],
    supporting: ["trap-installation-record"],
    ifa: ["31.02", "31.04", "31.05", "31.06"],
  },
  {
    slug: "ppp-selection-and-mrl",
    title: "Authorised products and residue limits",
    description: "Only products authorised in the country are used, MRLs for destination markets are known, and residues are tested.",
    objective: "No unauthorised product, no MRL exceedance.",
    controlType: "procedure",
    ownerRole: "compliance_manager",
    frequency: "Product list yearly; residue tests per risk assessment",
    implementationGuidance: "Keep the approved list current for each crop and market, and file residue reports.",
    reviewFrequency: "Annual",
    evidence: ["approved-ppp-list"],
    supporting: ["mrl-residue-report"],
    ifa: ["32.01.01", "32.07.01", "32.07.02", "32.07.03"],
  },
  {
    slug: "ppp-application",
    title: "Plant protection product application",
    description: "Every application is recorded with justification, product, rate, weather, PHI and operator, and applied per the label.",
    objective: "Every spray is justified, correct and traceable.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every application",
    implementationGuidance: "Record before the operator leaves the block. Calculate the PHI clear date and re-entry date.",
    reviewFrequency: "Per spray round",
    evidence: ["ppp-application-record"],
    supporting: ["sprayer-calibration-record"],
    ifa: ["32.01.02", "32.02.01", "32.02.02", "32.03.01", "32.10.02"],
  },
  {
    slug: "ppp-disposal",
    title: "Disposal of containers, surplus mix and obsolete products",
    description: "Empty containers are triple rinsed and disposed of safely; surplus mix and obsolete products go through approved routes.",
    objective: "Chemical waste never reaches people, water or soil.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every disposal",
    implementationGuidance: "Record what was disposed of, how, and who authorised it.",
    reviewFrequency: "Per season",
    evidence: ["empty-container-disposal-record"],
    supporting: ["surplus-mix-disposal-record", "obsolete-ppp-disposal-record"],
    ifa: ["32.04.01", "32.04.04", "32.05.01", "32.06.01"],
  },
  {
    slug: "storage-conditions",
    title: "Product storage and temperature",
    description: "Harvested and packed product is stored under controlled conditions that are monitored.",
    objective: "Product stays safe and in specification in storage.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Every two hours while product is stored",
    implementationGuidance: "Record cold room temperature against the target range and note any action.",
    reviewFrequency: "Monthly",
    evidence: ["temperature-monitoring-record"],
    ifa: ["33.01.01", "33.03.01"],
  },
  {
    slug: "packaging-materials",
    title: "Packaging materials",
    description: "Packaging is fit for use, stored away from contamination, and stock is tracked.",
    objective: "Packaging protects product rather than contaminating it.",
    controlType: "record",
    ownerRole: "site_manager",
    frequency: "Every receipt and issue",
    implementationGuidance: "Record packaging in and out of the store.",
    reviewFrequency: "Quarterly",
    evidence: ["packaging-stock-record"],
    ifa: ["33.01.03"],
  },
  {
    slug: "foreign-material",
    title: "Glass, brittle plastic and foreign material",
    description: "Glass and hard plastic are registered and inspected, and there is a procedure if breakage occurs.",
    objective: "No foreign material ends up in product.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Weekly",
    implementationGuidance: "Inspect every registered item by location and record breakages.",
    reviewFrequency: "Annual",
    evidence: ["glass-hard-plastic-register"],
    ifa: ["33.02.01", "33.02.02"],
  },
  {
    slug: "premises-pest-control",
    title: "Pest control in handling and storage areas",
    description: "A pest management plan is implemented, with records of inspections and corrective actions.",
    objective: "Rodents, birds and insects are kept away from product.",
    controlType: "inspection",
    ownerRole: "site_manager",
    frequency: "Weekly",
    implementationGuidance: "Check bait stations and insectocutors, record findings and corrections.",
    reviewFrequency: "Annual",
    evidence: ["pest-control-inspection-record"],
    ifa: ["19.07", "33.04.01", "33.04.02"],
  },
];

const SMETA_PROFILE = [
  {
    guid: "complifine:smeta-labour-providers",
    number: 1,
    text: "Does this site use labour providers or labour brokers?",
    justification: "Labour-provider arrangements change which ETI clauses and SMETA WRs an auditor will sample.",
  },
  {
    guid: "complifine:smeta-worker-count",
    number: 2,
    text: "Are more than five workers employed at this site, including seasonal workers?",
    justification: "Worker-count band is a SMETA site-profile field until official SAQ answers are stored.",
  },
  {
    guid: "complifine:smeta-accommodation",
    number: 3,
    text: "Does the site provide worker accommodation?",
    justification: "ETI 3.5 applies where accommodation is provided.",
  },
] as const;

/** Source requirement ids a control links to, across both IFA editions and ETI. */
export function controlIdentifiers(control: ControlSeed): string[] {
  return [
    ...control.ifa.flatMap((number) => [`FV-Smart ${number}`, `FV-GFS ${number}`]),
    ...(control.eti ?? []).map((number) => `ETI ${number}`),
  ];
}

export async function seedControls(db: Database): Promise<{ controls: number; links: number }> {
  for (const item of libraryEvidenceTypes()) {
    await db
      .insert(evidenceTypes)
      .values(item)
      .onConflictDoUpdate({
        target: evidenceTypes.slug,
        set: { title: item.title, description: item.description, updatedAt: new Date() },
      });
  }

  const evidenceRows = await db.select().from(evidenceTypes);
  const evidenceBySlug = new Map(evidenceRows.map((row) => [row.slug, row.id]));

  let linkCount = 0;

  for (const item of CONTROL_LIBRARY) {
    const values = {
      slug: item.slug,
      title: item.title,
      description: item.description,
      objective: item.objective,
      controlType: item.controlType,
      ownerRole: item.ownerRole,
      frequency: item.frequency,
      implementationGuidance: item.implementationGuidance,
      reviewFrequency: item.reviewFrequency,
    };
    const [control] = await db
      .insert(controls)
      .values(values)
      .onConflictDoUpdate({ target: controls.slug, set: { ...values, updatedAt: new Date() } })
      .returning();
    if (!control) continue;

    await db.delete(controlEvidenceTypes).where(eq(controlEvidenceTypes.controlId, control.id));
    const expected = [
      ...item.evidence.map((slug) => ({ slug, mandatory: true })),
      ...(item.supporting ?? []).map((slug) => ({ slug, mandatory: false })),
    ];
    for (const { slug, mandatory } of expected) {
      const evidenceId = evidenceBySlug.get(slug);
      if (!evidenceId) throw new Error(`Control ${item.slug} names unknown evidence type ${slug}`);
      await db
        .insert(controlEvidenceTypes)
        .values({ controlId: control.id, evidenceTypeId: evidenceId, mandatory })
        .onConflictDoNothing();
    }

    await db.delete(controlRequirements).where(eq(controlRequirements.controlId, control.id));
    const versions = await db
      .select({ id: requirementVersions.id })
      .from(requirementVersions)
      .where(inArray(requirementVersions.sourceRequirementId, controlIdentifiers(item)));

    for (const version of versions) {
      await db
        .insert(controlRequirements)
        .values({ controlId: control.id, requirementVersionId: version.id })
        .onConflictDoNothing();
      linkCount += 1;
    }
  }

  await seedSmetaProfileQuestions(db);

  return { controls: CONTROL_LIBRARY.length, links: linkCount };
}

async function seedSmetaProfileQuestions(db: Database): Promise<void> {
  const versions = await db
    .select()
    .from(standardVersions)
    .where(inArray(standardVersions.code, ["smeta-7-2-pillar", "smeta-7-4-pillar"]));

  for (const version of versions) {
    for (const question of SMETA_PROFILE) {
      await db
        .insert(applicabilityQuestions)
        .values({
          standardVersionId: version.id,
          sourceGuid: question.guid,
          sourceNumber: question.number,
          questionText: question.text,
          justificationTemplate: question.justification,
          exemptingAnswer: "no",
          displayOrder: question.number,
        })
        .onConflictDoUpdate({
          target: [applicabilityQuestions.standardVersionId, applicabilityQuestions.sourceGuid],
          set: {
            questionText: question.text,
            justificationTemplate: question.justification,
            displayOrder: question.number,
            updatedAt: new Date(),
          },
        });
    }
  }
}
