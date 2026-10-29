/**
 * The form-template library.
 *
 * Built from one Kenyan exporter's GLOBALG.A.P. quality-management forms
 * (AFREX GOLD, farm `GG/FARM/RECnn` and packhouse `AFG-PH nn`), de-duplicated
 * and generalised. Company-specific content — the avocado pest list, packline
 * parts, glass locations — lives in `optionLists` and `fixedItems` defaults so
 * an organisation variant can replace it without touching columns.
 *
 * Templates name an evidence type and nothing else about standards. The
 * control library maps evidence types to requirements of any standard.
 */

import type {
  FormCadence,
  FormCategory,
  FormDefinition,
  FormField,
  FormFixedItem,
  SiteType,
} from "@complifine/core";

export interface TemplateSeed {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly category: FormCategory;
  readonly cadence: FormCadence;
  readonly siteTypes: readonly SiteType[];
  /** Evidence type slug this template produces. */
  readonly evidence: string;
  readonly sourceRef: string | null;
  readonly definition: FormDefinition;
}

type Opts = Partial<Omit<FormField, "key" | "label" | "type">>;

const text = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "text", ...o });
const long = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "longtext", ...o });
const num = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "number", ...o });
const date = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "date", ...o });
const time = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "time", ...o });
const bool = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "boolean", ...o });
const person = (key: string, label: string, o: Opts = {}): FormField => ({ key, label, type: "person", ...o });
const pick = (key: string, label: string, options: readonly string[], o: Opts = {}): FormField => ({
  key,
  label,
  type: "select",
  options,
  ...o,
});
const fromList = (key: string, label: string, optionList: string, o: Opts = {}): FormField => ({
  key,
  label,
  type: "select",
  optionList,
  ...o,
});

const req = { required: true } as const;

const items = (labels: readonly string[], group?: string): FormFixedItem[] =>
  labels.map((label) => ({
    key: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48),
    label,
    ...(group ? { group } : {}),
  }));

const FARM: readonly SiteType[] = ["farm"];
const FIELD: readonly SiteType[] = ["farm", "collection_centre"];
const PACKHOUSE: readonly SiteType[] = ["packhouse"];
const ALL: readonly SiteType[] = ["farm", "packhouse", "collection_centre", "warehouse"];

const RISK = ["Low", "Medium", "High"] as const;
const YES_NO_NA = ["Yes", "No", "N/A"] as const;
const OK_NOT_OK = ["OK", "Not OK", "N/A"] as const;
const GRADES = ["Major Must", "Minor Must", "Recommendation"] as const;

const AVOCADO_PESTS = [
  "False codling moth (FCM)",
  "Fruit fly (Bactrocera spp.)",
  "Fruit fly (Ceratitis spp.)",
  "Thrips",
  "Persea mites",
  "Aphids",
  "White wax scale (Ceroplastes destructor)",
  "West Indian red scale (Selenaspidus articulatus)",
  "Scales",
  "Fruit spotting bug",
  "Cut worm",
  "Caterpillars (loopers, leaf roller)",
  "Systates weevils",
  "White flies",
  "Mosquito bug",
  "Anthracnose",
  "Cercospora spot",
  "Black spot",
  "Root rot",
];

const PACKLINE_PARTS = [
  "Water flume",
  "Roller elevator",
  "Ozone brush unit",
  "Brush drying unit",
  "Brush waxing unit",
  "Brushing unit water flumes",
  "Drying tunnel",
  "Drying tunnel rollers",
  "Unequal belt conveyor",
  "Transfer belt",
  "Roller sorting table and reject belts",
  "Sizer feed belt",
  "Pre-singulator",
  "Transfer brush",
  "Weight sizer / singulator",
  "Sizer cups",
  "Pack bins and stands",
  "Reject fruit conveyor",
  "Full carton conveyors",
  "Palletizing conveyor",
  "Electrical motors",
];

const HYGIENE_RULES_EN = `All personnel handling produce must adhere to the following rules:
- Maintain a high standard of personal hygiene and keep personal clothing clean.
- Wash hands before handling produce, at the start of the day, after using the toilet, and before and after eating or drinking.
- Cover hair completely before handling produce. Wear the provided uniform when handling produce.
- Keep fingernails short and clean. No nail polish.
- No jewellery (plain wedding bands excepted), watches, earrings or nose studs. No lipstick, false eyelashes or perfume.
- Treat and bandage any sores, cuts or grazes before reporting for duty, and tell your supervisor.
- After suspension for illness, present a doctor's clearance before returning to work.
- Do not smoke, eat, drink, chew gum or spit while working with produce, in the field or the grading shed.
- Keep grading areas, chopping boards, knives and tables clean.
- Report every accident or incident so it is recorded in the incident book.
- Children and animals are excluded from picking and grading areas.
I have read the above rules and will adhere to them at all times.`;

const HYGIENE_RULES_SW = `Maagizo yafuatayo yatatekelezwa na kila mfanyikazi:
- Hakuna ruhusa ya kuvuna sehemu za shamba zilizowekwa bendera nyekundu au ya manjano.
- Nawa mikono kabla ya kuanza kuvuna, ukitoka chooni, ukitoka mapumziko na baada ya kula.
- Hakuna kuvaa mikufu, saa, vipuli au shanga isipokuwa pete ya ndoa.
- Kucha ziwe safi na fupi. Hakuna kupaka rangi kucha.
- Chakula na vinywaji haviruhusiwi shambani. Usivute sigara shambani.
- Ajali zote ziripotiwe kwa mhudumu wa huduma ya kwanza.
- Anayeugua homa, vidonda, ugonjwa wa ngozi, kuhara au kutapika hataruhusiwa kuvuna.
- Usitupe takataka ovyo. Vifaa vya kuvuna vitasafishwa kila siku baada ya kazi.
Nimesoma/nimefunzwa, nimeelewa kanuni hizi na nitazitekeleza.`;

const SAFETY_EN = `It is the responsibility of every worker, visitor and contractor to work safely and not put themselves or others at risk.
- Report every hazard, dangerous occurrence or accident immediately to the nearest first aider, supervisor or manager. Record every accident, however minor.
- Know the farm equipment routes and all restricted areas, such as sprayed blocks.
- Keep personal belongings in the designated area, never in crop handling areas.
- Wear protective clothing where instructed, without exception, for example when working with pesticides.
- Follow manufacturers' instructions when working with tractors, pumps and other equipment.
- Blocks under re-entry restriction are marked with a red flag; blocks under pre-harvest interval with a yellow flag.
- Visitors and contractors are instructed on site rules and accompanied by management.
I have read and/or been trained on the above and will comply at all times.`;

const SAFETY_SW = `Ni jukumu la kila mfanyikazi kufanya kazi kwa usalama na kujiepusha yeye na wengine na hatari.
- Hatari na ajali zote, hata ndogo, ziripotiwe kwa mhudumu wa huduma ya kwanza au msimamizi.
- Mali ya kibinafsi iwekwe pahali palipotengwa.
- Vaa mavazi ya kujikinga kulingana na maagizo.
- Fuata maagizo ya mtengenezaji wa gari, vifaa na mashine.
- Hakuna kuingia mahali palipofungwa, palipo na ilani ya hatari au bendera nyekundu.
- Wageni wataandamana na msimamizi wa shamba.
Nimefunzwa, nimeelewa kanuni hizi na nitazitekeleza.`;

const POLICY_TEXT = `Food safety policy — [Company] is committed to addressing all aspects of its performance with regard to food safety through a food safety management system based on HACCP principles.

Worker health and safety policy — [Company] recognises that healthy workers are vital to its business and will provide a safe working environment, operating within Kenyan law, the requirements of GLOBALG.A.P., and those of its customers.

Wildlife conservation and environmental policy — [Company] supports the conservation of wildlife and the environment through cautious use of pesticides, responsible use of water, improvement of biodiversity, and sustained control of erosion.`;

const VISITOR_RULES = `All visitors abide by the following while on the farm:
- Do not walk around unaccompanied without prior permission from management.
- Wash hands with soap and running water at the handwashing facilities.
- No smoking or eating except in the authorised area. No jewellery in harvesting and produce holding areas.
- Report any accident to the person in charge or the first aider on duty.
- Restricted areas (cropping areas, field sheds, produce holding) need the farmer's authorisation. Wear protective clothing where provided.
- Do not handle crops, produce, tools or equipment unless authorised. Do not bring planting materials or pesticides onto the farm.
- Put litter in the bins or waste pits provided.`;

const AGREEMENT_TEXT = `The farmer agrees to produce horticultural produce as agreed between the two parties, and carries out seed selection, land preparation, planting, spraying, harvesting and delivery.
The exporter plans delivery days and times, follows best practice in traceability and labelling, and does not label other farms' products with the farmer's GGN or mix the farmer's certified product with non-certified product.
The exporter advises on product specifications through its technical advisor; the farmer ensures the specifications are met.
Both parties adhere to the GLOBALG.A.P. standard, documented procedures, policies, technical advice, and any sanctions applied where requirements are not met, and do not use the GLOBALG.A.P. Number for non-certified product.`;

const HARVEST_SPEC = `Field operation: harvest the whole block, detaching fruit by hand. Leave rotten, diseased and heavily infested fruit for separate disposal. Place fruit in clean crates on pallets or spacer crates so produce never touches the soil, and shade harvested produce while it waits for transport.
Appearance: only fruit that is intact, sound, clean, free of foreign smell, free of pest damage and skin defects, with a pedicel no longer than 10 mm, and mature enough to ripen normally is graded and packed into clean customer crates.
Size codes follow customer requirements.`;

export const FORM_LIBRARY: readonly TemplateSeed[] = [
  // -------------------------------------------------------------------------
  // Policies and declarations
  // -------------------------------------------------------------------------
  {
    slug: "food-safety-health-wildlife-policy",
    title: "Food safety, worker health and wildlife policy",
    description: "Signed policy declaration covering food safety, worker health and safety, and wildlife conservation.",
    category: "policy",
    cadence: "once",
    siteTypes: ALL,
    evidence: "food-safety-policy-declaration",
    sourceRef: "AFREX GG/FARM/REC06",
    definition: {
      layout: "policy",
      body: { en: POLICY_TEXT },
      headerFields: [text("company", "Company or farm", req)],
      entryFields: [person("signed_by", "Signed by", req), text("position", "Position"), date("date", "Date", req)],
    },
  },
  {
    slug: "visitor-rules",
    title: "Visitor rules and register",
    description: "Visitor rules each visitor signs on arrival, with time in and out.",
    category: "policy",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "visitor-register",
    sourceRef: "AFREX GG/FARM/REC07",
    definition: {
      layout: "policy",
      body: { en: VISITOR_RULES },
      headerFields: [],
      entryFields: [
        person("visitor", "Visitor name", req),
        text("company", "Company"),
        date("date", "Date", req),
        time("time_in", "Time in"),
        time("time_out", "Time out"),
        bool("acknowledged", "Read and signed the rules", req),
      ],
    },
  },
  {
    slug: "hygiene-rules",
    title: "Hygiene rules acknowledgement",
    description: "Hygiene rules every produce handler reads and signs, in English or Swahili.",
    category: "policy",
    cadence: "once",
    siteTypes: ALL,
    evidence: "hygiene-rules-acknowledgement",
    sourceRef: "AFREX GG/DOC/REC35, REC35B",
    definition: {
      layout: "policy",
      body: { en: HYGIENE_RULES_EN, sw: HYGIENE_RULES_SW },
      headerFields: [],
      entryFields: [
        person("worker", "Worker name", req),
        pick("language", "Language read", ["English", "Swahili"]),
        date("date", "Date", req),
        bool("acknowledged", "Signed", req),
      ],
    },
  },
  {
    slug: "safety-instructions",
    title: "Safety instructions acknowledgement",
    description: "Farm safety instructions every worker, visitor and contractor reads and signs.",
    category: "policy",
    cadence: "once",
    siteTypes: ALL,
    evidence: "safety-rules-acknowledgement",
    sourceRef: "AFREX GG/DOC/REC36, REC36B",
    definition: {
      layout: "policy",
      body: { en: SAFETY_EN, sw: SAFETY_SW },
      headerFields: [],
      entryFields: [
        person("worker", "Name", req),
        pick("language", "Language read", ["English", "Swahili"]),
        date("date", "Date", req),
        bool("acknowledged", "Signed", req),
      ],
    },
  },
  {
    slug: "exporter-farmer-agreement",
    title: "Exporter and farmer agreement",
    description: "Contract covering production responsibilities, traceability, and correct use of the GGN.",
    category: "policy",
    cadence: "annual",
    siteTypes: FIELD,
    evidence: "exporter-producer-agreement",
    sourceRef: "AFREX GG/FARM/REC21",
    definition: {
      layout: "policy",
      body: { en: AGREEMENT_TEXT },
      headerFields: [
        text("exporter", "Exporter", req),
        text("farmer", "Farmer", req),
        text("ggn", "Farmer GGN"),
        date("period_from", "Contract from", req),
        date("period_to", "Contract to", req),
      ],
      entryFields: [
        person("signatory", "Signed by", req),
        pick("party", "Party", ["Exporter", "Farmer"], req),
        date("date", "Date", req),
      ],
    },
  },
  {
    slug: "harvest-specification",
    title: "Harvesting specification",
    description: "How produce is harvested and the appearance and size specification it must meet.",
    category: "policy",
    cadence: "once",
    siteTypes: FIELD,
    evidence: "product-specification",
    sourceRef: "AFREX GG/FARM/REC40",
    definition: {
      layout: "policy",
      body: { en: HARVEST_SPEC },
      headerFields: [text("crop", "Crop", req), text("reference", "Reference")],
      entryFields: [person("briefed", "Harvest lead briefed", req), date("date", "Date", req)],
    },
  },

  // -------------------------------------------------------------------------
  // Plans and risk assessments
  // -------------------------------------------------------------------------
  {
    slug: "farm-management-plan",
    title: "Site risk assessment and farm management plan",
    description: "Thirty-three site considerations, each with the risk found, an action plan and a time period.",
    category: "plan",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "site-risk-assessment-and-management-plan",
    sourceRef: "AFREX GG/FARM/REC14",
    definition: {
      layout: "plan",
      headerFields: [
        text("location", "Geographical location", req),
        long("declaration", "Declaration of land suitability for food production"),
        person("signed_by", "Signed by", req),
        date("date", "Date", req),
      ],
      entryFields: [
        pick("risk", "Risk", RISK, req),
        long("action_plan", "Action plan"),
        text("time_period", "Time period"),
      ],
      fixedItems: items([
        "Land ownership (title deed or lease)",
        "Previous crops and residual herbicides",
        "Previous industrial or military use",
        "Landfill or mining sites",
        "Natural vegetation harbouring pests",
        "Structural suitability for the crop",
        "Structural susceptibility to soil erosion",
        "Chemical suitability for the crop",
        "Erosion and loss of topsoil",
        "Landform",
        "Drainage patterns and flooding",
        "Conformation and slope",
        "Safety of persons operating machinery",
        "Wind exposure",
        "Water quality (laboratory)",
        "Water availability through the season",
        "Authorisation for water use",
        "Water rights of other users",
        "Dust, smoke and noise from machinery",
        "Downstream contamination by run-off or drift",
        "Flooding",
        "Insects attracted by crop, wastes or manure",
        "Smoke, fumes and dust from nearby industry or roads",
        "Run-off from upstream farming",
        "Pests from nearby natural or conservation areas",
        "Theft by nearby communities",
        "Environmental impact of water use",
        "Damage to natural vegetation (flora)",
        "Injury to animals or micro-organisms (fauna)",
        "Effect on adjacent crops",
        "Effect on adjacent livestock",
        "Effect on people nearby",
        "Sabotage or intentional threat",
      ]),
    },
  },
  {
    slug: "hygiene-risk-assessment",
    title: "Hygiene risk assessment",
    description: "Hygiene hazards for each activity and area, with the control measure for each.",
    category: "plan",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "hygiene-risk-assessment",
    sourceRef: null,
    definition: {
      layout: "table",
      headerFields: [person("assessed_by", "Assessed by", req), date("date", "Date", req)],
      entryFields: [
        text("activity", "Activity or area", req),
        long("hazard", "Hazard", req),
        pick("risk", "Risk", RISK, req),
        long("control", "Control measure", req),
        person("responsible", "Responsible"),
      ],
    },
  },
  {
    slug: "health-safety-risk-assessment",
    title: "Worker health and safety risk assessment",
    description: "Health and safety hazards, who is at risk, and the control for each.",
    category: "plan",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "hs-risk-assessment",
    sourceRef: null,
    definition: {
      layout: "table",
      headerFields: [person("assessed_by", "Assessed by", req), date("date", "Date", req)],
      entryFields: [
        text("activity", "Activity or area", req),
        long("hazard", "Hazard", req),
        text("who", "Who is at risk"),
        pick("risk", "Risk", RISK, req),
        long("control", "Control measure", req),
      ],
    },
  },
  {
    slug: "environmental-impact-assessment",
    title: "Environmental impact assessment",
    description: "Farm activities, their environmental aspects and impacts, and mitigation.",
    category: "plan",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "environmental-impact-assessment",
    sourceRef: "AFREX GG/FARM/REC15",
    definition: {
      layout: "table",
      headerFields: [text("location", "Geographical location"), person("done_by", "Assessment by", req), date("date", "Date", req)],
      entryFields: [
        text("activity", "Farm activity", req),
        text("aspect", "Environmental aspect", req),
        text("impact", "Environmental impact", req),
        long("mitigation", "Notes and mitigation"),
      ],
    },
  },
  {
    slug: "waste-pollutant-plan",
    title: "Waste and pollutants management plan",
    description: "Each waste or pollutant, where it comes from, and how it is managed and disposed of.",
    category: "plan",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "waste-management-plan",
    sourceRef: "AFREX GG/FARM/REC16",
    definition: {
      layout: "table",
      headerFields: [num("year", "Year", req), person("prepared_by", "Prepared by", req), date("date", "Date")],
      entryFields: [
        text("waste", "Waste or pollutant", req),
        text("source", "Source"),
        long("plan", "Management plan and disposal", req),
      ],
    },
  },
  {
    slug: "biodiversity-baseline",
    title: "Fauna and flora baseline audit",
    description: "Animals and plants found on the farm, by location, with approximate population.",
    category: "plan",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "biodiversity-baseline-audit",
    sourceRef: "AFREX GG/FARM/REC17",
    definition: {
      layout: "table",
      headerFields: [text("farm_code", "Farm code"), person("conducted_by", "Audit by", req), date("date", "Date", req)],
      entryFields: [
        text("location", "Location"),
        text("name", "Common name of animal or plant", req),
        text("family", "Family"),
        text("population", "Approximate population"),
        text("notes", "Notes"),
      ],
    },
  },
  {
    slug: "water-management-plan",
    title: "Water risk assessment and management plan",
    description: "Seventeen water considerations, each with the hazard, who is affected, risk and action plan.",
    category: "plan",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "water-risk-assessment-and-plan",
    sourceRef: "AFREX GG/FARM/REC25",
    definition: {
      layout: "plan",
      headerFields: [
        text("location", "Geographical location"),
        text("water_source", "Water source", req),
        person("signed_by", "Signed by", req),
        date("date", "Date", req),
      ],
      entryFields: [
        text("hazard", "Hazard"),
        text("who", "Who or what"),
        pick("risk", "Risk", RISK, req),
        long("action_plan", "Action plan"),
        text("time_period", "Time period"),
      ],
      fixedItems: items([
        "Drought events",
        "Water scarcity",
        "Water pollution",
        "Flood events",
        "Water usage",
        "Alternative water sources",
        "Water allocation and management scheme",
        "Water usage permit",
        "Non-authorised water usage",
        "Priority usage",
        "Water conflict",
        "Environmental issues: water bodies, soil, plants, animals, people",
        "Cultural issues",
        "Availability of water management plan",
        "Implementation of water management plan",
        "Insurance",
        "Water pricing",
      ]),
    },
  },
  {
    slug: "approved-ppp-list",
    title: "Approved plant protection products list",
    description: "Products authorised for use, with active ingredient, target, rate and pre-harvest interval.",
    category: "plan",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "approved-ppp-list",
    sourceRef: "AFREX GG/DOC/REC27",
    definition: {
      layout: "table",
      headerFields: [text("crop", "Crop", req), num("year", "Year", req), person("approved_by", "Approved by")],
      entryFields: [
        text("trade_name", "Trade name", req),
        text("active_ingredient", "Active ingredient", req),
        fromList("target", "Target pest or disease", "pests", { allowOther: true }),
        text("rate", "Rate"),
        num("phi_days", "Pre-harvest interval", { unit: "days", required: true }),
        num("rei_hours", "Re-entry interval", { unit: "hours" }),
        bool("registered", "Registered for use in the country"),
      ],
      optionLists: { pests: AVOCADO_PESTS },
    },
  },

  // -------------------------------------------------------------------------
  // Registers
  // -------------------------------------------------------------------------
  {
    slug: "planting-record",
    title: "Planting record",
    description: "What was planted where and when, with variety, area, method and rotation.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "planting-records",
    sourceRef: "AFREX AFG/DOC/REC01",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        text("crop", "Crop", req),
        text("variety", "Variety"),
        text("block", "Block", req),
        num("area_ha", "Area", { unit: "ha" }),
        date("planting_date", "Planting date", req),
        text("method", "Planting method"),
        text("rate", "Planting rate"),
        text("quantity", "Seed quantity planted"),
        date("maturity_date", "Expected maturity date"),
        text("rotation", "Crop rotation"),
      ],
    },
  },
  {
    slug: "agronomic-activities",
    title: "Agronomic activities record",
    description: "Day-to-day field activities by block.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "agronomic-activity-log",
    sourceRef: "AFREX GG/DOC/REC01B",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [date("date", "Date", req), text("block", "Block", req), text("activity", "Activity", req), text("remarks", "Remarks")],
    },
  },
  {
    slug: "training-record",
    title: "Training record",
    description: "One training session: course, trainer, venue and the workers who attended.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "training-attendance-register",
    sourceRef: "AFREX GG/FARM/REC08, AFG-PH 50",
    definition: {
      layout: "table",
      headerFields: [
        text("course", "Course title", req),
        date("date", "Training date", req),
        text("provider", "Training company"),
        text("venue", "Venue"),
        text("trainers", "Trainer(s)", req),
      ],
      entryFields: [person("trainee", "Trainee full name", req), bool("signed", "Signed")],
    },
  },
  {
    slug: "workers-overview",
    title: "Workers overview",
    description: "Every worker, their area of work, and their start and end dates.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "workers-register",
    sourceRef: "AFREX GG/FARM/REC11",
    definition: {
      layout: "table",
      headerFields: [
        num("year", "Year", req),
        long("working_time", "Regular working time and overtime rules"),
      ],
      entryFields: [
        person("worker", "Name of worker", req),
        text("area", "Area of work", req),
        date("entry_date", "Date of entry", req),
        date("termination_date", "Termination date"),
        bool("handles_chemicals", "Handles plant protection products"),
      ],
    },
  },
  {
    slug: "incident-record",
    title: "Accident and incident record",
    description: "Where and what happened, who was hurt, and the action taken.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "accident-incident-log",
    sourceRef: "AFREX GG/FARM/REC12",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("location", "Where it happened", req),
        long("what", "What happened", req),
        num("injured", "Number injured"),
        text("injury", "Type of injury"),
        person("reported_by", "Reported by"),
        long("action", "Action taken", req),
      ],
    },
  },
  {
    slug: "ppe-spray-equipment-cleaning",
    title: "PPE and spray equipment cleaning record",
    description: "After each spray round: equipment and PPE cleaned, and their condition.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "ppe-cleaning-log",
    sourceRef: "AFREX GG/FARM/REC13",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        person("operator", "Spray operator", req),
        text("equipment_serial", "Equipment serial"),
        bool("equipment_cleaned", "Equipment cleaned", req),
        text("equipment_condition", "Equipment condition"),
        bool("ppe_cleaned", "PPE cleaned", req),
        text("ppe_condition", "PPE condition"),
        text("remarks", "Remarks"),
        person("checked_by", "Checked by"),
      ],
    },
  },
  {
    slug: "energy-use-record",
    title: "Energy use record",
    description: "Fuel and energy bought and issued, by block, with stock balance.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "energy-use-record",
    sourceRef: "AFREX GG/DOC/REC18",
    definition: {
      layout: "table",
      headerFields: [pick("source", "Energy source", ["Diesel", "Petrol", "Electricity", "LPG", "Solar"], { allowOther: true, required: true })],
      entryFields: [
        date("date", "Date", req),
        text("supplier", "Supplier"),
        num("quantity_in", "Quantity purchased", { unit: "L" }),
        num("quantity_out", "Quantity issued", { unit: "L" }),
        text("issued_to", "Issued to block"),
        num("balance", "Balance in stock", { unit: "L" }),
        person("storekeeper", "Store keeper"),
      ],
    },
  },
  {
    slug: "fertilizer-application",
    title: "Fertiliser application record",
    description: "Each fertiliser or manure application: product, NPK, rate, quantity, method, operator and advisor.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "fertilizer-application-record",
    sourceRef: "AFREX GG/DOC/REC22",
    definition: {
      layout: "table",
      headerFields: [text("block", "Block", req), num("area_ha", "Area", { unit: "ha" }), text("crop", "Crop", req)],
      entryFields: [
        date("date", "Date of application", req),
        text("product", "Trade name (type)", req),
        text("npk", "NPK composition"),
        text("rate", "Rate per hectare"),
        text("quantity", "Quantity applied", req),
        text("method", "Mode of application"),
        text("machinery", "Machinery used"),
        person("operator", "Operator", req),
        person("advisor", "Advised by", req),
      ],
    },
  },
  {
    slug: "chemical-stock-inventory",
    title: "Pesticide and fertiliser stock inventory",
    description: "Stock card per product: received, issued to block, expiry and running balance.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "chemical-stock-inventory",
    sourceRef: "AFREX GG/DOC/REC23",
    definition: {
      layout: "table",
      headerFields: [
        text("product", "Product name", req),
        pick("kind", "Type", ["Pesticide", "Fertiliser", "Biostimulant"], req),
        text("active_ingredient", "Active ingredient or components"),
        text("units", "Units"),
      ],
      entryFields: [
        date("date", "Date", req),
        text("supplier", "Supplier"),
        bool("receipt", "Receipt issued"),
        date("expiry", "Expiry date"),
        text("issued_to", "Issued to block"),
        num("quantity_in", "Quantity in"),
        num("quantity_out", "Quantity out"),
        num("balance", "Balance in stock", req),
        person("storekeeper", "Store keeper"),
      ],
    },
  },
  {
    slug: "irrigation-record",
    title: "Irrigation record",
    description: "Each irrigation: block, crop, pump times and water used.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "irrigation-record",
    sourceRef: "AFREX GG/DOC/REC24",
    definition: {
      layout: "table",
      headerFields: [num("pump_rate", "Pump discharge rate", { unit: "m³/h" })],
      entryFields: [
        date("date", "Date", req),
        text("block", "Block", req),
        text("crop", "Crop"),
        time("pump_on", "Pump on"),
        time("pump_off", "Pump off"),
        num("minutes", "Total time", { unit: "min" }),
        num("water_m3", "Water used", { unit: "m³", required: true }),
        text("remarks", "Remarks"),
      ],
    },
  },
  {
    slug: "pesticide-application",
    title: "Pesticide application record",
    description: "Each spray: justification, product, active ingredient, quantity, PHI and re-entry, operator and advisor.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "ppp-application-record",
    sourceRef: "AFREX GG/DOC/REC28",
    definition: {
      layout: "table",
      headerFields: [
        text("block", "Block", req),
        num("area_ha", "Area", { unit: "ha" }),
        text("crop", "Crop", req),
        text("variety", "Variety"),
      ],
      entryFields: [
        date("date", "Date", req),
        fromList("justification", "Spray justification (pest or disease)", "pests", { allowOther: true, required: true }),
        text("trade_name", "Trade name", req),
        text("active_ingredient", "Active ingredient", req),
        text("quantity", "Quantity used", req),
        num("water_l", "Water", { unit: "L" }),
        num("phi_days", "Pre-harvest interval", { unit: "days", required: true }),
        date("phi_clear", "PHI clear date"),
        date("reentry", "Re-entry date"),
        text("weather", "Weather at application"),
        person("operator", "Operator", req),
        text("equipment", "Equipment serial"),
        person("advisor", "Advisor", req),
      ],
      optionLists: { pests: AVOCADO_PESTS },
    },
  },
  {
    slug: "pest-scouting",
    title: "Field pest scouting record",
    description: "Pests and diseases found per scouting round against economic thresholds, and the spray decision.",
    category: "register",
    cadence: "weekly",
    siteTypes: FARM,
    evidence: "pest-scouting-record",
    sourceRef: "AFREX DOC/REC29",
    definition: {
      layout: "table",
      headerFields: [
        text("block", "Block", req),
        num("size_ha", "Size", { unit: "ha" }),
        text("crop", "Crop and variety", req),
        text("crop_age", "Crop age"),
        date("date", "Scouting date", req),
        person("scout", "Scout", req),
      ],
      entryFields: [
        fromList("pest", "Pest, disease or beneficial", "pests", { allowOther: true, required: true }),
        num("average", "Average plants affected (of 10)", req),
        text("threshold", "Economic threshold"),
        pick("decision", "Recommendation", ["Spray", "No spray", "Monitor"], req),
        text("product", "Recommended product"),
      ],
      optionLists: { pests: AVOCADO_PESTS },
    },
  },
  {
    slug: "surplus-mix-disposal",
    title: "Surplus spray mix disposal record",
    description: "Where leftover spray mix and tank washings went, how much, and who authorised it.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "surplus-mix-disposal-record",
    sourceRef: "AFREX GG/DOC/REC30",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("product", "Product trade name", req),
        text("block", "Block or crop sprayed"),
        num("quantity_l", "Quantity disposed", { unit: "L", required: true }),
        person("operator", "Operator"),
        person("authorized_by", "Authorised by"),
        text("comments", "Comments"),
      ],
    },
  },
  {
    slug: "empty-container-disposal",
    title: "Empty chemical container disposal record",
    description: "Empty containers rinsed, punctured and disposed of, and how.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "empty-container-disposal-record",
    sourceRef: "AFREX GG/DOC/REC31",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("package", "Package type"),
        text("product", "Product", req),
        num("quantity", "Number of containers", req),
        bool("triple_rinsed", "Triple rinsed", req),
        bool("punctured", "Punctured"),
        pick("method", "Disposal", ["Collection scheme", "Crushed", "Burnt", "Buried"], { allowOther: true, required: true }),
        text("comments", "Comments"),
      ],
    },
  },
  {
    slug: "obsolete-ppp-disposal",
    title: "Obsolete pesticide disposal record",
    description: "Expired or withdrawn products, why, where and by whom they were disposed of.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "obsolete-ppp-disposal-record",
    sourceRef: "AFREX GG/DOC/REC32",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Disposal date", req),
        text("product", "Product name", req),
        text("reason", "Reason obsolete", req),
        text("quantity", "Quantity disposed", req),
        person("disposed_by", "Disposed by"),
        text("where", "Disposed where", req),
      ],
    },
  },
  {
    slug: "scale-calibration",
    title: "Weighing scale calibration record",
    description: "Internal calibration against a standard weight, with variance.",
    category: "register",
    cadence: "quarterly",
    siteTypes: ALL,
    evidence: "scale-calibration-record",
    sourceRef: "AFREX GG/DOC/REC33",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        text("scale", "Type of scale", req),
        text("serial", "Serial number", req),
        date("date", "Date calibrated", req),
        num("standard", "Standard weight", { unit: "kg", required: true }),
        num("reading", "Reading", { unit: "kg", required: true }),
        num("variance", "Variance", { unit: "kg" }),
        text("remarks", "Remarks"),
        person("calibrated_by", "Calibrated by", req),
      ],
    },
  },
  {
    slug: "sprayer-calibration",
    title: "Spray equipment calibration record",
    description: "Internal calibration of sprayers: nozzle flow rate and what was checked.",
    category: "register",
    cadence: "annual",
    siteTypes: FARM,
    evidence: "sprayer-calibration-record",
    sourceRef: "AFREX GG/DOC/REC33B",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        text("equipment", "Type of equipment", req),
        text("serial", "Serial number", req),
        num("flow_rate", "Standard nozzle flow rate", { unit: "L/min" }),
        date("date", "Date calibrated", req),
        long("details", "Calibration undertaken", req),
        person("calibrated_by", "Calibrated by", req),
      ],
    },
  },
  {
    slug: "equipment-maintenance",
    title: "Equipment maintenance record",
    description: "Maintenance carried out on farm and packhouse equipment, by date and serial number.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "equipment-maintenance-record",
    sourceRef: "AFREX GG/FARM/REC34, REC34B, AFG-PH 32",
    definition: {
      layout: "table",
      headerFields: [text("equipment", "Equipment or area"), text("manufacturer", "Manufacturer")],
      entryFields: [
        date("date", "Date", req),
        text("serial", "Serial number or area", req),
        long("details", "Maintenance carried out", req),
        bool("calibration", "Included calibration"),
        text("remarks", "Remarks"),
        person("maintained_by", "Maintained by", req),
      ],
    },
  },
  {
    slug: "trap-installation",
    title: "Trap installation record",
    description: "Pest traps installed per block and when they are due to be replaced.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "trap-installation-record",
    sourceRef: "AFREX GG/DOC/REC39",
    definition: {
      layout: "table",
      headerFields: [text("crop", "Crop")],
      entryFields: [
        date("date", "Date installed", req),
        text("trap", "Trade name (type) of trap", req),
        num("count", "Number of traps", req),
        text("block", "Block", req),
        date("next_date", "Next installation date"),
        person("operator", "Operator"),
        person("approved_by", "Approved by"),
      ],
    },
  },
  {
    slug: "harvest-record",
    title: "Harvest record",
    description: "Kilograms harvested per block per day, with the harvest lead.",
    category: "register",
    cadence: "per_event",
    siteTypes: FARM,
    evidence: "harvest-record",
    sourceRef: "AFREX GG/FARM/REC41",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("block", "Block", req),
        num("kg", "Quantity", { unit: "kg", required: true }),
        person("lead", "Harvest lead"),
      ],
    },
  },
  {
    slug: "water-tank-cleaning",
    title: "Water tank cleaning record",
    description: "When each water tank was cleaned and by whom.",
    category: "register",
    cadence: "quarterly",
    siteTypes: ALL,
    evidence: "water-tank-cleaning-record",
    sourceRef: "AFREX AFG-PH 21",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("tank", "Tank number", req),
        person("cleaned_by", "Cleaned by", req),
        person("checked_by", "Checked by"),
        text("remarks", "Remarks"),
      ],
    },
  },
  {
    slug: "vehicle-cleaning",
    title: "Vehicle and equipment cleaning record",
    description: "Vehicles cleaned before carrying produce.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "vehicle-cleaning-record",
    sourceRef: "AFREX AFG-PH 23",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("vehicle", "Vehicle", req),
        text("registration", "Registration number"),
        person("cleaned_by", "Cleaned by", req),
        person("checked_by", "Checked by"),
        text("comments", "Comments"),
      ],
    },
  },
  {
    slug: "crate-cleaning",
    title: "Crate cleaning record",
    description: "Harvest and field crates cleaned each day.",
    category: "register",
    cadence: "daily",
    siteTypes: ALL,
    evidence: "crate-cleaning-record",
    sourceRef: "AFREX AFG-PH 33",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("colour", "Crate colour"),
        num("count", "Number cleaned", req),
        person("cleaned_by", "Cleaned by", req),
        person("checked_by", "Checked by"),
      ],
    },
  },
  {
    slug: "pest-monitoring",
    title: "Pest monitoring record (premises)",
    description: "Bait stations and insectocutors checked, pests found, and corrections.",
    category: "register",
    cadence: "weekly",
    siteTypes: ["packhouse", "warehouse", "collection_centre"],
    evidence: "pest-control-inspection-record",
    sourceRef: "AFREX AFG-PH 34",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("bait_stations", "Bait stations checked", req),
        text("insectocutors", "Insectocutors"),
        text("pests", "Signs of pests found"),
        text("insects", "Signs of insects found"),
        text("remarks", "Remarks"),
        text("correction", "Correction"),
        person("checked_by", "Checked by", req),
        person("verified_by", "Verified by"),
      ],
    },
  },
  {
    slug: "packaging-stock",
    title: "Packaging store stock record",
    description: "Packaging received and issued, with running stock per item.",
    category: "register",
    cadence: "per_event",
    siteTypes: PACKHOUSE,
    evidence: "packaging-stock-record",
    sourceRef: "AFREX AFG-PH 49",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        fromList("item", "Item", "packaging", { allowOther: true, required: true }),
        num("received", "Received"),
        num("issued", "Issued"),
        num("stock", "Stock", req),
      ],
      optionLists: {
        packaging: ["Sea pallets", "Air pallets", "4 kg carton", "4 kg crate", "10 kg crate", "Corners", "Layer pads"],
      },
    },
  },
  {
    slug: "meeting-record",
    title: "Meeting record",
    description: "Committee meetings between management and workers, with attendance.",
    category: "register",
    cadence: "quarterly",
    siteTypes: ALL,
    evidence: "management-worker-meeting-record",
    sourceRef: "AFREX AFG-PH 51",
    definition: {
      layout: "table",
      headerFields: [
        text("committee", "Committee", req),
        date("date", "Meeting date", req),
        text("venue", "Venue"),
        long("minutes", "Issues discussed and actions agreed"),
      ],
      entryFields: [person("member", "Member name", req), bool("signed", "Signed")],
    },
  },
  {
    slug: "cleaning-chemical-issuance",
    title: "Detergent and chlorine issuance record",
    description: "Cleaning chemicals issued to each section.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "cleaning-chemical-issuance",
    sourceRef: "AFREX AFG-PH 52, AFG-PH 53",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        pick("chemical", "Chemical issued", ["Detergent", "Chlorine"], { allowOther: true, required: true }),
        text("product", "Product name"),
        text("quantity", "Quantity", req),
        text("section", "Section", req),
        person("issued_by", "Issued by", req),
      ],
    },
  },
  {
    slug: "cleaning-chemical-stock",
    title: "Detergent stock inventory",
    description: "Cleaning chemicals received and issued, with stock.",
    category: "register",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "cleaning-chemical-stock",
    sourceRef: "AFREX AFG-PH 54",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        text("name", "Detergent name", req),
        date("date", "Date", req),
        num("received", "Quantity received"),
        num("issued", "Quantity issued"),
        num("stock", "Stock", req),
      ],
    },
  },
  {
    slug: "trolley-service-log",
    title: "Trolley service log",
    description: "Faults found on trolleys and the service done.",
    category: "register",
    cadence: "per_event",
    siteTypes: PACKHOUSE,
    evidence: "equipment-maintenance-record",
    sourceRef: "AFREX AFG-PH 60",
    definition: {
      layout: "table",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        text("trolley", "Trolley number", req),
        text("fault", "Fault", req),
        text("service", "Service done", req),
        person("checked_by", "Checked by"),
        person("confirmed_by", "Confirmed by"),
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Inspections and checklists (periodic grids)
  // -------------------------------------------------------------------------
  {
    slug: "hygiene-inspection",
    title: "Personnel hygiene and facility inspection",
    description: "Daily check of worker hygiene and facility cleanliness.",
    category: "checklist",
    cadence: "daily",
    siteTypes: FIELD,
    evidence: "hygiene-inspection-checklist",
    sourceRef: "AFREX GG/DOC/REC10",
    definition: {
      layout: "grid",
      headerFields: [num("personnel", "Number of personnel")],
      entryFields: [date("date", "Date", req), pick("result", "Result", OK_NOT_OK, req), person("checked_by", "Checked by")],
      fixedItems: [
        ...items(
          [
            "Signed hygiene instructions",
            "Short fingernails",
            "No jewellery worn",
            "No nail polish worn",
            "Hands washed",
            "No heavy coughs or colds",
            "Proper protective clothing worn",
            "Clothing generally clean",
            "No boils, cuts, sores or skin disease",
            "No diarrhoea",
            "No vomiting",
          ],
          "Personnel",
        ),
        ...items(
          ["Picking containers", "Crates", "Consolidation shed", "Toilets", "Handwashing facilities", "Truck"],
          "Facilities",
        ),
      ],
    },
  },
  {
    slug: "facility-cleaning",
    title: "Farm cleaning record",
    description: "Daily cleaning of crates, grading shed, PPE, rejects area and harvesting tools.",
    category: "checklist",
    cadence: "daily",
    siteTypes: FIELD,
    evidence: "cleaning-records",
    sourceRef: "AFREX GG/DOC/REC13",
    definition: {
      layout: "grid",
      headerFields: [person("checked_by", "Checked by")],
      entryFields: [date("date", "Date", req), bool("cleaned", "Cleaned", req), text("remarks", "Remarks")],
      fixedItems: items(["Crates", "Grading shed", "PPE", "Rejects area", "Harvesting secateurs"]),
    },
  },
  {
    slug: "toilet-cleaning",
    title: "Toilet and washroom cleaning record",
    description: "Daily cleaning of toilets, sinks, floors, walls and bins.",
    category: "checklist",
    cadence: "daily",
    siteTypes: ALL,
    evidence: "toilet-cleaning-record",
    sourceRef: "AFREX GG/DOC/REC37, AFG-PH 22",
    definition: {
      layout: "grid",
      headerFields: [text("location", "Toilet or washroom", req)],
      entryFields: [date("date", "Date", req), bool("cleaned", "Cleaned", req), person("cleaned_by", "Cleaned by"), person("checked_by", "Checked by")],
      fixedItems: items(["Toilet bowls and cistern", "Sinks and handwashing", "Floor", "Walls and windows", "Dustbin"]),
    },
  },
  {
    slug: "produce-consolidation-checklist",
    title: "Produce consolidation facility checklist",
    description: "Inspection of the field shed or collection point and harvest hygiene.",
    category: "checklist",
    cadence: "weekly",
    siteTypes: FIELD,
    evidence: "consolidation-facility-checklist",
    sourceRef: "AFREX GG/DOC/REC38",
    definition: {
      layout: "plan",
      headerFields: [text("shed", "Shed location", req), person("completed_by", "Completed by", req), date("date", "Date", req)],
      entryFields: [pick("answer", "Answer", YES_NO_NA, req), text("remarks", "Remarks or corrective action")],
      fixedItems: [
        ...items(
          [
            "Hygiene checklist clearly displayed",
            "Emergency procedure clearly displayed",
            "Raw material specification clearly displayed",
            "Roof adequately protects the facility",
            "Access to the facility controlled",
            "Animal security fencing in good condition",
            "Concrete floor solid and not breaking up",
            "Bench covering in good condition",
            "Only produce containers permitted in the facility",
            "Facility clean and tidy",
            "Adequate water available",
            "Evidence that water is chlorinated",
            "Non-scented soap available",
            "Chlorine stored outside the facility",
            "Produce containers stored adequately",
          ],
          "Facility",
        ),
        ...items(
          [
            "Chlorinated water available in the field",
            "Non-scented soap available in the field",
            "Harvesters adequately supervised",
            "Harvesting containers clean",
          ],
          "Field",
        ),
      ],
    },
  },
  {
    slug: "first-aid-kit-inspection",
    title: "First aid kit inspection",
    description: "Monthly check of first aid kit contents, quantities and expiry dates.",
    category: "checklist",
    cadence: "monthly",
    siteTypes: ALL,
    evidence: "first-aid-kit-check",
    sourceRef: "AFREX AFG-PH First aid",
    definition: {
      layout: "plan",
      headerFields: [text("kit", "Kit location", req), date("date", "Inspection date", req), person("first_aider", "First aider", req)],
      entryFields: [num("quantity", "Quantity", req), date("expiry", "Expiry date")],
      fixedItems: items([
        "Scissors",
        "Sterilised gauze pads",
        "Adhesive bandage",
        "Alcohol prep pads",
        "Disposable gloves",
        "Sterile cotton gauze",
        "Cotton wool",
        "Zinc oxide wound dressing",
        "Triangular bandages",
        "Eye pads",
        "Crepe bandage",
        "Sterilised gauze swabs",
        "Surgical spirit",
        "Diclofenac gel",
      ]),
    },
  },
  {
    slug: "emergency-contacts",
    title: "Emergency information and contacts",
    description: "Nearest hospital, first aiders, emergency services, extinguishers and assembly point.",
    category: "checklist",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "emergency-contacts-display",
    sourceRef: "AFREX GG/DOC/REC06B",
    definition: {
      layout: "plan",
      headerFields: [],
      entryFields: [text("name", "Name or location", req), text("access", "Means of access"), text("phone", "Telephone")],
      fixedItems: items([
        "Nearest hospital",
        "Farm manager",
        "Health, safety and welfare representative",
        "First aider 1",
        "First aider 2",
        "Ambulance",
        "Police",
        "Fire brigade",
        "Fire extinguisher location",
        "Fire assembly point",
      ]),
    },
  },
  {
    slug: "cold-room-temperature",
    title: "Cold room temperature monitoring",
    description: "Cold room temperature read every two hours against the target range.",
    category: "checklist",
    cadence: "daily",
    siteTypes: ["packhouse", "warehouse"],
    evidence: "temperature-monitoring-record",
    sourceRef: "AFREX AFG-PH 03",
    definition: {
      layout: "table",
      headerFields: [text("room", "Cold room", req), text("range", "Target range", { help: "e.g. 4 to 7 °C, tolerance ±1 °C" })],
      entryFields: [
        date("date", "Date", req),
        time("time", "Time", req),
        num("temperature", "Temperature", { unit: "°C", required: true }),
        person("monitored_by", "Monitored by", req),
        text("action", "Findings and action taken"),
      ],
    },
  },
  {
    slug: "glass-hard-plastic-audit",
    title: "Glass and hard plastics inspection",
    description: "Glass and brittle plastic by location, checked for breakage.",
    category: "checklist",
    cadence: "weekly",
    siteTypes: PACKHOUSE,
    evidence: "glass-hard-plastic-register",
    sourceRef: "AFREX AFG-PH 06",
    definition: {
      layout: "grid",
      headerFields: [person("verified_by", "Verified by")],
      entryFields: [
        date("date", "Date", req),
        pick("status", "Status", ["OK", "Needs cleaning", "Needs repair", "Broken", "Not working"], req),
        person("checked_by", "Checked by"),
      ],
      fixedItems: [
        ...items(["Fluorescent tubes", "Glass window panes"], "Main office"),
        ...items(["Fluorescent tubes (shatterproof)", "Glass window panes"], "Main packhouse"),
        ...items(["Fluorescent tubes", "Pest electrocutor tubes"], "Loading area"),
        ...items(["Fluorescent tubes (shatterproof)"], "Cold room"),
        ...items(["Fluorescent tubes"], "Toilets"),
        ...items(["Fluorescent tubes", "Pest electrocutor tubes"], "Rejects holding area"),
      ].map((item, index) => ({ ...item, key: `${index + 1}-${item.key}` })),
    },
  },
  {
    slug: "premises-daily-cleaning",
    title: "Daily cleaning inspection (packhouse premises)",
    description: "Daily cleaning of packhouse, office and compound areas.",
    category: "checklist",
    cadence: "daily",
    siteTypes: PACKHOUSE,
    evidence: "premises-cleaning-record",
    sourceRef: "AFREX AFG-PH 24",
    definition: {
      layout: "grid",
      headerFields: [text("detergent", "Detergent used")],
      entryFields: [date("date", "Date", req), bool("cleaned", "Cleaned", req), person("cleaned_by", "Cleaned by"), person("inspected_by", "Inspected by")],
      fixedItems: [
        ...items(["Packing area", "Off-loading and loading bay", "Rejects storage area", "Surroundings", "Outer walls"], "Compound"),
        ...items(["Administration", "Reception", "Kitchen", "Control room", "Exporter's office", "Office stores"], "Offices"),
        ...items(["Floor", "Walls", "Drainage"], "Packhouse"),
      ].map((item) => ({ ...item, key: `${item.group?.toLowerCase()}-${item.key}` })),
    },
  },
  {
    slug: "equipment-cleaning",
    title: "Equipment cleaning checklist (packline)",
    description: "Daily cleaning of each packline unit, cold room and trolleys.",
    category: "checklist",
    cadence: "daily",
    siteTypes: PACKHOUSE,
    evidence: "equipment-cleaning-record",
    sourceRef: "AFREX AFG-PH 27",
    definition: {
      layout: "grid",
      headerFields: [text("detergent", "Detergent used")],
      entryFields: [date("date", "Date", req), bool("cleaned", "Cleaned", req), person("cleaned_by", "Cleaned by"), person("checked_by", "Checked by")],
      fixedItems: items([
        "Water flume and roller elevator",
        "Ozone brush unit",
        "Drying brush unit",
        "Waxing brush unit",
        "Drying tunnel",
        "Unequal belts",
        "Transfer belt",
        "Sorting table",
        "Sizer feed belt and pre-singulator",
        "Sizer and weight cups",
        "Trays",
        "Carton conveyor",
        "Cold room",
        "Trolleys",
      ]),
    },
  },
  {
    slug: "packline-inspection",
    title: "Packline cleaning and check record",
    description: "Each packline unit checked for cleanliness and working order.",
    category: "checklist",
    cadence: "daily",
    siteTypes: PACKHOUSE,
    evidence: "packline-inspection-record",
    sourceRef: "AFREX AFG-PH 31",
    definition: {
      layout: "grid",
      headerFields: [],
      entryFields: [
        date("date", "Date", req),
        pick("clean", "Clean", ["OK", "Dirty", "Needs cleaning"], req),
        pick("working", "Working", ["OK", "Needs service"], req),
        person("inspected_by", "Inspected by"),
      ],
      fixedItems: items([...PACKLINE_PARTS, "Trolleys", "Cold room"]),
    },
  },
  {
    slug: "packline-monthly-checklist",
    title: "Packline monthly checklist",
    description: "Monthly fault check of each packline unit and the repair done.",
    category: "checklist",
    cadence: "monthly",
    siteTypes: PACKHOUSE,
    evidence: "plant-monthly-checklist",
    sourceRef: "AFREX AFG-PH 26",
    definition: {
      layout: "plan",
      headerFields: [date("date", "Inspection date", req), person("checked_by", "Checked by", req), person("confirmed_by", "Confirmed by")],
      entryFields: [text("fault", "Fault report"), text("action", "Action taken or repair"), text("remarks", "Remarks")],
      fixedItems: items(PACKLINE_PARTS),
    },
  },
  {
    slug: "coldroom-monthly-checklist",
    title: "Cold storage plant monthly checklist",
    description: "Monthly fault check of the cold room plant and controls.",
    category: "checklist",
    cadence: "monthly",
    siteTypes: ["packhouse", "warehouse"],
    evidence: "plant-monthly-checklist",
    sourceRef: "AFREX AFG-PH 28",
    definition: {
      layout: "plan",
      headerFields: [date("date", "Inspection date", req), person("checked_by", "Checked by", req), person("confirmed_by", "Confirmed by")],
      entryFields: [text("fault", "Fault report"), text("action", "Action taken or repair"), text("remarks", "Remarks")],
      fixedItems: items([
        "Condensation unit",
        "Refrigerant",
        "Ceiling unit cooler",
        "Electronic control box",
        "Door and wall panels",
        "Temperature monitor panel",
      ]),
    },
  },
  {
    slug: "fire-equipment-service",
    title: "Fire equipment service record",
    description: "Weekly check of smoke detectors, extinguishers, emergency lighting and the alarm.",
    category: "checklist",
    cadence: "weekly",
    siteTypes: ["packhouse", "warehouse"],
    evidence: "fire-equipment-check",
    sourceRef: "AFREX AFG-PH 30",
    definition: {
      layout: "plan",
      headerFields: [date("date", "Date", req), person("checked_by", "Checked by", req), person("confirmed_by", "Confirmed by")],
      entryFields: [pick("status", "Status", OK_NOT_OK, req), text("fault", "Fault report"), text("action", "Action taken or repair")],
      fixedItems: [
        ...items(["Control room", "Main packhouse", "Packhouse store 1", "Packhouse store 2"], "Smoke detectors"),
        ...items(
          ["Control room", "Cold room", "Main packhouse", "Packhouse store 1", "Packhouse store 2", "Reception", "Main office"],
          "Fire extinguishers",
        ),
        ...items(["Emergency lighting"], "Lighting"),
        ...items(["Fire alarm"], "Alarm"),
      ].map((item) => ({ ...item, key: `${item.group?.toLowerCase().replace(/\s+/g, "-")}-${item.key}` })),
    },
  },
  {
    slug: "transport-vehicle-inspection",
    title: "Produce transport vehicle inspection",
    description: "Container, generator and vehicle checked before loading packed produce or raw material.",
    category: "checklist",
    cadence: "per_event",
    siteTypes: ["packhouse", "warehouse", "collection_centre"],
    evidence: "produce-transport-inspection",
    sourceRef: "AFREX AFG-PH 55",
    definition: {
      layout: "plan",
      headerFields: [
        date("date", "Date", req),
        text("truck", "Truck number", req),
        text("trailer", "Trailer number"),
        text("container", "Container number"),
        person("driver", "Driver"),
        bool("accepted", "Vehicle accepted", req),
        person("checked_by", "Checked by", req),
      ],
      entryFields: [pick("status", "Status", YES_NO_NA, req), text("remarks", "Remarks")],
      fixedItems: [
        ...items(
          [
            "Odour free",
            "No toxic chemicals, pests or moulds; clean",
            "CO2 level as specified",
            "O2 level as specified",
            "Drainage plugs on",
            "Seal available and number recorded",
            "Booking instructions verified",
            "Ethylene scrubbers",
            "Door curtains in place",
            "Floor, roof and walls in good condition",
            "Back door closes and locks",
            "Controlled atmosphere vents closed",
            "Container at loading temperature",
          ],
          "Container",
        ),
        ...items(["Fuel level", "Working condition", "Oil level"], "Generator"),
        ...items(["Lighting", "Safety reflectors", "Wheels and tyres", "Oil and fuel levels"], "Vehicle"),
      ].map((item) => ({ ...item, key: `${item.group?.toLowerCase()}-${item.key}` })),
    },
  },

  // -------------------------------------------------------------------------
  // Findings, complaints and recall
  // -------------------------------------------------------------------------
  {
    slug: "non-conformance-report",
    title: "Non-conformity report",
    description: "Non-conformances found at an internal audit or inspection, with grade, owner and close date.",
    category: "finding",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "internal-audit-ncr",
    sourceRef: "AFREX GG/FARM/REC04",
    definition: {
      layout: "table",
      headerFields: [
        date("date", "Audit date", req),
        text("standard", "Standard", req),
        text("crops", "Crops"),
        person("auditor", "Auditor", req),
        person("auditee", "Auditee"),
      ],
      entryFields: [
        text("section", "Section or criterion", req),
        long("non_compliance", "Non-compliance", req),
        pick("grade", "Grade", GRADES, req),
        person("responsible", "Responsible", req),
        date("close_by", "Date to close"),
        person("checked_by", "Checked by"),
      ],
    },
  },
  {
    slug: "corrective-action-record",
    title: "Corrective action record",
    description: "Root cause and preventive action for each non-compliance, and who verified it.",
    category: "finding",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "corrective-action-record",
    sourceRef: "AFREX GG/FARM/REC05",
    definition: {
      layout: "table",
      headerFields: [text("standard", "Standard", req), date("audit_date", "Audit date", req), person("verified_by", "Verified by")],
      entryFields: [
        text("section", "Section or criterion", req),
        long("non_compliance", "Non-compliance", req),
        pick("grade", "Grade", GRADES),
        date("closed_on", "Date closed"),
        long("root_cause", "Root cause", req),
        long("action", "Action to prevent recurrence", req),
        person("checked_by", "Checked by"),
      ],
    },
  },
  {
    slug: "complaint-record",
    title: "Complaint and investigation record",
    description: "A customer or internal complaint, its root cause, and the corrective action per area.",
    category: "finding",
    cadence: "per_event",
    siteTypes: ALL,
    evidence: "complaint-record",
    sourceRef: "AFREX GG/FARM/REC19, AG-LRF13",
    definition: {
      layout: "table",
      headerFields: [
        text("reference", "Complaint reference"),
        date("received", "Date received", req),
        text("complainant", "Complainant or customer", req),
        text("product", "Product"),
        text("consignment", "Container, pallet or batch"),
        date("packed", "Date of packing"),
        long("nature", "Nature of complaint", req),
        long("root_cause", "Root cause analysis"),
        date("replied", "Date reply sent"),
        person("verified_by", "Action verified by"),
      ],
      entryFields: [
        pick("area", "Area", ["Farm production", "Packhouse production", "Technical", "Transit"], { allowOther: true, required: true }),
        long("action", "Corrective action", req),
        text("time_scale", "Time scale"),
        date("completed", "Completed"),
        person("responsible", "Responsible"),
      ],
    },
  },
  {
    slug: "product-recall",
    title: "Product recall and stock reconciliation",
    description: "Recall details and the reconciliation of quantities dispatched, recalled and accepted. Use for the annual mock recall too.",
    category: "finding",
    cadence: "annual",
    siteTypes: ALL,
    evidence: "recall-and-mock-recall-record",
    sourceRef: "AFREX GG/FARM/REC20",
    definition: {
      layout: "table",
      headerFields: [
        date("date", "Date", req),
        pick("kind", "Type", ["Mock recall (test)", "Real recall"], req),
        text("from", "From"),
        text("to", "To"),
        long("product", "Particulars of the product", req),
        text("traceability", "Traceability details", req),
        person("qa_manager", "Signed by QA manager"),
      ],
      entryFields: [
        date("date", "Date", req),
        num("dispatched", "Quantity dispatched", req),
        num("recalled", "Quantity recalled", req),
        num("to_accept", "Quantity to be accepted"),
        num("accepted", "Quantity accepted"),
      ],
    },
  },
];
