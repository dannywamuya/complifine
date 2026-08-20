import { describe, expect, test } from "bun:test";
import { identifiersInQuery } from "../src/search/hybrid.ts";

describe("identifiersInQuery", () => {
  test("extracts a fully written criterion number", () => {
    expect(identifiersInQuery("What does FV-Smart 32.10.06 require?")).toEqual([
      "FV-Smart 32.10.06",
    ]);
  });

  test("accepts the lowercase unhyphenated spelling people actually type", () => {
    expect(identifiersInQuery("what does fv smart 20.04.02 say")).toEqual(["FV-Smart 20.04.02"]);
  });

  test("expands a bare number to both editions", () => {
    expect(identifiersInQuery("Explain 30.05.04 for me.")).toEqual([
      "FV-Smart 30.05.04",
      "FV-GFS 30.05.04",
    ]);
  });

  test("restricts a bare number to the edition implied by versionCode", () => {
    expect(identifiersInQuery("32.10.06", "ifa-v6-gfs-fv")).toEqual(["FV-GFS 32.10.06"]);
    expect(identifiersInQuery("32.10.06", "ifa-v6-smart-fv")).toEqual(["FV-Smart 32.10.06"]);
  });

  test("returns nothing for a question that names no criterion", () => {
    expect(identifiersInQuery("When can workers go back into a field after spraying?")).toEqual([]);
  });

  test("does not treat a single integer as a criterion number", () => {
    expect(identifiersInQuery("What does section 32 require?")).toEqual([]);
  });
});
