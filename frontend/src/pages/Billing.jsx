import { useEffect, useState } from "react";
import { api, formatApiError, BACKEND_URL, pdfUrl } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Bell, IndianRupee, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0,10);
const monthStr = () => new Date().toISOString().slice(0,7);

export default function Billing() {
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [levels, setLevels] = useState([]);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null); // invoice
  const [form, setForm] = useState({
    student_id: "", period: monthStr(), due_date: today(),
    items: [{ description: "Monthly Tuition Fee", amount: 0 }], notes: ""
  });
  const [pay, setPay] = useState({ amount: 0, mode: "cash", transaction_ref: "" });

  const load = () => api.get("/invoices").then((r)=>setItems(r.data));
  useEffect(() => {
    load();
    api.get("/students").then((r)=>setStudents(r.data));
    api.get("/levels").then((r)=>setLevels(r.data));
  }, []);

  const onSelectStudent = (sid) => {
    setForm((f)=>({ ...f, student_id: sid }));
    const s = students.find((x)=>x.id===sid);
    if (s && s.level_id) {
      const lv = levels.find((l)=>l.id===s.level_id);
      if (lv) {
        const amt = s.payment_plan === "quarterly" ? lv.quarterly_fee
                  : s.payment_plan === "annual"    ? lv.annual_fee
                  : lv.monthly_fee;
        const desc = `${lv.name} - ${s.payment_plan} fee`;
        setForm((f)=>({ ...f, items: [{ description: desc, amount: Number(amt || 0) }] }));
      }
    }
  };

  const addItem = () => setForm((f)=>({ ...f, items: [...f.items, { description:"", amount:0 }] }));
  const updItem = (idx, key, val) =>
    setForm((f)=>({ ...f, items: f.items.map((it,i)=> i===idx ? { ...it, [key]: key==="amount"?Number(val||0):val } : it) }));
  const rmItem = (idx) => setForm((f)=>({ ...f, items: f.items.filter((_,i)=>i!==idx) }));

  const total = form.items.reduce((a,b)=>a + Number(b.amount||0), 0);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/invoices", form);
      toast.success("Invoice created");
      setOpen(false); load();
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
      toast.success(`Reminder fired · ${wa} · ${em}`);
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete invoice?")) return;
    await api.delete(`/invoices/${id}`); load();
  };

  return (
    <>
      <PageHeader
        eyebrow="Cashbook"
        title="Billing"
        subtitle="Generate invoices, send reminders and record payments. PDFs are auto-generated."
        actions={
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
                  <div className="text-right text-sm mt-2">Total: <span className="ck-display text-xl font-semibold ml-2">{fmt(total)}</span></div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                  <button type="submit" className="ck-btn-primary" data-testid="if-submit">Create invoice</button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="invoices-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Invoice</th>
              <th>Student</th>
              <th>Period</th>
              <th>Due</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Balance</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv)=>(
              <tr key={inv.id}>
                <td className="px-4 py-3 font-mono text-xs">{inv.invoice_no}</td>
                <td>{inv.student_name}</td>
                <td className="text-[var(--ck-muted)]">{inv.period}</td>
                <td className="text-[var(--ck-muted)]">{inv.due_date}</td>
                <td className="text-right">{fmt(inv.amount)}</td>
                <td className="text-right font-medium">{fmt(inv.balance)}</td>
                <td className="pr-4">
                  <div className="flex justify-end gap-1">
                    <a className="att-btn flex items-center gap-1" target="_blank" rel="noreferrer"
                       href={`${BACKEND_URL}/api/invoices/${inv.id}/pdf`} data-testid={`inv-pdf-${inv.id}`}>
                      <FileText size={12}/> PDF
                    </a>
                    <button className="att-btn flex items-center gap-1" onClick={()=>remind(inv.id)} data-testid={`inv-remind-${inv.id}`}>
                      <Bell size={12}/> Remind
                    </button>
                    {inv.status !== "paid" && (
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
            {!items.length && (<tr><td colSpan="7" className="text-center text-[var(--ck-muted)] py-8">No invoices yet.</td></tr>)}
          </tbody>
        </table>
      </div>

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
