import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Bell, IndianRupee, Trash2, Search, Filter, Download, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { SortableHead, applySort } from "@/components/SortableHead";
import { usePagination } from "@/lib/usePagination";
import Pagination from "@/components/Pagination";

const fmt = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0,10);
const monthStr = () => new Date().toISOString().slice(0,7);
const fmtDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace("T", " ");
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
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
const planLabel = (student, level) =>
  student?.billing_type === "postpaid" ? "Postpaid class" :
  student?.payment_plan === "custom" ? (level?.custom_plan_name || "Custom") :
  student?.payment_plan === "quarterly" ? "Quarterly" :
  student?.payment_plan === "annual" ? "Annual" : "Monthly";

export default function Billing() {
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [levels, setLevels] = useState([]);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null); // invoice
  const [form, setForm] = useState({
    student_id: "", period: monthStr(), due_date: today(),
    items: [{ description: "Monthly Tuition Fee", amount: 0 }], discount: 0, notes: ""
  });
  const [pay, setPay] = useState({ amount: 0, mode: "cash", transaction_ref: "" });
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sort, setSort] = useState({ key: "issued_at", dir: "desc" });
  const [runOpen, setRunOpen] = useState(false);
  const [runForm, setRunForm] = useState({
    period: new Date().toISOString().slice(0,7),
    due_date: new Date(new Date().setDate(10)).toISOString().slice(0,10),
    include_pending: true,
  });
  const [runResult, setRunResult] = useState(null);

  const load = () => api.get("/invoices").then((r)=>setItems(r.data));
  useEffect(() => {
    load();
    api.get("/students").then((r)=>setStudents(r.data));
    api.get("/levels").then((r)=>setLevels(r.data));
  }, []);

  const onSelectStudent = async (sid) => {
    setForm((f)=>({ ...f, student_id: sid }));
    const s = students.find((x)=>x.id===sid);
    if (!s) return;
    const newItems = [];
    if (s.level_id) {
      const lv = levels.find((l)=>l.id===s.level_id);
      if (lv) {
        const amt = s.billing_type === "postpaid" ? lv.per_day_fee
                  : s.payment_plan === "custom"    ? lv.custom_fee
                  : s.payment_plan === "quarterly" ? lv.quarterly_fee
                  : s.payment_plan === "annual"    ? lv.annual_fee
                  : lv.monthly_fee;
        newItems.push({
          description: s.billing_type === "postpaid"
            ? `${lv.name} - Postpaid class fee (per day)`
            : `${lv.name} - ${planLabel(s, lv)} fee`,
          amount: Number(amt || 0),
        });
      }
    }
    // Auto-add outstanding balance from prior invoices
    try {
      const { data } = await api.get(`/students/${sid}/pending-balance`);
      if (data.total_balance > 0) {
        toast.info(`₹${data.total_balance.toLocaleString("en-IN")} outstanding will be carried forward and earlier invoice${data.open_invoice_count === 1 ? "" : "s"} cancelled`);
      }
    } catch { /* non-fatal */ }
    if (newItems.length) setForm((f)=>({ ...f, items: newItems }));
  };

  const addItem = () => setForm((f)=>({ ...f, items: [...f.items, { description:"", amount:0 }] }));
  const updItem = (idx, key, val) =>
    setForm((f)=>({ ...f, items: f.items.map((it,i)=> i===idx ? { ...it, [key]: key==="amount"?Number(val||0):val } : it) }));
  const rmItem = (idx) => setForm((f)=>({ ...f, items: f.items.filter((_,i)=>i!==idx) }));

  const itemsTotal = form.items.reduce((a,b)=>a + Number(b.amount||0), 0);
  const discount = Math.min(Math.max(Number(form.discount || 0), 0), itemsTotal);
  const total = itemsTotal - discount;

  const emptyInvoiceForm = () => ({
    student_id: "", period: monthStr(), due_date: today(),
    items: [{ description: "Monthly Tuition Fee", amount: 0 }], discount: 0, notes: ""
  });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/invoices", form);
      toast.success("Invoice created");
      setOpen(false); setForm(emptyInvoiceForm()); load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post("/payments", { invoice_id: payOpen.id, ...pay, amount: Number(pay.amount) });
      toast.success("Payment recorded · receipt generated");
      setPayOpen(null); setPay({ amount:0, mode:"cash", transaction_ref:"" }); load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const remind = async (id) => {
    try {
      const { data } = await api.post(`/invoices/${id}/remind`);
      const wa = data.whatsapp?.mode === "log" ? "WhatsApp logged (mock)" : data.whatsapp?.sent ? "WhatsApp sent" : "—";
      const em = data.email?.mode === "log" ? "Email logged (mock)" : data.email?.sent ? "Email sent" : "—";
      toast.success(`Reminder #${data.reminder_count} fired · ${wa} · ${em}`);
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete invoice?")) return;
    await api.delete(`/invoices/${id}`); load();
  };

  const downloadInvoicePdf = async (inv) => {
    try {
      const { data } = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      downloadBlob(data, `${inv.invoice_no || "invoice"}.pdf`);
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Could not download invoice PDF");
    }
  };

  // Filter + sort
  const filtered = items.filter((inv) => {
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${inv.invoice_no} ${inv.student_name} ${inv.student_code || ""} ${inv.parent_whatsapp || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const sorted = applySort(filtered, sort);
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages, totalItems } = usePagination(sorted, 20);

  const exportCsv = () => {
    const rows = sorted.map((i) => ({
      invoice_no: i.invoice_no, student_name: i.student_name, parent_phone: i.parent_whatsapp || "", period: i.period,
      due_date: i.due_date, amount: i.amount, discount: i.discount || 0, paid: i.paid, balance: i.balance,
      status: i.status, billing_type: i.billing_type || "prepaid",
      postpaid_attendance_count: i.postpaid_attendance_count || "",
      postpaid_per_day_fee: i.postpaid_per_day_fee || "",
      reminder_count: i.reminder_count || 0, last_reminded_at: i.last_reminded_at || "",
      issued_at: (i.issued_at || "").slice(0,10),
    }));
    if (!rows.length) { toast.error("Nothing to export"); return; }
    downloadCsv(rows, `chessklub-invoices-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success(`Exported ${rows.length} invoice${rows.length === 1 ? "" : "s"}`);
  };

  const runMonthly = async (e) => {
    e.preventDefault();
    setRunResult(null);
    try {
      const { data } = await api.post("/billing/monthly-run", runForm);
      setRunResult(data);
      toast.success(`Created ${data.total_created} invoice${data.total_created === 1 ? "" : "s"}`);
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Cashbook"
        title="Billing"
        subtitle="Generate invoices, send reminders and record payments. PDFs are auto-generated."
        actions={
          <>
            <button onClick={() => { setRunForm({
              period: new Date().toISOString().slice(0,7),
              due_date: new Date(new Date().setDate(10)).toISOString().slice(0,10),
              include_pending: true,
            }); setRunResult(null); setRunOpen(true); }}
              className="ck-btn-ghost flex items-center gap-2" data-testid="monthly-run-btn">
              <CalendarPlus size={14}/> Monthly Run
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="ck-btn-primary flex items-center gap-2" data-testid="add-invoice-btn"><Plus size={14}/> New Invoice</button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4" data-testid="invoice-form">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Student" full={false}>
                    <Select value={form.student_id} onValueChange={onSelectStudent}>
                      <SelectTrigger data-testid="if-student"><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {students.map((s)=>(<SelectItem key={s.id} value={s.id}>{s.full_name} · {s.student_code}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Period">
                    <Input data-testid="if-period" value={form.period} onChange={(e)=>setForm({...form, period:e.target.value})} placeholder="2026-02" />
                  </Field>
                  <Field label="Due Date">
                    <Input type="date" data-testid="if-due" value={form.due_date} onChange={(e)=>setForm({...form, due_date:e.target.value})} />
                  </Field>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Line items</Label>
                    <button type="button" className="text-xs text-[var(--ck-orange)] font-semibold" onClick={addItem}>+ Add line</button>
                  </div>
                  {form.items.map((it, idx)=>(
                    <div className="grid grid-cols-12 gap-2 mb-2" key={idx}>
                      <Input data-testid={`if-desc-${idx}`} className="col-span-8" placeholder="Description" value={it.description} onChange={(e)=>updItem(idx,"description",e.target.value)} required />
                      <Input data-testid={`if-amt-${idx}`} className="col-span-3" type="number" placeholder="Amount" value={it.amount} onChange={(e)=>updItem(idx,"amount",e.target.value)} required />
                      <button type="button" onClick={()=>rmItem(idx)} className="col-span-1 text-[var(--ck-muted)] hover:text-red-600"><Trash2 size={14}/></button>
                    </div>
                  ))}

                  <div className="mt-3 max-w-[200px]">
                    <Field label="Discount (₹, optional)">
                      <Input data-testid="if-discount" type="number" min="0" max={itemsTotal} step="1"
                             value={form.discount} onChange={(e)=>setForm({...form, discount: Number(e.target.value || 0)})} />
                    </Field>
                  </div>

                  <div className="text-right text-sm mt-3 space-y-1">
                    <div className="text-[var(--ck-muted)]">Subtotal: {fmt(itemsTotal)}</div>
                    {discount > 0 && <div className="text-[var(--ck-muted)]">Discount: - {fmt(discount)}</div>}
                    <div>Total: <span className="ck-display text-xl font-semibold ml-2">{fmt(total)}</span></div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Notes (optional)</Label>
                  <Textarea data-testid="if-notes" rows={2} placeholder="Visible to staff and printed on the invoice PDF"
                            value={form.notes} onChange={(e)=>setForm({...form, notes: e.target.value})} className="mt-1.5" />
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                  <button type="submit" className="ck-btn-primary" data-testid="if-submit">Create invoice</button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      <div className="ck-card-elevated p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="invoices-toolbar">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Search size={16} className="text-[var(--ck-muted)]" />
          <input
            placeholder="Search invoice no, student or phone…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            className="flex-1 outline-none bg-transparent text-sm"
            data-testid="invoice-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9" data-testid="invoice-status-filter"><Filter size={12} className="mr-1"/><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={exportCsv} className="ck-btn-ghost text-xs flex items-center gap-1" data-testid="invoices-export"><Download size={12}/> Export</button>
        <span className="text-xs text-[var(--ck-muted)] ml-1">{sorted.length} of {items.length}</span>
      </div>

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="invoices-table">
          <thead>
            <tr className="text-left">
              <SortableHead className="px-4 py-3" label="Invoice" sortKey="invoice_no" sort={sort} onSort={setSort} />
              <SortableHead label="Student" sortKey="student_name" sort={sort} onSort={setSort} />
              <th>Parent Phone</th>
              <SortableHead label="Period" sortKey="period" sort={sort} onSort={setSort} />
              <SortableHead label="Due" sortKey="due_date" sort={sort} onSort={setSort} />
              <SortableHead className="text-right" label="Amount" sortKey="amount" sort={sort} onSort={setSort} />
              <SortableHead className="text-right" label="Balance" sortKey="balance" sort={sort} onSort={setSort} />
              <SortableHead label="Last Reminder" sortKey="last_reminded_at" sort={sort} onSort={setSort} />
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((inv)=>(
              <tr key={inv.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  <button
                    type="button"
                    onClick={()=>downloadInvoicePdf(inv)}
                    className="font-semibold text-[var(--ck-orange)] hover:underline"
                    data-testid={`inv-pdf-${inv.id}`}
                    title="Download invoice PDF"
                  >
                    {inv.invoice_no}
                  </button>
                </td>
                <td>{inv.student_name}</td>
                <td className="text-[var(--ck-muted)] text-xs font-mono">{inv.parent_whatsapp || "—"}</td>
                <td className="text-[var(--ck-muted)]">{inv.period}</td>
                <td className="text-[var(--ck-muted)]">{inv.due_date}</td>
                <td className="text-right">{fmt(inv.amount)}</td>
                <td className="text-right font-medium">{fmt(inv.balance)}</td>
                <td className="text-[var(--ck-muted)] text-xs whitespace-nowrap">
                  {inv.last_reminded_at ? fmtDateTime(inv.last_reminded_at) : "—"}
                </td>
                <td className="pr-4">
                  <div className="flex justify-end gap-1">
                    <button
                      className="att-btn flex items-center gap-1"
                      onClick={()=>remind(inv.id)}
                      disabled={inv.status === "paid" || inv.status === "cancelled"}
                      data-testid={`inv-remind-${inv.id}`}
                      title={`${inv.reminder_count || 0} reminder${Number(inv.reminder_count || 0) === 1 ? "" : "s"} sent${inv.last_reminded_at ? ` · Last: ${fmtDateTime(inv.last_reminded_at)}` : ""}`}
                    >
                      <Bell size={12}/> Remind {inv.reminder_count ? `(${inv.reminder_count})` : ""}
                    </button>
                    {inv.status !== "paid" && inv.status !== "cancelled" && (
                      <button className="att-btn active P flex items-center gap-1"
                        onClick={()=>{ setPayOpen(inv); setPay({ amount: inv.balance, mode:"cash", transaction_ref:"" }); }}
                        data-testid={`inv-pay-${inv.id}`}>
                        <IndianRupee size={12}/> Pay
                      </button>
                    )}
                    <button className="att-btn flex items-center gap-1" onClick={()=>del(inv.id)}><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
            {!sorted.length && (<tr><td colSpan="9" className="text-center text-[var(--ck-muted)] py-8">No invoices match the current filters.</td></tr>)}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems}
                  pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testId="invoices-pagination" />

      <Dialog open={!!payOpen} onOpenChange={(o)=> !o && setPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          {payOpen && (
            <form onSubmit={recordPayment} className="space-y-4" data-testid="payment-form">
              <div className="text-sm">
                <div><b>{payOpen.student_name}</b> · {payOpen.invoice_no}</div>
                <div className="text-[var(--ck-muted)]">Balance: {fmt(payOpen.balance)}</div>
              </div>
              <Field label="Amount">
                <Input type="number" data-testid="pf-amount" value={pay.amount} onChange={(e)=>setPay({...pay, amount:e.target.value})} required />
              </Field>
              <Field label="Mode">
                <Select value={pay.mode} onValueChange={(v)=>setPay({...pay, mode:v})}>
                  <SelectTrigger data-testid="pf-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Transaction Reference (optional)">
                <Input value={pay.transaction_ref} onChange={(e)=>setPay({...pay, transaction_ref:e.target.value})} />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" className="ck-btn-ghost" onClick={()=>setPayOpen(null)}>Cancel</button>
                <button type="submit" className="ck-btn-primary" data-testid="pf-submit">Record & Generate Receipt</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={runOpen} onOpenChange={(o)=> { setRunOpen(o); if (!o) setRunResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Monthly billing run</DialogTitle></DialogHeader>
          <form onSubmit={runMonthly} className="space-y-4" data-testid="monthly-run-form">
            <p className="text-sm text-[var(--ck-muted)]">
              Generates prepaid invoices from the student's payment plan and postpaid invoices from billable attendance in the selected month. Students who already have an invoice for this period are skipped.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Period (YYYY-MM)">
                <Input data-testid="run-period" value={runForm.period} onChange={(e)=>setRunForm({...runForm, period:e.target.value})} placeholder="2026-03" />
              </Field>
              <Field label="Due date">
                <Input type="date" data-testid="run-due" value={runForm.due_date} onChange={(e)=>setRunForm({...runForm, due_date:e.target.value})} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={runForm.include_pending}
                onChange={(e)=>setRunForm({...runForm, include_pending:e.target.checked})}
                data-testid="run-carry" />
              <span>Carry over outstanding balance from earlier invoices as additional line items</span>
            </label>
            {runResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs space-y-1">
                <div className="font-semibold text-green-800">
                  Created {runResult.total_created} invoice{runResult.total_created === 1 ? "" : "s"}
                  {runResult.skipped?.length ? ` · ${runResult.skipped.length} skipped` : ""}
                </div>
                {runResult.skipped?.length > 0 && (
                  <div className="text-[11px] text-[var(--ck-muted)]">
                    Skipped reasons: {[...new Set(runResult.skipped.map((s)=>s.reason))].join(", ")}
                  </div>
                )}
                {runResult.created?.some((item)=>item.billing_type === "postpaid") && (
                  <div className="text-[11px] text-green-800">
                    Postpaid invoices: {runResult.created.filter((item)=>item.billing_type === "postpaid").length}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="ck-btn-ghost" onClick={()=>setRunOpen(false)}>Close</button>
              <button type="submit" className="ck-btn-primary" data-testid="run-submit">Run for {runForm.period}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">
        {label}{required && <span className="text-[var(--ck-orange)]"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
