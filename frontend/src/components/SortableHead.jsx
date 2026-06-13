import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

/** SortableHead — click to cycle sort direction. Caller maintains `sort` state ({ key, dir: "asc"|"desc"|null }). */
export function SortableHead({ label, sortKey, sort, onSort, className, align = "left" }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} data-testid={`sort-${sortKey}`}>
      <button
        type="button"
        onClick={() => {
          if (!active) onSort({ key: sortKey, dir: "asc" });
          else if (sort.dir === "asc") onSort({ key: sortKey, dir: "desc" });
          else onSort({ key: null, dir: null });
        }}
        className={`inline-flex items-center gap-1 hover:text-[var(--ck-black)] ${align === "right" ? "ml-auto" : ""} ${active ? "text-[var(--ck-orange)]" : ""}`}
      >
        {label} <Icon size={11} className={active ? "opacity-100" : "opacity-40"} />
      </button>
    </th>
  );
}

export function applySort(rows, sort, accessors = {}) {
  if (!sort?.key) return rows;
  const get = accessors[sort.key] || ((r) => r[sort.key]);
  const sign = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = get(a); const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
