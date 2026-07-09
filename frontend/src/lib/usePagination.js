import { useEffect, useMemo, useState } from "react";

/**
 * Client-side pagination over an already-filtered/sorted array. Keeping this
 * client-side (rather than moving filtering/sorting/paging server-side) is a
 * deliberate choice: it makes pagination a pure display concern on top of the
 * existing filter/search/sort logic on each page, with zero risk of changing
 * how search or filters currently behave.
 *
 * Automatically clamps back to a valid page if the source list shrinks out
 * from under the current page (e.g. the user applies a filter while on page
 * 3 and there's now only 1 page of results) - otherwise you'd land on a
 * blank page with no obvious way back.
 */
export function usePagination(items, initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(() => {
    const clampedPage = Math.min(page, totalPages);
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize, totalPages]);

  // Whenever the *content* of the filtered/sorted list changes (a new
  // search term, a filter toggled, items added/removed), jump back to page 1
  // rather than staying on whatever page happened to be selected - landing
  // on "page 4 of 1" after narrowing a search is confusing.
  const resetKey = JSON.stringify(items.map((i) => i.id ?? i));
  useEffect(() => { setPage(1); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    page: Math.min(page, totalPages),
    setPage,
    pageSize,
    setPageSize: (n) => { setPageSize(n); setPage(1); },
    pageItems,
    totalPages,
    totalItems,
  };
}
