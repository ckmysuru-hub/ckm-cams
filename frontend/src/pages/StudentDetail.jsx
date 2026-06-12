import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmtINR = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;

const pickForm = (s) => ({
  full_name: s.full_name || "", dob: s.dob || "", gender: s.gender || "male",
  parent_name: s.parent_name || "", parent_whatsapp: s.parent_whatsapp || "",
  parent_email: s.parent_email || "", address: s.address || "",
  level_id: s.level_id || "", batch_id: s.batch_id || "",
  payment_plan: s.payment_plan || "monthly", concession_pct: s.concession_pct ?? 0,
  referred_by: s.referred_by || "", status: s.status || "active",
});

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [att, setAtt] = useState(null);
  const [inv, setInv] = useState([]);
  const [rec, setRec] = useState([]);
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);

  const reload = () => {
    api.get(`/students/${id}`).then((r) => setS(r.data));
    api.get(`/attendance/student/${id}`).then((r) => setAtt(r.data));
    api.get("/invoices", { params: { student_id: id } }).then((r) => setInv(r.data));
    api.get("/receipts", { params: { student_id: id } }).then((r) => setRec(r.data));
  };

  useEffect(() => {
    reload();
    api.get("/batches").then((r) => setBatches(r.data));
    api.get("/levels").then((r) => setLevels(r.data));
    // eslint-disable-next-line
  }, [id]);

  const startEdit = () => { setForm(pickForm(s)); setEditOpen(true); };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, concession_pct: Number(form.concession_pct || 0) };
      if (!payload.parent_email) payload.parent_email = null;
      await api.put(`/students/${id}`, payload);
      toast.success("Student updated");
      setEditOpen(false); reload();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async () => {
    if (!window.confirm(`Delete student "${s.full_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/students/${id}`);
      toast.success("Student deleted");
      nav("/students");
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  if (!s) return <div className="text-sm text-[var(--ck-muted)]">Loading…</div>;

  return (
    <>
      <Link to="/students" className="text-xs text-[var(--ck-muted)] flex items-center gap-1 mb-4 hover:text-[var(--ck-orange)]">
        <ChevronLeft size={14} /> Back to students
      </Link>
      <PageHeader
        eyebrow={s.student_code}
        title={s.full_name}
        subtitle={`Parent: ${s.parent_name} · ${s.parent_whatsapp}`}
        actions={
          <>
            <button className="ck-btn-ghost flex items-center gap-2" onClick={startEdit} data-testid="student-edit-btn">
              <Pencil size={14}/> Edit
            </button>
            <button className="ck-btn-ghost flex items-center gap-2 hover:!border-red-500 hover:!text-red-600" onClick={del} data-testid="student-delete-btn">
              <Trash2 size={14}/> Delete
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Attendance" value={att ? `${att.percentage}%` : "—"} hint={`P ${att?.counts.P||0} · A ${att?.counts.A||0} · LT ${att?.counts.LT||0}`} />
        <Stat label="Total Billed" value={fmtINR(inv.reduce((a,b)=>a+b.amount,0))} hint={`${inv.length} invoices`} />
        <Stat label="Pending" value={fmtINR(inv.reduce((a,b)=>a+b.balance,0))} hint="balance outstanding" accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ck-card-elevated p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-3">Invoices</div>
          {inv.length ? inv.map((i)=>(
            <div key={i.id} className="flex items-center justify-between py-2 border-t border-[var(--ck-line)] first:border-0">
              <div>
                <div className="font-mono text-xs">{i.invoice_no}</div>
                <div className="text-xs text-[var(--ck-muted)]">{i.period} · due {i.due_date}</div>
              </div>
              <div className="text-right">
                <div className="font-medium">{fmtINR(i.balance)}</div>
                <span className={`ck-pill ${i.status==='paid'?'ck-pill-green':i.status==='partial'?'ck-pill-orange':'ck-pill-black'}`}>{i.status}</span>
              </div>
            </div>
          )) : <div className="text-sm text-[var(--ck-muted)]">No invoices yet.</div>}
        </div>
        <div className="ck-card-elevated p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-3">Receipts</div>
          {rec.length ? rec.map((r)=>(
            <div key={r.id} className="flex items-center justify-between py-2 border-t border-[var(--ck-line)] first:border-0">
              <div>
                <div className="font-mono text-xs">{r.receipt_no}</div>
                <div className="text-xs text-[var(--ck-muted)]">{r.created_at?.slice(0,10)} · {r.mode}</div>
              </div>
              <div className="text-right">
                <div className="font-medium">{fmtINR(r.amount)}</div>
                <a className="text-xs text-[var(--ck-orange)] hover:underline" href={`${process.env.REACT_APP_BACKEND_URL}/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              </div>
            </div>
          )) : <div className="text-sm text-[var(--ck-muted)]">No receipts yet.</div>}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit student</DialogTitle></DialogHeader>
          {form && (
            <form onSubmit={saveEdit} className="grid grid-cols-2 gap-4" data-testid="student-edit-form">
              <DField label="Full Name" required>
                <Input value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} required data-testid="sd-name" />
              </DField>
              <DField label="Date of Birth">
                <Input type="date" value={form.dob || ""} onChange={(e)=>setForm({...form, dob:e.target.value})} />
              </DField>
              <DField label="Gender">
                <Select value={form.gender} onValueChange={(v)=>setForm({...form, gender:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Status">
                <Select value={form.status} onValueChange={(v)=>setForm({...form, status:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="dropped">Dropped</SelectItem>
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Parent Name" required>
                <Input value={form.parent_name} onChange={(e)=>setForm({...form, parent_name:e.target.value})} required />
              </DField>
              <DField label="Parent WhatsApp" required>
                <Input value={form.parent_whatsapp} onChange={(e)=>setForm({...form, parent_whatsapp:e.target.value})} required />
              </DField>
              <DField label="Parent Email">
                <Input type="email" value={form.parent_email} onChange={(e)=>setForm({...form, parent_email:e.target.value})} />
              </DField>
              <DField label="Payment Plan">
                <Select value={form.payment_plan} onValueChange={(v)=>setForm({...form, payment_plan:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Level">
                <Select value={form.level_id || "_none"} onValueChange={(v)=>setForm({...form, level_id: v === "_none" ? "" : v})}>
                  <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {levels.map((l)=>(<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Batch">
                <Select value={form.batch_id || "_none"} onValueChange={(v)=>setForm({...form, batch_id: v === "_none" ? "" : v})}>
                  <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {batches.map((b)=>(<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Address" full>
                <Input value={form.address} onChange={(e)=>setForm({...form, address:e.target.value})} />
              </DField>
              <div className="col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" className="ck-btn-ghost" onClick={()=>setEditOpen(false)}>Cancel</button>
                <button type="submit" className="ck-btn-primary" data-testid="sd-submit">Save changes</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DField({ label, required, full, children }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">
        {label}{required && <span className="text-[var(--ck-orange)]"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Stat({ label, value, hint, accent }) {
  return (
    <div className="ck-card-elevated p-5">
      <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">{label}</div>
      <div className={`ck-display text-3xl font-semibold mt-1 ${accent ? "text-[var(--ck-orange)]" : ""}`}>{value}</div>
      <div className="text-xs text-[var(--ck-muted)] mt-1">{hint}</div>
    </div>
  );
}
