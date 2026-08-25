import type { ReactNode } from "react";
import type { Step, Tour } from "nextstepjs";

export const ONBOARDING_TOUR = "producer";
export const ONBOARDING_STORAGE_KEY = "cf_producer_onboarding";
export const ONBOARDING_PENDING_KEY = "cf_producer_tour_pending";

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
    window.localStorage.removeItem(ONBOARDING_PENDING_KEY);
  } catch {
    // private mode
  }
}

export function markTourPending(): void {
  try {
    window.localStorage.setItem(ONBOARDING_PENDING_KEY, "1");
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // private mode
  }
}

export function tourIsPending(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearTourPending(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_PENDING_KEY);
  } catch {
    // private mode
  }
}

const routed = {
  pointerPadding: 8,
  pointerRadius: 12,
  cardOffset: 14,
  disableInteraction: true,
  scrollOffset: 88,
  selectorRetryAttempts: 16,
  selectorRetryDelay: 150,
} as const;

function explain(what: string, how: string[]): ReactNode {
  return (
    <div className="space-y-2">
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
        icon: "💬",
        title: "Chat is the product",
        selector: "#cf-composer",
        side: "top",
        what: "Ask in the words you would use on site. CompliFine retrieves published criteria in this company’s certifications — it is not a general chatbot over PDFs.",
        how: [
          "Describe the situation, or paste a criterion number such as FV-Smart 12.3.2.",
          "A usable answer cites a criterion you can open in Catalog. If the retrieved text does not contain it, the assistant should say so.",
          "Your certification body still decides binding cases. This workspace is for knowing what the published edition says.",
        ],
      }),
      page({
        icon: "📗",
        title: "Which edition to search",
        selector: "#tour-edition",
        side: "top-left",
        what: "This filter is the edition Chat searches. It only lists published editions you attached on Company.",
        how: [
          "One certification: Chat searches that edition. Several: pick one, or All in your scope.",
          "Chat will not cite an edition that is not live, even if you know the name.",
          "Match this filter to the audit you are preparing for — Smart and GFS are different texts.",
        ],
      }),
      page({
        icon: "📍",
        title: "Which site you mean",
        selector: "#tour-site",
        side: "bottom-left",
        what: "This picker is what “us” means. Chat reads this site’s type and the scoping answers saved for it.",
        how: [
          "A farm, packhouse, collection centre, and warehouse are different places. Switch when you move.",
          "Unanswered site questions make answers generic. Finish them under Company → Site questions.",
          "The same company can have two sites with different answers for the same edition.",
        ],
      }),
      page({
        icon: "📂",
        title: "Chat, Catalog, Company",
        selector: "#tour-sidebar",
        side: "bottom-left",
        what: "Three places, one job: ask, read the official wording, then keep the profile Chat reads up to date.",
        how: [
          "Chat is for questions. Catalog is the publisher’s checklist. Company is certificates, sites, and scoping.",
          "Open a citation from Chat and you land on that criterion in Catalog.",
        ],
      }),
      page({
        icon: "🗂️",
        title: "Conversations stay here",
        selector: "#tour-chats",
        side: "bottom-left",
        nextRoute: "/app/criteria",
        what: "Each thread is saved under Chats. Search with / . History is this company’s — not shared with others.",
        how: [
          "Start a new chat when you change site or edition so the thread stays about one context.",
          "Rename or delete from the list. Export is in the header if you need a copy.",
        ],
      }),
      page({
        icon: "📚",
        title: "Published knowledge only",
        selector: "#tour-catalog",
        side: "bottom-left",
        prevRoute: "/app",
        what: "Catalog is the official wording the assistant is allowed to cite. Nothing in pipeline appears here.",
        how: [
          "Pick a certification, then an edition. Binding documents are normative; guidance is labelled as guidance.",
          "If an edition is missing, it is not published yet — or it is not attached on Company.",
        ],
      }),
      page({
        icon: "🌳",
        title: "Certification → edition",
        selector: "#tour-catalog-editions",
        side: "right",
        what: "The tree is the catalog: GLOBALG.A.P. or SMETA, then the published edition. The number is how many criteria are in that edition.",
        how: [
          "Switch editions to read Smart vs GFS, or IFA vs SMETA, as the publisher wrote them.",
          "Chat’s edition filter should match what you are reading, or citations will look like the wrong book.",
        ],
      }),
      page({
        icon: "🔎",
        title: "Find a criterion",
        selector: "#tour-catalog-search",
        side: "bottom-left",
        nextRoute: "/app/company",
        what: "Search by number or principle. Filter by level — Major Must, Minor Must, Recommendation — then open the row.",
        how: [
          "The table is the publisher’s identifiers and principles, not a paraphrase.",
          "When Chat cites a criterion, this is the page that citation should open.",
        ],
      }),
      page({
        icon: "🏢",
        title: "The company holds certificates",
        selector: "#tour-company",
        side: "bottom-left",
        prevRoute: "/app/criteria",
        what: "The company is the legal entity. Sites are the places it operates. Chat uses both: certifications from the company, type and questions from the site.",
        how: [
          "Attach every published edition you are certified against or preparing for. Those are the only editions Chat may cite.",
          "Adding a certification always means answering site questions for it — a packhouse is not a field.",
        ],
      }),
      page({
        icon: "🗂️",
        title: "Sites, certifications, questions",
        selector: "#tour-company-tabs",
        side: "bottom-left",
        what: "Four tabs keep the profile Chat reads. Change something here and the next answer should change with it.",
        how: [
          "Sites: every place you operate — growing, packing, collection, or storage.",
          "Certifications: published editions in scope. Site questions: official applicability, stored per site.",
          "Company: legal name, country, Sedex ZC if you have one.",
        ],
      }),
      page({
        icon: "📍",
        title: "Sites are places, not the company",
        selector: "#tour-company-sites",
        side: "bottom-left",
        nextRoute: "/app",
        what: "Select a site here when you answer questions. The header picker is what Chat uses while you talk.",
        how: [
          "Do not reuse one site for field and packhouse. Add both and answer each.",
          "After you add a site or a certification, finish Site questions before you trust Chat on that combination.",
        ],
      }),
      page({
        icon: "✨",
        title: "Replay this tour",
        selector: "#tour-help",
        side: "bottom-right",
        prevRoute: "/app/company",
        disableInteraction: false,
        what: "Tour in the header starts this walkthrough again whenever you want it.",
        how: [
          "If an answer looks generic, check the site picker and finish Site questions.",
          "If a citation is missing, open Catalog and confirm the edition is attached and published.",
        ],
      }),
    ],
  },
];
