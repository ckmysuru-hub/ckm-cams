import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Inbox, Link2 } from "lucide-react";
import { toast } from "sonner";

export default function Registrations() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [confirming, setConfirming] = useState(null); // registration object
  const [form, setForm] = useState({ level_id: "", batch_id: "", payment_plan: "monthly", concession_pct: 0 });

  const load = () => api.get("/registrations", { params: { status } }).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [status]);
  useEffect(() => {
    api.get("/levels").then((r) => setLevels(r.data));
    api.get("/batches").then((r) => setBatches(r.data));
  }, []);

  const startConfirm = (reg) => {
    const guessLevel = levels.find((l) => (l.code || "").toUpperCase() === (reg.level_preference || "").toUpperCase());
    setForm({
      level_id: guessLevel?.id || "",
      batch_id: "",
      payment_plan: "monthly",
      concession_pct: 0,
    });
    setConfirming(reg);
  };

  const submitConfirm = async (e) => {
    e.preventDefault();
    if (!form.level_id) { toast.error("Please assign a level"); return; }
    try {
      const payload = { ...form, concession_pct: Number(form.concession_pct || 0) };
      if (!payload.batch_id) delete payload.batch_id;
      const { data } = await api.post(`/registrations/${confirming.id}/confirm`, payload);
      toast.success(`Enrolled as ${data.student_code}`);
      setConfirming(null);
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const reject = async (reg) => {
    if (!window.confirm(`Reject registration from ${reg.parent_name}?`)) return;
    await api.delete(`/registrations/${reg.id}`);
    toast.success("Registration rejected");
    load();
  };

  return (
    <>
      <PageHeader
        eyebrow="Open registrations"
        title="Pending applications"
        subtitle="Confirm new student enquiries received via the public registration page."
        actions={
          <>
            <button
              onClick={async () => {
                const url = `${window.location.origin}/register`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success(`Public registration link copied: ${url}`);
                } catch { toast.error("Could not copy — please copy manually."); }
              }}
              className="ck-btn-ghost flex items-center gap-2"
              data-testid="copy-register-link"
            >
              <Link2 size={14}/> Copy public link
            </button>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]" data-testid="reg-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="registrations-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Student</th>
              <th>Parent</th>
              <th>WhatsApp</th>
              <th>Pref. level</th>
              <th>Received</th>
              <th>Status</th>
              <th className="text-right pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.full_name}</td>
                <td>{r.parent_name}</td>
                <td className="text-[var(--ck-muted)]">{r.parent_whatsapp}</td>
                <td className="text-[var(--ck-muted)]">{r.level_preference || "—"}</td>
                <td className="text-[var(--ck-muted)] text-xs">{r.created_at?.slice(0, 10)}</td>
                <td>
                  <span className={`ck-pill ${
                    r.status === "confirmed" ? "ck-pill-green" :
                    r.status === "rejected" ? "ck-pill-red" : "ck-pill-orange"
                  }`}>{r.status}</span>
                </td>
                <td className="text-right pr-4">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => startConfirm(r)} data-testid={`reg-confirm-${r.id}`}
                        className="att-btn active P flex items-center gap-1">
                        <CheckCircle2 size={12} /> Confirm
                      </button>
                      <button onClick={() => reject(r)} data-testid={`reg-reject-${r.id}`}
                        className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600">
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr><td colSpan="7" className="text-center text-[var(--ck-muted)] py-10">
                <Inbox size={20} className="inline mr-2 opacity-50" /> No {status === "all" ? "" : status} registrations.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Confirm enrolment</DialogTitle></DialogHeader>
          {confirming && (
            <form onSubmit={submitConfirm} className="space-y-4" data-testid="confirm-form">
              <div className="ck-card p-4">
                <div className="text-xs text-[var(--ck-muted)] uppercase tracking-wider">Applicant</div>
                <div className="ck-display text-lg font-semibold mt-1">{confirming.full_name}</div>
                <div className="text-sm text-[var(--ck-muted)]">{confirming.parent_name} · {confirming.parent_whatsapp}</div>
                {confirming.notes && <div className="text-xs text-[var(--ck-muted)] mt-2 italic">"{confirming.notes}"</div>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Level *</Label>
                  <Select value={form.level_id || ""} onValueChange={(v) => setForm({ ...form, level_id: v })}>
                    <SelectTrigger data-testid="cf-level"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Batch</Label>
                  <Select value={form.batch_id || "_none"} onValueChange={(v) => setForm({ ...form, batch_id: v === "_none" ? "" : v })}>
                    <SelectTrigger data-testid="cf-batch"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None yet —</SelectItem>
                      {batches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Payment plan</Label>
                  <Select value={form.payment_plan} onValueChange={(v) => setForm({ ...form, payment_plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Concession %</Label>
                  <Input type="number" value={form.concession_pct} onChange={(e) => setForm({ ...form, concession_pct: e.target.value })} />
                </div>
              </div>

              <p className="text-xs text-[var(--ck-muted)] leading-relaxed">
                On confirm: a new student record will be created with auto-assigned ID (CKM-NNNNN), and a welcome WhatsApp + email will be sent to the parent.
              </p>

              <div className="flex justify-end gap-2">
                <button type="button" className="ck-btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                <button type="submit" className="ck-btn-primary" data-testid="cf-submit">Create student</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
