# Inside the official IFA v6 checklist workbook

Reverse-engineered from the real files. Every range, column letter and count
here was read out of the published workbooks, not inferred.

```
240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx
240902_IFA_GFS_checklist_FV_v6_0-GFS_Aug24_protected_en.xlsx
```

## Why this is the primary extraction source, not the PDF

The obvious plan is to parse the 80-page P&C PDF and use AI to pull out
requirements. That is the wrong plan.

The checklist workbook is a **normalized relational database** that GLOBALG.A.P.
exports from its internal system. It contains the same criterion text as the
PDF, plus the publisher's own stable GUIDs, the section hierarchy, the level
lookup, and the complete applicability logic. Extraction from it is
deterministic and lossless. No model, no review of model output, no
hallucination surface.

The PDF's remaining job is narrow and important: it supplies **page numbers**
for citations, and an independent copy of the text to reconcile against.

## Sheets

| Sheet | Purpose |
| --- | --- |
| `Steps` | GLOBALG.A.P.'s own internal regeneration runbook. Ignore, but revealing — it confirms the workbook is a system export. |
| `PI` | **The criteria table.** One row per criterion, fully normalized. |
| `S` | Section and subsection tables, including other scopes. |
| `PQ` | Criterion-to-scoping-question mappings. |
| `Static ID Table` | The level GUID lookup. |
| `Cover`, `Instructions`, `Audit notes` | Human-facing. `Instructions` also hosts the scoping questions. |
| `P&Cs` | The rendered, human-readable checklist. Derived from `PI`; do not import from here. |
| `Version-Edition update register` | Change log for the version. |

## Named tables

Read these by table name from `xl/tables/*.xml` rather than by sheet position.
The names are stable across both editions; the ranges are not.

| Table | Smart range | GFS range | Contents |
| --- | --- | --- | --- |
| `PIs` | `A1:W191` | `A1:W192` | Criteria, one per row |
| `allsections` | `A2:D331` | `A2:D331` | Every section across all IFA scopes |
| `unique_sections` | `F2:I35` | `F2:I35` | The 33 F&V sections |
| `unique_sub` | `K2:N40` | `K2:N41` | F&V subsections (38 Smart, 39 GFS) |
| `S2PQ` | `C10:H26` | `C10:H26` | The 16 scoping questions |
| `S2PQ_relational` | `A1:D251` | `A1:D146` | Question-to-criterion mappings (250 Smart, 145 GFS) |
| `Level` | `A3:B7` | `A3:B7` | Level GUID to label |

## The `PIs` table

The core of the import. Columns, by letter:

| Col | Field | Notes |
| --- | --- | --- |
| `A` | `GUID` | **Publisher's stable criterion ID.** e.g. `1Gmd3v6po0V454XQEGKJ0x` |
| `C` | `Number` | Human criterion number, e.g. `FV-Smart 32.10.06` |
| `D` | `PGUID` | Principle GUID |
| `E` | `P` | Principle text — the outcome to achieve |
| `F` | `CGUID` | Criteria GUID |
| `G` | `C` | Criteria text — how compliance is demonstrated |
| `H` | `L` | Level GUID |
| `I` | `Level` | Resolved level label |
| `N` | `SGUID` | Section GUID |
| `O` | `S` | Section title |
| `Q` | `Order` | Section ordinal |
| `R` | `SSGUID` | Subsection GUID |
| `S` | `SS` | Subsection title |
| `U` | `Column2` | Linked scoping question GUID |
| `V` | `NA Exempt` | Whether the criterion can be marked not applicable |
| `W` | `PHU` | Product handling unit relevance |

**Store `P` and `C` separately.** They are different things: the principle is
the required outcome, the criteria is the evidence expectation. Concatenating
them into one `text` blob throws away a distinction the agent needs in order to
answer "what must I achieve" versus "what will the auditor look at".

`A` is the right value for `requirements.stable_key`. It is the publisher's own
answer to "is this the same requirement", it survives renumbering, and it lets
Smart and GFS criteria be matched without text heuristics.

## The applicability engine

PRD section 29 asks for applicability rules. GLOBALG.A.P. ships them.

`S2PQ` on the `Instructions` sheet holds **16 scoping questions**, each with a
GUID and the official justification sentence to use when the answer excludes a
criterion:

| Col | Field |
| --- | --- |
| `C` | `S2PQGUID` |
| `D` | `Effective Number` |
| `F` | `Step 2 questions` |
| `G` | `Answer` |
| `H` | `Justification` |

Real examples:

- *"Has the producer used subcontractors and/or service providers during the certification cycle?"*
- *"Has the producer been registered for parallel ownership?"*

`S2PQ_relational` maps them to criteria:

| Col | Field |
| --- | --- |
| `A` | `PIGUID` |
| `B` | `PQGUID` |
| `C` | `N:N ID` — concatenation of A and B |
| `D` | `PIGUID & "NO"` — composite key |

Answering **No** to a question removes its mapped criteria, and the workbook
supplies the exact wording for the justification. That is a complete,
source-authoritative applicability engine: 250 rules for Smart, 145 for GFS.

## Parsing traps

Four things will silently corrupt an import.

**1. Values live in cached formula results.** Most cells are formula cells:

```xml
<c r="I2" t="str">
  <f>INDEX(Level[Level],MATCH(PIs[[#This Row],[L]],Level[GUID],0),1)</f>
  <v>Major Must</v>
</c>
```

Read `<v>`. A parser that only handles literal cells returns almost nothing
from this workbook.

**2. Placeholders masquerade as data.** The workbook uses `-` as a visual
"empty", and leaves Excel errors in cached results: `#N/A`, `#REF!`. Imported
literally these become requirement text and section titles. Normalize to null
at the single point of entry.

**3. `Recom.` is not `Recommendation`.** The `Level` table abbreviates it.
Missing this leaves 20 criteria per edition unclassified and breaks the level
count gate.

**4. Shared strings are indirect.** Cells with `t="s"` hold an index into
`xl/sharedStrings.xml`, not text. A cell's `<v>` of `42` may be the number 42
or shared string 42 depending on `t`.

## Cross-edition comparison

Both editions share table names, the same 16 scoping questions, the same 33
sections and the same `Level` lookup. One parser handles both; only the ranges
differ.

The GFS edition has 1 more criterion (191 vs 190) and a markedly harsher
grading: 118 Major Musts against Smart's 103. That difference is the substance
of what "GFSI-recognized" costs a producer, and it falls straight out of the
data — no interpretation required.
