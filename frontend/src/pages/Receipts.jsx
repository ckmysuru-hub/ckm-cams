import { useEffect, useState } from "react";
import { api, BACKEND_URL } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { FileText } from "lucide-react";

const fmt = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;

export default function Receipts() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/receipts").then((r)=>setItems(r.data)); }, []);
  return (
    <>
      <PageHeader eyebrow="Cashbook" title="Receipts" subtitle="Every payment received — branded PDFs ready to share." />
      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="receipts-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Receipt</th>
              <th>Student</th>
              <th>Date</th>
              <th>Mode</th>
              <th className="text-right">Amount</th>
              <th className="text-right pr-4">PDF</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r)=>(
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs">{r.receipt_no}</td>
                <td>{r.student_name}</td>
                <td className="text-[var(--ck-muted)]">{r.created_at?.slice(0,10)}</td>
                <td className="uppercase text-xs">{r.mode}</td>
                <td className="text-right font-medium">{fmt(r.amount)}</td>
                <td className="text-right pr-4">
                  <a href={`${BACKEND_URL}/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer"
                     className="att-btn inline-flex items-center gap-1" data-testid={`rcp-pdf-${r.id}`}>
                    <FileText size={12}/> Open
                  </a>
                </td>
              </tr>
            ))}
            {!items.length && (<tr><td colSpan="6" className="text-center text-[var(--ck-muted)] py-8">No receipts yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
