import { describe, expect, test } from "bun:test";
import { dateGroup, groupByDate } from "../src/dates.ts";

describe("dateGroup", () => {
  const now = new Date(2026, 7, 22, 15);

  test("buckets relative to today", () => {
    expect(dateGroup(new Date(2026, 7, 22, 8).toISOString(), now)).toBe("Today");
    expect(dateGroup(new Date(2026, 7, 21, 23).toISOString(), now)).toBe("Yesterday");
    expect(dateGroup(new Date(2026, 7, 18, 12).toISOString(), now)).toBe("Previous 7 days");
    expect(dateGroup(new Date(2026, 6, 1, 12).toISOString(), now)).toBe("Older");
  });

  test("groups conversations in Claude order", () => {
    const items = [
      { id: "1", updatedAt: new Date(2026, 7, 22, 10).toISOString() },
      { id: "2", updatedAt: new Date(2026, 7, 21, 10).toISOString() },
      { id: "3", updatedAt: new Date(2026, 7, 16, 10).toISOString() },
      { id: "4", updatedAt: new Date(2026, 0, 1, 10).toISOString() },
    ];
    expect(groupByDate(items, now).map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Older",
    ]);
  });
});
