import type { ReactNode } from "react";
import type { Step, Tour } from "nextstepjs";

export const ONBOARDING_TOUR = "console";
export const ONBOARDING_STORAGE_KEY = "cf_console_onboarding";

export function onboardingIsDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
  } catch {
    // private mode
  }
}

const routed = {
  pointerPadding: 10,
  pointerRadius: 10,
  disableInteraction: true,
  scrollOffset: 72,
  selectorRetryAttempts: 12,
  selectorRetryDelay: 200,
} as const;

function explain(what: string, how: string[]): ReactNode {
  return (
    <div className="space-y-2.5">
      <p>{what}</p>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug">
        {how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function page(
  opts: {
    icon: string;
    title: string;
    what: string;
    how: string[];
    selector: string;
    side?: Step["side"];
    nextRoute?: string;
    prevRoute?: string;
    disableInteraction?: boolean;
  },
): Step {
  return {
    icon: opts.icon,
    title: opts.title,
    content: explain(opts.what, opts.how),
    selector: opts.selector,
    side: opts.side ?? "bottom-left",
    nextRoute: opts.nextRoute,
    prevRoute: opts.prevRoute,
    ...routed,
    disableInteraction: opts.disableInteraction ?? true,
  };
}

export const onboardingTours: Tour[] = [
  {
    tour: ONBOARDING_TOUR,
    steps: [
      page({
        icon: "👋",
        title: "Overview",
        selector: "#tour-overview",
        what: "Home for the knowledge base. Each tile is one ingested version of a certification — not a hardcoded Smart/GFS/SMETA list. A new standard shows up here after ingest.",
        how: [
          "Tiles show criterion count, how many source documents are fetched, publication status, and embedding coverage.",
          "Open a tile to inspect that version. The table below is recent pipeline jobs — click a stage for logs.",
          "Numbers follow the header certification filter, so you can look at one cert or all of them.",
        ],
      }),
      page({
        icon: "🎛️",
        title: "Certification filter",
        selector: "#tour-cert-scope",
        side: "bottom-right",
        what: "This filter is the console’s context. Every list, graph, and search respects it until you change it.",
        how: [
          "All certifications (empty selection) shows every ingested standard.",
          "Tick one or several to narrow Overview, Graph, Versions, Sources, Criteria, Gates, Compare, Ingest and Search.",
          "The choice is stored in a cookie, so it survives refresh and page changes.",
        ],
      }),
      page({
        icon: "📚",
        title: "Knowledge base",
        selector: "#tour-sidebar",
        side: "right",
        nextRoute: "/graph",
        what: "The sidebar is the operator workflow, top to bottom: see the catalog, ingest sources, inspect facts, then publish and watch for drift.",
        how: [
          "Graph through Review are the knowledge-base tools you will use most days.",
          "Compare is correspondence between any two ingested versions.",
          "Watch, Demos and Audit are operations: publisher drift, inbound demo leads, and a change trail.",
        ],
      }),
      page({
        icon: "🕸️",
        title: "Graph",
        selector: "#tour-graph",
        prevRoute: "/",
        nextRoute: "/ingest",
        what: "A map of what is in the knowledge base: certifications, their versions, shared controls, and (optionally) sections. Use it to see scope before you dive into tables.",
        how: [
          "Columns read left to right: standard → version → control → section.",
          "Solid edges mean belongs-to. Dashed edges are related requirements or a control that satisfies more than one cert.",
          "Overview is the usual view. Sections adds depth-1 headings. Hover a node for connections; click a version or section to open it.",
          "The header filter still applies — isolate one cert to unclutter the map.",
        ],
      }),
      page({
        icon: "⚙️",
        title: "Ingest",
        selector: "#tour-ingest",
        prevRoute: "/graph",
        nextRoute: "/versions",
        what: "Starts the same pipeline as `bun run kb`, as a child process. This page does not parse files inside the HTTP request; it records jobs and tails `ingestion_jobs`.",
        how: [
          "Pick a version in the current filter, then run a stage: Registry, Fetch, Parse, Pages, Prose, Link, Gates — or Run all.",
          "Embed builds search vectors after extract. Fetch --force re-downloads even when the hash matches.",
          "Wait for the running job to finish before starting another. Open a stage in the table for stdout and errors.",
        ],
      }),
      page({
        icon: "📦",
        title: "Versions",
        selector: "#tour-versions",
        prevRoute: "/ingest",
        nextRoute: "/sources",
        what: "Every ingested edition in scope, with publication status and criterion counts. A version is the unit you fetch, gate, review and publish.",
        how: [
          "Status walks draft → ingesting → extracted → validation → review → approved → published (retired is terminal).",
          "Open a code for documents, criteria, gates and the promotion path for that edition.",
          "Effective date is the publisher’s date, not when we ingested it.",
        ],
      }),
      page({
        icon: "📜",
        title: "Sources",
        selector: "#tour-sources",
        prevRoute: "/versions",
        nextRoute: "/criteria",
        what: "Provenance for every file we store: P&Cs, checklists, general regulations, guidance, ETI base code, and member-gated drops.",
        how: [
          "Binding yes means the document is normative for answers. Guidance and summaries are not.",
          "Status is fetch state. The hash is SHA-256 of the stored bytes — a re-fetch of unchanged content keeps the same path.",
          "Open the title for the publisher URL, or the version code to see the edition that owns the file.",
        ],
      }),
      page({
        icon: "☑️",
        title: "Criteria",
        selector: "#tour-criteria",
        prevRoute: "/sources",
        nextRoute: "/search",
        what: "The requirement list for one version. This is the fact table the agent cites: identifier, level, principle, and source page.",
        how: [
          "Choose version, then optionally a level. Levels come from that version’s scheme — Major Must on GLOBALG.A.P., SMETA grades on SMETA — not a global enum.",
          "Search by criterion number or principle text. Open a row for the full principle, criteria text, and citations.",
          "If the filter has no versions, widen the certification scope in the header.",
        ],
      }),
      page({
        icon: "🔍",
        title: "Search",
        selector: "#tour-search",
        prevRoute: "/criteria",
        nextRoute: "/gates",
        what: "Operator retrieval debug: ask the knowledge base the same way a producer would, and inspect what the tools actually fetched.",
        how: [
          "Answer mode writes a cited response. Passages mode stops at retrieved chunks so you can judge recall without the model’s prose.",
          "Pin a version or leave All. Kind switches requirements vs regulations (general regs, ETI, guidance).",
          "The right-hand panel lists citations. An ungrounded citation — a criterion the tools never returned — is a failure, not a flourish.",
        ],
      }),
      page({
        icon: "🛡️",
        title: "Gates",
        selector: "#tour-gates",
        prevRoute: "/search",
        nextRoute: "/review",
        what: "Quality gates are numbers the publisher stated independently of our parse. A version cannot be published while a blocking gate fails.",
        how: [
          "Pick a version and Show. Blocking failures stop approved → published. Advisory failures are warnings.",
          "Typical checks: criterion count, GUID uniqueness, level totals, section tree, applicability mappings.",
          "If a count is wrong, fix ingest (re-parse) rather than editing the database. Refresh with `?refresh=true` on the API if you just re-ran gates.",
        ],
      }),
      page({
        icon: "🔏",
        title: "Review",
        selector: "#tour-review",
        prevRoute: "/gates",
        nextRoute: "/diff",
        what: "Human sign-off. A review is a named person and a stored decision — not a checkbox on a model output.",
        how: [
          "Select the version, enter the reviewer, choose approved / rejected / changes requested, add notes, then Record review.",
          "Promote moves status along the allowed path (for example extracted → validation → review → approved → published).",
          "Published is blocked until blocking gates pass. The table is the history for that version.",
        ],
      }),
      page({
        icon: "🔗",
        title: "Compare",
        selector: "#tour-compare",
        prevRoute: "/review",
        nextRoute: "/watch",
        what: "Stored relationships between any two ingested versions. Pair Smart and GFS, IFA v5 and v6, or two unrelated editions if links exist.",
        how: [
          "Choose From and To, then Compare. Linked pairs is the full correspondence set; level changes highlights where the requirement got stricter or looser.",
          "Open a pair in Criteria if you need the full text. Empty scope means ingest at least two versions first.",
        ],
      }),
      page({
        icon: "📡",
        title: "Watch",
        selector: "#tour-watch",
        prevRoute: "/diff",
        nextRoute: "/demo",
        what: "Publisher drift. HEAD every known URL and scrape discovery pages for documents the manifest does not list. New URLs are reported, never ingested.",
        how: [
          "Check for drift. Changed means Last-Modified or bytes moved. Unreachable means the URL failed.",
          "Undeclared files are candidates for the source manifest — add them in a reviewed change, then fetch.",
          "Run this when a standard is rumoured to have updated, not on every page load.",
        ],
      }),
      page({
        icon: "📅",
        title: "Demos",
        selector: "#tour-demo",
        prevRoute: "/watch",
        nextRoute: "/audit",
        what: "Inbox for the public Book a Demo form. This is sales operations, not knowledge-base data.",
        how: [
          "New requests show name, company, email, interests and message.",
          "Mark contacted or closed from the row. Notes stay on the request.",
          "Nothing here is ingested into the standards catalog.",
        ],
      }),
      page({
        icon: "🗂️",
        title: "Audit",
        selector: "#tour-audit",
        prevRoute: "/demo",
        nextRoute: "/",
        what: "Append-only trail of operator actions: ingest jobs, reviews, promotions, demo-status changes. Read it when something moved and you need who and when.",
        how: [
          "Actor is the operator or system that performed the action.",
          "Entity type plus action tell you what changed. Drill the API `/audit` if you need metadata.",
          "This log is not the producer farm audit — that lives in the user app.",
        ],
      }),
      page({
        icon: "✨",
        title: "Replay anytime",
        selector: "#tour-help",
        side: "bottom-right",
        prevRoute: "/audit",
        disableInteraction: false,
        what: "That is every console page. Use Tour in the header whenever you want this walkthrough again.",
        how: [
          "The certification filter still scopes lists after the tour ends.",
          "If a page looks empty, check the filter and whether that version has been ingested.",
        ],
      }),
    ],
  },
];
