"use client";

import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 10;

export function pageOf<T>(items: readonly T[], page: number, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * size;
  return { page: current, pages, total, start, rows: items.slice(start, start + size) };
}

export function ListPager({
  page,
  pages,
  total,
  start,
  size = PAGE_SIZE,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  start: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const end = Math.min(start + size, total);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {start + 1}–{end} of {total}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            {page} / {pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
