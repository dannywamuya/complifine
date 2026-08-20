import { describe, expect, test } from "bun:test";
import {
  flagBool,
  flagList,
  flagString,
  formatDuration,
  parseArgs,
} from "../src/cli-support.ts";

describe("parseArgs", () => {
  test("takes the first token as the command", () => {
    expect(parseArgs(["gates"]).command).toBe("gates");
    expect(parseArgs([]).command).toBe("help");
  });

  test("reads both --flag value and --flag=value", () => {
    expect(flagString(parseArgs(["gates", "--version", "ifa-v6-smart-fv"]), "version")).toBe(
      "ifa-v6-smart-fv",
    );
    expect(flagString(parseArgs(["gates", "--version=ifa-v6-gfs-fv"]), "version")).toBe(
      "ifa-v6-gfs-fv",
    );
  });

  test("treats a flag with no value as boolean", () => {
    const args = parseArgs(["fetch", "--force"]);
    expect(flagBool(args, "force")).toBe(true);
    expect(flagBool(args, "json")).toBe(false);
  });

  // Without this, `kb fetch --force --slug x` would consume `--slug` as the
  // value of `--force` and then silently fetch everything.
  test("does not consume the next flag as a value", () => {
    const args = parseArgs(["fetch", "--force", "--slug", "a,b"]);
    expect(flagBool(args, "force")).toBe(true);
    expect(flagList(args, "slug")).toEqual(["a", "b"]);
  });

  test("collects positional arguments", () => {
    const args = parseArgs(["show", "FV-Smart 32.10.06", "--json"]);
    expect(args.positional).toEqual(["FV-Smart 32.10.06"]);
    expect(flagBool(args, "json")).toBe(true);
  });

  test("splits and trims a comma-separated list, dropping blanks", () => {
    expect(flagList(parseArgs(["fetch", "--slug", " a , b ,, c "]), "slug")).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(flagList(parseArgs(["fetch"]), "slug")).toEqual([]);
  });

  test("keeps a value containing an equals sign intact after the first one", () => {
    expect(flagString(parseArgs(["review", "--notes=checked a=b"]), "notes")).toBe("checked a=b");
  });
});

describe("formatDuration", () => {
  test("scales the unit to the magnitude", () => {
    expect(formatDuration(250)).toBe("250ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(65_000)).toBe("1m 5s");
  });
});
