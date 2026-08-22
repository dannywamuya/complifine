/**
 * Canonical ETI Base Code outline (English, official).
 *
 * The Base Code is short and stable (last amended 1 April 2014, ETI/V1/04/18).
 * We keep the publisher's numbering and titles here so parsing is matching
 * known clauses against PDF text, not inventing a structure from layout.
 * Bodies are filled from the PDF; titles here are the official headings.
 */

export interface EtiClause {
  readonly number: string;
  readonly title: string;
  readonly parentNumber: string | null;
}

export const ETI_CLAUSES: readonly EtiClause[] = [
  { number: "1", title: "Employment is freely chosen", parentNumber: null },
  {
    number: "1.1",
    title: "There is no forced, bonded or involuntary prison labour",
    parentNumber: "1",
  },
  {
    number: "1.2",
    title:
      "Workers are not required to lodge deposits or their identity papers with their employer",
    parentNumber: "1",
  },
  {
    number: "2",
    title: "Freedom of association and the right to collective bargaining are respected",
    parentNumber: null,
  },
  {
    number: "2.1",
    title:
      "Workers, without distinction, have the right to join or form trade unions of their own choosing and to bargain collectively",
    parentNumber: "2",
  },
  {
    number: "2.2",
    title:
      "The employer adopts an open attitude towards the activities of trade unions and their organisational activities",
    parentNumber: "2",
  },
  {
    number: "2.3",
    title:
      "Workers representatives are not discriminated against and have access to carry out their representative functions in the workplace",
    parentNumber: "2",
  },
  {
    number: "2.4",
    title:
      "Where the right to freedom of association and collective bargaining is restricted under law, the employer facilitates parallel means for independent and free association and bargaining",
    parentNumber: "2",
  },
  { number: "3", title: "Working conditions are safe and hygienic", parentNumber: null },
  {
    number: "3.1",
    title:
      "A safe and hygienic working environment shall be provided, bearing in mind the prevailing knowledge of the industry and of any specific hazards",
    parentNumber: "3",
  },
  {
    number: "3.2",
    title: "Adequate steps shall be taken to prevent accidents and injury to health",
    parentNumber: "3",
  },
  {
    number: "3.3",
    title: "Workers shall receive regular and recorded health and safety training",
    parentNumber: "3",
  },
  {
    number: "3.4",
    title: "Access to clean toilet facilities and to potable water, and if appropriate, sanitary facilities for food storage shall be provided",
    parentNumber: "3",
  },
  {
    number: "3.5",
    title: "Accommodation, where provided, shall be clean, safe, and meet the basic needs of the workers",
    parentNumber: "3",
  },
  {
    number: "3.6",
    title:
      "The company observing the code shall assign responsibility for health and safety to a senior management representative",
    parentNumber: "3",
  },
  { number: "4", title: "Child labour shall not be used", parentNumber: null },
  {
    number: "4.1",
    title: "There shall be no new recruitment of child labour",
    parentNumber: "4",
  },
  {
    number: "4.2",
    title:
      "Companies shall develop or participate in and contribute to policies and programmes which provide for the transition of any child found to be performing child labour to enable her or him to attend and remain in quality education until no longer a child",
    parentNumber: "4",
  },
  {
    number: "4.3",
    title: "Children and young persons under 18 shall not be employed at night or in hazardous conditions",
    parentNumber: "4",
  },
  {
    number: "4.4",
    title:
      "These policies and procedures shall conform to the provisions of the relevant ILO standards",
    parentNumber: "4",
  },
  { number: "5", title: "Living wages are paid", parentNumber: null },
  {
    number: "5.1",
    title:
      "Wages and benefits paid for a standard working week meet, at a minimum, national legal standards or industry benchmark standards, whichever is higher. In any event wages should always be enough to meet basic needs and to provide some discretionary income",
    parentNumber: "5",
  },
  {
    number: "5.2",
    title:
      "All workers shall be provided with written and understandable information about their employment conditions in respect to wages before they enter employment and about the particulars of their wages for the pay period concerned each time that they are paid",
    parentNumber: "5",
  },
  {
    number: "5.3",
    title:
      "Deductions from wages as a disciplinary measure shall not be permitted nor shall any deductions from wages not provided for by national law be permitted without the expressed permission of the worker concerned",
    parentNumber: "5",
  },
  { number: "6", title: "Working hours are not excessive", parentNumber: null },
  {
    number: "6.1",
    title:
      "Working hours must comply with national laws, collective agreements, and the provisions of 6.2 to 6.6 below, whichever affords the greater protection for workers",
    parentNumber: "6",
  },
  {
    number: "6.2",
    title:
      "Working hours, excluding overtime, shall be defined by contract, and shall not exceed 48 hours per week",
    parentNumber: "6",
  },
  {
    number: "6.3",
    title: "All overtime shall be voluntary. Overtime shall be used responsibly",
    parentNumber: "6",
  },
  {
    number: "6.4",
    title:
      "The total hours worked in any seven day period shall not exceed 60 hours, except in exceptional circumstances",
    parentNumber: "6",
  },
  {
    number: "6.5",
    title: "Workers shall be provided with at least one day off in every seven day period or, where allowed by national law, two days off in every 14 day period",
    parentNumber: "6",
  },
  { number: "7", title: "No discrimination is practised", parentNumber: null },
  {
    number: "7.1",
    title:
      "There is no discrimination in hiring, compensation, access to training, promotion, termination or retirement based on race, caste, national origin, religion, age, disability, gender, marital status, sexual orientation, union membership or political affiliation",
    parentNumber: "7",
  },
  { number: "8", title: "Regular employment is provided", parentNumber: null },
  {
    number: "8.1",
    title:
      "To every extent possible work performed must be on the basis of recognised employment relationship established through national law and practice",
    parentNumber: "8",
  },
  {
    number: "8.2",
    title:
      "Obligations to employees under labour or social security laws and regulations arising from the regular employment relationship shall not be avoided through the use of labour-only contracting, sub-contracting, or home-working arrangements, or through apprenticeship schemes where there is no real intent to impart skills or provide regular employment, nor shall any such obligations be avoided through the excessive use of fixed-term contracts of employment",
    parentNumber: "8",
  },
  { number: "9", title: "No harsh or inhumane treatment is allowed", parentNumber: null },
  {
    number: "9.1",
    title:
      "Physical abuse or discipline, the threat of physical abuse, sexual or other harassment and verbal abuse or other forms of intimidation shall be prohibited",
    parentNumber: "9",
  },
];

export function etiStableKey(number: string): string {
  return `eti:${number}`;
}

export function etiSortKey(number: string): number {
  const parts = number.split(".").map((p) => Number.parseInt(p, 10));
  return (parts[0] ?? 0) * 100 + (parts[1] ?? 0);
}
