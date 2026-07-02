import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError, pdfUrl } from "@/lib/api";
import { renderWhatsAppTemplate } from "@/lib/whatsappTemplates";
import PageHeader from "@/components/PageHeader";
import PhoneNumberInput from "@/components/PhoneNumberInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Pencil, Trash2, Link2, Share2, Copy, CalendarCheck, RefreshCw, Award, Upload, IdCard } from "lucide-react";
import { toast } from "sonner";

const fmtINR = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;

const pickForm = (s) => ({
  full_name: s.full_name || "", dob: s.dob || "", gender: s.gender || "male",
  parent_name: s.parent_name || "", parent_whatsapp: s.parent_whatsapp || "",
  parent_email: s.parent_email || "", address: s.address || "",
  level_id: s.level_id || "", batch_id: s.batch_id || "",
  payment_plan: s.payment_plan || "monthly", concession_pct: s.concession_pct ?? 0,
  subscription_start: s.subscription_start || "", subscription_end: s.subscription_end || "",
  referred_by: s.referred_by || "", status: s.status || "active", photo_url: s.photo_url || "",
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
  const [subscription, setSubscription] = useState(null);
  const [portalUrl, setPortalUrl] = useState("");
  const [linking, setLinking] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteForm, setPromoteForm] = useState({ level_id: "", batch_id: "", scoresheet: null });
  const [promoting, setPromoting] = useState(false);

  const reload = () => {
    api.get(`/students/${id}`).then((r) => setS(r.data));
    api.get(`/attendance/student/${id}`).then((r) => setAtt(r.data));
    api.get("/invoices", { params: { student_id: id } }).then((r) => setInv(r.data));
    api.get("/receipts", { params: { student_id: id } }).then((r) => setRec(r.data));
    api.get(`/students/${id}/subscription`).then((r) => setSubscription(r.data));
  };

  useEffect(() => {
    reload();
    api.get("/batches").then((r) => setBatches(r.data));
    api.get("/levels").then((r) => setLevels(r.data));
    // eslint-disable-next-line
  }, [id]);

  const startEdit = () => { setForm(pickForm(s)); setEditOpen(true); };
  const startPromote = () => {
    setPromoteForm({ level_id: s.level_id || "", batch_id: s.batch_id || "", scoresheet: null });
    setPromoteOpen(true);
  };

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

  const submitPromotion = async (e) => {
    e.preventDefault();
    if (!promoteForm.level_id) {
      toast.error("Select the new level");
      return;
    }
    if (!promoteForm.scoresheet) {
      toast.error("Attach the scoresheet");
      return;
    }
    setPromoting(true);
    try {
      const data = new FormData();
      data.append("level_id", promoteForm.level_id);
      if (promoteForm.batch_id) data.append("batch_id", promoteForm.batch_id);
      data.append("scoresheet", promoteForm.scoresheet);
      await api.post(`/students/${id}/promote`, data);
      toast.success("Student promoted and parent email sent");
      setPromoteOpen(false);
      reload();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setPromoting(false); }
  };

  const del = async () => {
    if (!window.confirm(`Delete student "${s.full_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/students/${id}`);
      toast.success("Student deleted");
      nav("/students");
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const generateMagicLink = async () => {
    setLinking(true);
    try {
      const { data } = await api.post(`/students/${id}/magic-link`);
      const url = `${window.location.origin}/portal/${data.token}`;
      setPortalUrl(url);
      toast.success("Magic link generated");
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setLinking(false); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success("Link copied");
    } catch { toast.error("Copy failed — select & copy manually"); }
  };

  const shareWhatsApp = () => {
    if (!portalUrl || !s) return;
    const num = (s.parent_whatsapp || "").replace(/[^\d]/g, "");
    const msg = encodeURIComponent(renderWhatsAppTemplate("parent_portal_link", {
      parentName: s.parent_name,
      studentName: s.full_name,
      portalUrl,
    }));
    const url = num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
  };

  const extendSubscription = async () => {
    try {
      const { data } = await api.post(`/students/${id}/subscription/extend`, {});
      setSubscription(data);
      toast.success(`Subscription extended to ${data.end}`);
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
            <button className="ck-btn-primary flex items-center gap-2" onClick={startPromote} data-testid="student-promote-btn">
              <Award size={14}/> Promote
            </button>
            <button className="ck-btn-ghost flex items-center gap-2" onClick={startEdit} data-testid="student-edit-btn">
              <Pencil size={14}/> Edit
            </button>
            <a className="ck-btn-ghost flex items-center gap-2" href={pdfUrl(`/api/students/${id}/id-card.pdf`)} target="_blank" rel="noreferrer" data-testid="student-id-card-btn">
              <IdCard size={14}/> ID Card
            </a>
            <button className="ck-btn-ghost flex items-center gap-2 hover:!border-red-500 hover:!text-red-600" onClick={del} data-testid="student-delete-btn">
              <Trash2 size={14}/> Delete
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Attendance" value={att ? `${att.percentage}%` : "—"} hint={`P ${att?.counts.P||0} · A ${att?.counts.A||0} `} />
        <Stat label="Total Billed" value={fmtINR(inv.reduce((a,b)=>a+b.amount,0))} hint={`${inv.length} invoices`} />
        <Stat label="Pending" value={fmtINR(inv.reduce((a,b)=>a+b.balance,0))} hint="balance outstanding" accent />
      </div>

      <div className="ck-card-elevated p-5 mb-6" data-testid="attendance-history-card">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-3">Attendance details</div>
        {att?.history?.length ? (
          <div className="divide-y divide-[var(--ck-line)]">
            {att.history.slice(0, 12).map((row)=>(
              <div key={`${row.date}-${row.status}`} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{row.date}</div>
                  <div className="text-xs text-[var(--ck-muted)]">
                    {row.topic || "Topic not recorded"}{row.coach_name ? ` · ${row.coach_name}` : ""}
                  </div>
                </div>
                <span className={`ck-pill ${
                  row.status === "P" ? "ck-pill-green" :
                  row.status === "A" ? "ck-pill-red" :
                  row.status === "LT" ? "ck-pill-orange" : "ck-pill-black"
                }`}>{row.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--ck-muted)]">No attendance history yet.</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="ck-card-elevated p-5" data-testid="subscription-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Subscription</div>
              <div className="ck-display text-xl font-semibold capitalize">{subscription?.plan_label || subscription?.plan || s.payment_plan || "monthly"} plan</div>
            </div>
            <span className={`ck-pill ${
              subscription?.status === "active" ? "ck-pill-green" :
              subscription?.status === "expiring_soon" ? "ck-pill-orange" :
              subscription?.status === "expired" ? "ck-pill-red" : "ck-pill-black"
            }`}>{subscription?.status || "none"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[var(--ck-muted)] text-xs">Start</div>
              <div className="font-medium">{subscription?.start || "—"}</div>
            </div>
            <div>
              <div className="text-[var(--ck-muted)] text-xs">Renew by</div>
              <div className="font-medium">{subscription?.end || "—"}</div>
            </div>
          </div>
          {subscription?.days_remaining != null && (
            <div className={`mt-3 text-sm flex items-center gap-2 ${
              subscription.days_remaining < 0 ? "text-red-600" :
              subscription.days_remaining <= 7 ? "text-[var(--ck-orange)]" : "text-[var(--ck-muted)]"
            }`}>
              <CalendarCheck size={14} />
              {subscription.days_remaining < 0
                ? `Expired ${-subscription.days_remaining} day${subscription.days_remaining === -1 ? "" : "s"} ago`
                : `${subscription.days_remaining} day${subscription.days_remaining === 1 ? "" : "s"} remaining`}
            </div>
          )}
          <button onClick={extendSubscription} data-testid="sub-extend-btn"
            className="ck-btn-ghost mt-4 w-full flex items-center justify-center gap-2 text-sm">
            <RefreshCw size={14}/> Extend by {subscription?.plan_duration_days || {"monthly":30,"quarterly":90,"annual":365}[(subscription?.plan || s.payment_plan || "monthly")] || 30} days
          </button>
          <p className="text-[11px] text-[var(--ck-muted)] mt-2 leading-relaxed">
            Subscriptions auto-extend when a payment is recorded against an invoice. Use this only for manual adjustments.
          </p>
        </div>

        <div className="ck-card-elevated p-5" data-testid="magiclink-card">
          <div className="flex items-center gap-2 mb-1">
            <Link2 size={14} className="text-[var(--ck-orange)]" />
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Parent portal</div>
          </div>
          <div className="ck-display text-xl font-semibold mb-2">Magic link</div>
          <p className="text-sm text-[var(--ck-muted)] mb-3 leading-relaxed">
            Generate a private link the parent can open from WhatsApp to view {s.full_name?.split(" ")[0]}'s attendance, invoices and receipts. No login required, valid 180 days.
          </p>
          {!portalUrl ? (
            <button onClick={generateMagicLink} disabled={linking} data-testid="magiclink-generate-btn"
              className="ck-btn-primary w-full flex items-center justify-center gap-2 text-sm">
              <Link2 size={14}/> {linking ? "Generating…" : "Generate magic link"}
            </button>
          ) : (
            <>
              <div className="ck-input rounded-lg px-3 py-2 text-xs font-mono break-all" data-testid="magiclink-url">
                {portalUrl}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <button onClick={copyLink} data-testid="magiclink-copy" className="ck-btn-ghost flex-1 flex items-center justify-center gap-2 text-sm">
                  <Copy size={14}/> Copy
                </button>
                <button onClick={shareWhatsApp} data-testid="magiclink-whatsapp" className="ck-btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                  <Share2 size={14}/> WhatsApp
                </button>
                <button onClick={generateMagicLink} title="Regenerate" className="ck-btn-ghost px-3">
                  <RefreshCw size={14}/>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ck-card-elevated p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-3">Invoices</div>
          {inv.length ? inv.map((i)=>(
            <div key={i.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-t border-[var(--ck-line)] first:border-0">
              <div className="min-w-0">
                <div className="font-mono text-xs">{i.invoice_no}</div>
                <div className="text-xs text-[var(--ck-muted)]">{i.period} · due {i.due_date}</div>
              </div>
              <div className="text-left sm:text-right">
                <div className="font-medium">{fmtINR(i.balance)}</div>
                <span className={`ck-pill ${i.status==='paid'?'ck-pill-green':i.status==='partial'?'ck-pill-orange':'ck-pill-black'}`}>{i.status}</span>
              </div>
            </div>
          )) : <div className="text-sm text-[var(--ck-muted)]">No invoices yet.</div>}
        </div>
        <div className="ck-card-elevated p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-3">Receipts</div>
          {rec.length ? rec.map((r)=>(
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-t border-[var(--ck-line)] first:border-0">
              <div className="min-w-0">
                <div className="font-mono text-xs">{r.receipt_no}</div>
                <div className="text-xs text-[var(--ck-muted)]">{r.created_at?.slice(0,10)} · {r.mode}</div>
              </div>
              <div className="text-left sm:text-right">
                <div className="font-medium">{fmtINR(r.amount)}</div>
                <a className="text-xs text-[var(--ck-orange)] hover:underline" href={pdfUrl(`/api/receipts/${r.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
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
                <PhoneNumberInput
                  value={form.parent_whatsapp}
                  onChange={(parent_whatsapp)=>setForm({...form, parent_whatsapp})}
                  inputTestId="sd-wa"
                  selectTestId="sd-wa-country"
                  required
                />
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
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </DField>
              <DField label="Validity Start">
                <Input type="date" value={form.subscription_start || ""} onChange={(e)=>setForm({...form, subscription_start:e.target.value})} data-testid="sd-validity-start" />
              </DField>
              <DField label="Validity End">
                <Input type="date" value={form.subscription_end || ""} onChange={(e)=>setForm({...form, subscription_end:e.target.value})} data-testid="sd-validity-end" />
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

      <Dialog open={promoteOpen} onOpenChange={(o)=>{ setPromoteOpen(o); if (!o) setPromoteForm({ level_id: "", batch_id: "", scoresheet: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Promote student</DialogTitle></DialogHeader>
          <form onSubmit={submitPromotion} className="space-y-4" data-testid="student-promote-form">
            <DField label="New Level" required>
              <Select value={promoteForm.level_id || ""} onValueChange={(v)=>setPromoteForm({...promoteForm, level_id: v})}>
                <SelectTrigger data-testid="promote-level"><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {levels.map((l)=>(<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </DField>
            <DField label="New Batch">
              <Select value={promoteForm.batch_id || "_none"} onValueChange={(v)=>setPromoteForm({...promoteForm, batch_id: v === "_none" ? "" : v})}>
                <SelectTrigger data-testid="promote-batch"><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {batches.map((b)=>(<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </DField>
            <DField label="Scoresheet" required>
              <label className="ck-input rounded-lg px-3 py-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm truncate text-[var(--ck-muted)]">
                  {promoteForm.scoresheet?.name || "Attach PDF, image, or document"}
                </span>
                <span className="ck-btn-ghost text-xs inline-flex items-center gap-1 pointer-events-none">
                  <Upload size={12}/> Choose
                </span>
                <input
                  type="file"
                  className="hidden"
                  data-testid="promote-scoresheet"
                  onChange={(e)=>setPromoteForm({...promoteForm, scoresheet: e.target.files?.[0] || null})}
                  required
                />
              </label>
            </DField>
            <div className="text-xs text-[var(--ck-muted)] leading-relaxed">
              The parent will receive a promotion email with this scoresheet and a branded promotion certificate.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="ck-btn-ghost" onClick={()=>setPromoteOpen(false)}>Cancel</button>
              <button type="submit" className="ck-btn-primary flex items-center gap-2" disabled={promoting} data-testid="promote-submit">
                <Award size={14}/> {promoting ? "Promoting…" : "Promote & email"}
              </button>
            </div>
          </form>
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
