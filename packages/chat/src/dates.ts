export type DateGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";

const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "Previous 7 days", "Older"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateGroup(iso: string, now = new Date()): DateGroup {
  const day = startOfDay(new Date(iso));
  if (Number.isNaN(day.getTime())) return "Older";
  const today = startOfDay(now);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff <= 7) return "Previous 7 days";
  return "Older";
}

export function groupByDate<T extends { updatedAt: string }>(
  items: T[],
  now = new Date(),
): Array<{ label: DateGroup; items: T[] }> {
  const buckets = new Map<DateGroup, T[]>();
  for (const item of items) {
    const label = dateGroup(item.updatedAt, now);
    const list = buckets.get(label) ?? [];
    list.push(item);
    buckets.set(label, list);
  }
  return GROUP_ORDER.filter((label) => (buckets.get(label)?.length ?? 0) > 0).map((label) => ({
    label,
    items: buckets.get(label)!,
  }));
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
