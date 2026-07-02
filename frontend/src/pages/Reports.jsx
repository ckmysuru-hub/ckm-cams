import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const REPORTS = [
  { id: "monthly-payments", title: "Monthly Payments", amountKey: "amount" },
  { id: "coach-attendance", title: "Monthly Coach Attendance" },
  { id: "pending-payments", title: "Pending Payments & Outstanding Balance", amountKey: "balance" },
];

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;
const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function Reports() {
  const [reportType, setReportType] = useState("monthly-payments");
  const [range, setRange] = useState({ start_date: monthStart(), end_date: today() });
  const [report, setReport] = useState({ title: "", headers: [], rows: [], totals: {} });
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => REPORTS.find((r)=>r.id === reportType) || REPORTS[0], [reportType]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/reports/${reportType}`, { params: range });
      setReport(data);
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [reportType]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (format) => {
    try {
      const { data } = await api.get(`/reports/${reportType}`, {
        params: { ...range, format },
        responseType: "blob",
      });
      const ext = format === "pdf" ? "pdf" : "csv";
      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}-${range.start_date}-${range.end_date}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${format === "pdf" ? "PDF" : "Excel"} report`);
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail));
    }
  };

  const amountTotal = selected.amountKey === "balance" ? report.totals?.balance : report.totals?.amount;

  return (
    <>
      <PageHeader
        eyebrow="Director"
        title="Reports"
        subtitle="Filter operational reports by date range and download Excel or PDF copies."
      />

      <div className="ck-card-elevated p-4 mb-4 grid lg:grid-cols-6 gap-3 items-end" data-testid="reports-toolbar">
        <div className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Report</div>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORTS.map((r)=>(<SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <Field label="From">
          <Input type="date" value={range.start_date} onChange={(e)=>setRange({ ...range, start_date: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.end_date} onChange={(e)=>setRange({ ...range, end_date: e.target.value })} />
        </Field>
        <button onClick={load} disabled={loading} className="ck-btn-primary flex items-center justify-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Apply
        </button>
        <div className="flex gap-2">
          <button onClick={()=>download("excel")} className="ck-btn-ghost flex-1 flex items-center justify-center gap-2 text-xs">
            <FileSpreadsheet size={14}/> Excel
          </button>
          <button onClick={()=>download("pdf")} className="ck-btn-ghost flex-1 flex items-center justify-center gap-2 text-xs">
            <FileText size={14}/> PDF
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Stat label="Rows" value={report.totals?.rows || 0} />
        <Stat label={selected.amountKey === "balance" ? "Outstanding" : "Amount"} value={fmtMoney(amountTotal)} />
        <Stat label="Date range" value={`${range.start_date} to ${range.end_date}`} small />
      </div>

      <div className="ck-card-elevated p-2 overflow-x-auto">
        <div className="flex items-center justify-between gap-3 px-2 py-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Preview</div>
            <div className="ck-display text-xl font-semibold">{report.title || selected.title}</div>
          </div>
          <button onClick={()=>download("excel")} className="att-btn inline-flex items-center gap-1">
            <Download size={12}/> Download
          </button>
        </div>
        <table className="w-full ck-table text-sm" data-testid="reports-table">
          <thead>
            <tr className="text-left">
              {(report.headers || []).map((h, i)=>(
                <th key={h} className={i === 0 ? "px-4 py-3" : ""}>{h.replaceAll("_", " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report.rows || []).slice(0, 100).map((row, idx)=>(
              <tr key={idx}>
                {(report.headers || []).map((h, i)=>(
                  <td key={h} className={i === 0 ? "px-4 py-3" : ""}>{row[h]}</td>
                ))}
              </tr>
            ))}
            {!report.rows?.length && (
              <tr><td colSpan={Math.max(report.headers?.length || 1, 1)} className="text-center text-[var(--ck-muted)] py-8">No rows match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="ck-card-elevated p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-[var(--ck-orange)] text-white flex items-center justify-center">
        <BarChart3 size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">{label}</div>
        <div className={`ck-display font-semibold truncate ${small ? "text-base" : "text-2xl"}`}>{value}</div>
      </div>
    </div>
  );
}
