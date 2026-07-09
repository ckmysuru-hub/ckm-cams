import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Deliberately minimal on mobile: big-enough tap targets (h-9, matching the
 * app's own touch-target convention), just Prev / "3 of 12" / Next - no row
 * of numbered page buttons, which either wrap awkwardly or force horizontal
 * scroll on a phone. Numbered buttons + the page-size selector only appear
 * from sm: up where there's room for them.
 */
export default function Pagination({ page, totalPages, totalItems, pageSize, setPage, setPageSize, testId }) {
  if (totalItems === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pageNumbers = () => {
    const nums = new Set([1, totalPages, page, page - 1, page + 1]);
    return [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4" data-testid={testId || "pagination"}>
      <div className="text-xs text-[var(--ck-muted)] order-2 sm:order-1">
        Showing <span className="font-medium text-[var(--ck-black)]">{start}–{end}</span> of{" "}
        <span className="font-medium text-[var(--ck-black)]">{totalItems}</span>
      </div>

      <div className="flex items-center gap-1.5 order-1 sm:order-2">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          data-testid="pagination-prev"
          className="h-9 w-9 flex items-center justify-center rounded-md border border-[var(--ck-line)] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--ck-orange)] shrink-0"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Compact page indicator - always visible, primary way to track position on mobile */}
        <span className="text-sm px-2 tabular-nums sm:hidden" data-testid="pagination-indicator">
          {page} / {totalPages}
        </span>

        {/* Numbered buttons with ellipsis gaps - room for these from sm: up only */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers().map((n, i, arr) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - arr[i - 1] > 1 && <span className="text-[var(--ck-muted)] px-1">…</span>}
              <button
                type="button"
                onClick={() => setPage(n)}
                data-testid={`pagination-page-${n}`}
                className={`h-9 min-w-9 px-2 flex items-center justify-center rounded-md border text-sm tabular-nums ${
                  n === page
                    ? "border-[var(--ck-orange)] bg-[var(--ck-orange)] text-white font-semibold"
                    : "border-[var(--ck-line)] bg-white hover:border-[var(--ck-orange)]"
                }`}
              >
                {n}
              </button>
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          data-testid="pagination-next"
          className="h-9 w-9 flex items-center justify-center rounded-md border border-[var(--ck-line)] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--ck-orange)] shrink-0"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>

        {setPageSize && (
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            data-testid="pagination-page-size"
            className="hidden sm:block h-9 ml-1 px-2 rounded-md border border-[var(--ck-line)] bg-white text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n} / page</option>))}
          </select>
        )}
      </div>
    </div>
  );
}
