import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = {
  full_name: "", dob: "", gender: "male", parent_name: "", parent_whatsapp: "",
  parent_email: "", address: "", level_id: "", batch_id: "", payment_plan: "monthly",
  concession_pct: 0, referred_by: "", status: "active",
};

const pickForm = (s) => ({
  full_name: s.full_name || "", dob: s.dob || "", gender: s.gender || "male",
  parent_name: s.parent_name || "", parent_whatsapp: s.parent_whatsapp || "",
  parent_email: s.parent_email || "", address: s.address || "",
  level_id: s.level_id || "", batch_id: s.batch_id || "",
  payment_plan: s.payment_plan || "monthly", concession_pct: s.concession_pct ?? 0,
  referred_by: s.referred_by || "", status: s.status || "active",
});

export default function Students() {
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  const load = () => api.get("/students", { params: q ? { q } : {} }).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [q]);
  useEffect(() => {
    api.get("/batches").then((r) => setBatches(r.data));
    api.get("/levels").then((r) => setLevels(r.data));
  }, []);

  const startCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const startEdit = (s) => { setEditingId(s.id); setForm(pickForm(s)); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, concession_pct: Number(form.concession_pct || 0) };
      if (!payload.parent_email) payload.parent_email = null;
      if (editingId) {
        await api.put(`/students/${editingId}`, payload);
        toast.success("Student updated");
      } else {
        await api.post("/students", payload);
        toast.success("Student enrolled");
      }
      setOpen(false); setForm(empty); setEditingId(null); load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setSubmitting(false); }
  };

  const del = async (s) => {
    if (!window.confirm(`Delete student "${s.full_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/students/${s.id}`);
      toast.success("Student deleted");
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Students"
        subtitle="Every player on the board. Add new enrollments and manage active learners."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <button className="ck-btn-primary flex items-center gap-2" data-testid="add-student-btn" onClick={startCreate}>
                <Plus size={14} /> New Student
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingId ? "Edit student" : "Enroll a new student"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="grid grid-cols-2 gap-4" data-testid="student-form">
                <Field label="Full Name" required>
                  <Input data-testid="sf-name" value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} required />
                </Field>
                <Field label="Date of Birth">
                  <Input type="date" data-testid="sf-dob" value={form.dob || ""} onChange={(e)=>setForm({...form, dob:e.target.value})} />
                </Field>
                <Field label="Gender">
                  <Select value={form.gender} onValueChange={(v)=>setForm({...form, gender:v})}>
                    <SelectTrigger data-testid="sf-gender"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Parent Name" required>
                  <Input data-testid="sf-parent" value={form.parent_name} onChange={(e)=>setForm({...form, parent_name:e.target.value})} required />
                </Field>
                <Field label="Parent WhatsApp" required>
                  <Input data-testid="sf-wa" placeholder="+91..." value={form.parent_whatsapp} onChange={(e)=>setForm({...form, parent_whatsapp:e.target.value})} required />
                </Field>
                <Field label="Parent Email">
                  <Input type="email" data-testid="sf-email" value={form.parent_email} onChange={(e)=>setForm({...form, parent_email:e.target.value || ""})} />
                </Field>
                <Field label="Level">
                  <Select value={form.level_id || "_none"} onValueChange={(v)=>setForm({...form, level_id: v === "_none" ? "" : v})}>
                    <SelectTrigger data-testid="sf-level"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {levels.map((l)=>(<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Batch">
                  <Select value={form.batch_id || "_none"} onValueChange={(v)=>setForm({...form, batch_id: v === "_none" ? "" : v})}>
                    <SelectTrigger data-testid="sf-batch"><SelectValue placeholder="Select batch" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {batches.map((b)=>(<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Payment Plan">
                  <Select value={form.payment_plan} onValueChange={(v)=>setForm({...form, payment_plan:v})}>
                    <SelectTrigger data-testid="sf-plan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Concession %">
                  <Input type="number" min="0" max="100" data-testid="sf-concession" value={form.concession_pct} onChange={(e)=>setForm({...form, concession_pct:e.target.value})} />
                </Field>
                <Field label="Address" full>
                  <Input data-testid="sf-address" value={form.address} onChange={(e)=>setForm({...form, address:e.target.value})} />
                </Field>
                <div className="col-span-2 flex justify-end gap-2 mt-2">
                  <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                  <button type="submit" disabled={submitting} className="ck-btn-primary" data-testid="sf-submit">
                    {submitting ? "Saving…" : editingId ? "Save changes" : "Enroll"}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="ck-card-elevated p-4 mb-4 flex items-center gap-3">
        <Search size={16} className="text-[var(--ck-muted)]" />
        <input
          data-testid="student-search"
          placeholder="Search by name…"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          className="flex-1 outline-none bg-transparent text-sm"
        />
        <span className="text-xs text-[var(--ck-muted)]">{items.length} students</span>
      </div>

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="students-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Code</th>
              <th>Name</th>
              <th>Parent</th>
              <th>WhatsApp</th>
              <th>Plan</th>
              <th>Status</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono text-xs">{s.student_code}</td>
                <td>
                  <Link to={`/students/${s.id}`} className="font-medium hover:text-[var(--ck-orange)]" data-testid={`student-link-${s.id}`}>
                    {s.full_name}
                  </Link>
                </td>
                <td className="text-[var(--ck-muted)]">{s.parent_name}</td>
                <td className="text-[var(--ck-muted)]">{s.parent_whatsapp}</td>
                <td className="capitalize">{s.payment_plan}</td>
                <td>
                  <span className={`ck-pill ${s.status === "active" ? "ck-pill-green" : "ck-pill-black"}`}>{s.status}</span>
                </td>
                <td className="text-right pr-4">
                  <div className="flex justify-end gap-1">
                    <button className="att-btn flex items-center gap-1" onClick={() => startEdit(s)} data-testid={`student-edit-${s.id}`}>
                      <Pencil size={12}/> Edit
                    </button>
                    <button className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600" onClick={() => del(s)} data-testid={`student-delete-${s.id}`}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr><td colSpan="7" className="text-center text-[var(--ck-muted)] py-10">No students yet. Enroll your first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
