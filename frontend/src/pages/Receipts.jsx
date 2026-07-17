import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { SortableHead, applySort } from "@/components/SortableHead";
import { toast } from "sonner";
import { usePagination } from "@/lib/usePagination";
import Pagination from "@/components/Pagination";
import TableActions, { TableActionItem } from "@/components/TableActions";

const fmt = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function Receipts() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });

  useEffect(() => { api.get("/receipts").then((r)=>setItems(r.data)); }, []);

  const filtered = items.filter((r) => {
    if (filterMode !== "all" && r.mode !== filterMode) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${r.receipt_no} ${r.student_name} ${r.student_code || ""} ${r.invoice_no || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const sorted = applySort(filtered, sort);
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages, totalItems } = usePagination(sorted, 20);

  const exportCsv = () => {
    const rows = sorted.map((r) => ({
      receipt_no: r.receipt_no, invoice_no: r.invoice_no, student_name: r.student_name,
      date: r.created_at?.slice(0,10), mode: r.mode, amount: r.amount,
      transaction_ref: r.transaction_ref || "", received_by: r.received_by || "",
    }));
    if (!rows.length) { toast.error("Nothing to export"); return; }
    downloadCsv(rows, `chessklub-receipts-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success(`Exported ${rows.length} receipt${rows.length === 1 ? "" : "s"}`);
  };

  const downloadReceiptPdf = async (receipt) => {
    try {
      const { data } = await api.get(`/receipts/${receipt.id}/pdf`, { responseType: "blob" });
      downloadBlob(data, `${receipt.receipt_no || "receipt"}.pdf`);
    } catch {
      toast.error("Could not download receipt PDF");
    }
  };

  return (
    <>
      <PageHeader eyebrow="Cashbook" title="Receipts" subtitle="Every payment received — branded PDFs ready to share." />
      <div className="ck-card-elevated p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="receipts-toolbar">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Search size={16} className="text-[var(--ck-muted)]" />
          <input
            placeholder="Search receipt / student…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            className="flex-1 outline-none bg-transparent text-sm"
            data-testid="receipt-search"
          />
        </div>
        <Select value={filterMode} onValueChange={setFilterMode}>
          <SelectTrigger className="w-[160px] h-9" data-testid="receipt-mode-filter"><Filter size={12} className="mr-1"/><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="razorpay">Razorpay</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={exportCsv} className="ck-btn-ghost text-xs flex items-center gap-1" data-testid="receipts-export">
          <Download size={12}/> Export
        </button>
        <span className="text-xs text-[var(--ck-muted)] ml-1">{sorted.length} of {items.length}</span>
      </div>
      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="receipts-table">
          <thead>
            <tr className="text-left">
              <SortableHead className="px-4 py-3" label="Receipt" sortKey="receipt_no" sort={sort} onSort={setSort} />
              <SortableHead label="Student" sortKey="student_name" sort={sort} onSort={setSort} />
              <SortableHead label="Date" sortKey="created_at" sort={sort} onSort={setSort} />
              <SortableHead label="Mode" sortKey="mode" sort={sort} onSort={setSort} />
              <SortableHead className="text-right" label="Amount" sortKey="amount" sort={sort} onSort={setSort} />
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r)=>(
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  <span className="font-semibold">{r.receipt_no}</span>
                </td>
                <td>{r.student_name}</td>
                <td className="text-[var(--ck-muted)]">{r.created_at?.slice(0,10)}</td>
                <td className="uppercase text-xs">{r.mode}</td>
                <td className="text-right font-medium">{fmt(r.amount)}</td>
                <td className="text-right pr-4">
                  <TableActions testId={`receipt-actions-${r.id}`}>
                    <TableActionItem icon={Download} onSelect={()=>downloadReceiptPdf(r)} data-testid={`rcp-pdf-${r.id}`}>Download PDF</TableActionItem>
                  </TableActions>
                </td>
              </tr>
            ))}
            {!sorted.length && (<tr><td colSpan="6" className="text-center text-[var(--ck-muted)] py-8">No receipts match the current filters.</td></tr>)}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems}
                  pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testId="receipts-pagination" />
    </>
  );
}
