import { describe, expect, test } from "bun:test";
import { toFirstPersonQuestion } from "../src/lib/first-person.ts";

describe("toFirstPersonQuestion", () => {
  test("rewrites GLOBALG.A.P. producer questions into second person", () => {
    expect(toFirstPersonQuestion("Has the producer been registered for parallel ownership?")).toBe(
      "Have you been registered for parallel ownership?",
    );
    expect(
      toFirstPersonQuestion(
        "Has the producer used subcontractors and/or service providers during the certification cycle?",
      ),
    ).toBe("Have you used subcontractors and/or service providers during the certification cycle?");
    expect(toFirstPersonQuestion("Does the producer apply plant protection products?")).toBe(
      "Do you apply plant protection products?",
    );
    expect(toFirstPersonQuestion("Is the producer a member of a producer group?")).toBe(
      "Are you a member of a producer group?",
    );
  });

  test("turns possessives into your", () => {
    expect(toFirstPersonQuestion("Are workers transported in the producer's vehicles?")).toBe(
      "Are workers transported in your vehicles?",
    );
  });

  test("leaves questions that are already first person alone", () => {
    expect(toFirstPersonQuestion("Do you harvest produce on this site?")).toBe(
      "Do you harvest produce on this site?",
    );
  });
});
