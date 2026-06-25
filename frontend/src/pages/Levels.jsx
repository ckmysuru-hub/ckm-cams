import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";

const empty = {
  name:"", code:"", program:"Standard", duration_months:3, sessions_per_week:2,
  curriculum:"", admission_fee:0, monthly_fee:0, quarterly_fee:0, annual_fee:0,
  custom_plan_name:"Custom", custom_duration_days:0, custom_fee:0,
  exam_fee:0, material_fee:0, late_penalty:0, status:"active",
};
const pickForm = (l) => ({
  name: l.name||"", code: l.code||"", program: l.program||"Standard",
  duration_months: l.duration_months ?? 3, sessions_per_week: l.sessions_per_week ?? 2,
  curriculum: l.curriculum||"", admission_fee: l.admission_fee||0, monthly_fee: l.monthly_fee||0,
  quarterly_fee: l.quarterly_fee||0, annual_fee: l.annual_fee||0,
  custom_plan_name: l.custom_plan_name || "Custom", custom_duration_days: l.custom_duration_days || 0,
  custom_fee: l.custom_fee || 0, exam_fee: l.exam_fee||0,
  material_fee: l.material_fee||0, late_penalty: l.late_penalty||0, status: l.status||"active",
});

const fmt = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;

export default function Levels() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);
  const [view, setView] = useState("grid");

  const load = () => api.get("/levels").then((r)=>setItems(r.data));
  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const startEdit = (l) => { setEditingId(l.id); setForm(pickForm(l)); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      ["duration_months","sessions_per_week","admission_fee","monthly_fee","quarterly_fee","annual_fee","custom_duration_days","custom_fee","exam_fee","material_fee","late_penalty"]
        .forEach((k)=>{ payload[k] = Number(payload[k] || 0); });
      if (editingId) {
        await api.put(`/levels/${editingId}`, payload);
        toast.success("Level updated");
      } else {
        await api.post("/levels", payload);
        toast.success("Level added");
      }
      setOpen(false); setForm(empty); setEditingId(null); load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async (l) => {
    if (!window.confirm(`Delete level "${l.name}"?`)) return;
    try {
      await api.delete(`/levels/${l.id}`);
      toast.success("Level deleted");
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Levels & Fees"
        subtitle="Define program levels and their fee structure. Used to compute invoices."
        actions={
          <>
          <div className="flex rounded-lg border border-[var(--ck-line)] bg-white overflow-hidden">
            <button type="button" title="Grid view" onClick={()=>setView("grid")}
              className={`h-10 w-10 flex items-center justify-center ${view === "grid" ? "bg-[var(--ck-black)] text-white" : "text-[var(--ck-muted)] hover:text-[var(--ck-black)]"}`}
              data-testid="levels-grid-view">
              <LayoutGrid size={16}/>
            </button>
            <button type="button" title="List view" onClick={()=>setView("list")}
              className={`h-10 w-10 flex items-center justify-center border-l border-[var(--ck-line)] ${view === "list" ? "bg-[var(--ck-black)] text-white" : "text-[var(--ck-muted)] hover:text-[var(--ck-black)]"}`}
              data-testid="levels-list-view">
              <List size={16}/>
            </button>
          </div>
          <Dialog open={open} onOpenChange={(o)=>{ setOpen(o); if(!o){ setEditingId(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <button className="ck-btn-primary flex items-center gap-2" data-testid="add-level-btn" onClick={startCreate}><Plus size={14}/> New Level</button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingId ? "Edit level" : "Add a level"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="grid grid-cols-2 gap-4" data-testid="level-form">
                <Field label="Name" required><Input data-testid="lf-name" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required /></Field>
                <Field label="Code" required><Input data-testid="lf-code" value={form.code} onChange={(e)=>setForm({...form, code:e.target.value})} required /></Field>
                <Field label="Program"><Input value={form.program} onChange={(e)=>setForm({...form, program:e.target.value})} /></Field>
                <Field label="Duration (months)"><Input type="number" value={form.duration_months} onChange={(e)=>setForm({...form, duration_months:e.target.value})} /></Field>
                <Field label="Sessions / week"><Input type="number" value={form.sessions_per_week} onChange={(e)=>setForm({...form, sessions_per_week:e.target.value})} /></Field>
                <Field label="Admission Fee"><Input type="number" data-testid="lf-admission" value={form.admission_fee} onChange={(e)=>setForm({...form, admission_fee:e.target.value})} /></Field>
                <Field label="Monthly Fee"><Input type="number" data-testid="lf-monthly" value={form.monthly_fee} onChange={(e)=>setForm({...form, monthly_fee:e.target.value})} /></Field>
                <Field label="Quarterly Fee"><Input type="number" value={form.quarterly_fee} onChange={(e)=>setForm({...form, quarterly_fee:e.target.value})} /></Field>
                <Field label="Annual Fee"><Input type="number" value={form.annual_fee} onChange={(e)=>setForm({...form, annual_fee:e.target.value})} /></Field>
                <Field label="Custom Plan Name"><Input value={form.custom_plan_name} onChange={(e)=>setForm({...form, custom_plan_name:e.target.value})} /></Field>
                <Field label="Custom Duration (days)"><Input type="number" min="0" value={form.custom_duration_days} onChange={(e)=>setForm({...form, custom_duration_days:e.target.value})} /></Field>
                <Field label="Custom Fee"><Input type="number" value={form.custom_fee} onChange={(e)=>setForm({...form, custom_fee:e.target.value})} /></Field>
                <Field label="Exam / Assessment Fee"><Input type="number" value={form.exam_fee} onChange={(e)=>setForm({...form, exam_fee:e.target.value})} /></Field>
                <Field label="Material / Kit Fee"><Input type="number" value={form.material_fee} onChange={(e)=>setForm({...form, material_fee:e.target.value})} /></Field>
                <Field label="Late Penalty"><Input type="number" value={form.late_penalty} onChange={(e)=>setForm({...form, late_penalty:e.target.value})} /></Field>
                <Field label="Curriculum / Milestones" full><Input value={form.curriculum} onChange={(e)=>setForm({...form, curriculum:e.target.value})} /></Field>
                <div className="col-span-2 flex justify-end gap-2">
                  <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                  <button className="ck-btn-primary" type="submit" data-testid="lf-submit">{editingId ? "Save changes" : "Add level"}</button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      {view === "grid" ? (
      <div className="grid md:grid-cols-2 gap-4" data-testid="levels-grid">
        {items.map((l)=>(
          <div key={l.id} className="ck-card-elevated p-5" data-testid={`level-card-${l.id}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="ck-pill ck-pill-orange">{l.code}</span>
              <span className="text-xs text-[var(--ck-muted)]">{l.sessions_per_week}x/wk · {l.duration_months}mo</span>
            </div>
            <div className="ck-display text-2xl font-semibold mb-3">{l.name}</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <div className="text-[var(--ck-muted)]">Admission</div><div className="text-right">{fmt(l.admission_fee)}</div>
              <div className="text-[var(--ck-muted)]">Monthly</div><div className="text-right font-medium">{fmt(l.monthly_fee)}</div>
              <div className="text-[var(--ck-muted)]">Quarterly</div><div className="text-right">{fmt(l.quarterly_fee)}</div>
              <div className="text-[var(--ck-muted)]">Annual</div><div className="text-right">{fmt(l.annual_fee)}</div>
              <div className="text-[var(--ck-muted)]">{l.custom_plan_name || "Custom"} ({l.custom_duration_days || 0}d)</div><div className="text-right">{fmt(l.custom_fee)}</div>
              <div className="text-[var(--ck-muted)]">Exam</div><div className="text-right">{fmt(l.exam_fee)}</div>
              <div className="text-[var(--ck-muted)]">Material</div><div className="text-right">{fmt(l.material_fee)}</div>
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--ck-line)]">
              <button className="att-btn flex items-center gap-1" onClick={()=>startEdit(l)} data-testid={`level-edit-${l.id}`}>
                <Pencil size={12}/> Edit
              </button>
              <button className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600" onClick={()=>del(l)} data-testid={`level-delete-${l.id}`}>
                <Trash2 size={12}/> Delete
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-[var(--ck-muted)]">No levels yet. Add your first.</div>}
      </div>
      ) : (
      <div className="ck-card-elevated p-2 overflow-x-auto" data-testid="levels-list">
        <table className="w-full ck-table text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Code</th>
              <th>Name</th>
              <th>Program</th>
              <th>Duration</th>
              <th className="text-right">Monthly</th>
              <th className="text-right">Quarterly</th>
              <th className="text-right">Annual</th>
              <th className="text-right">Custom</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l)=>(
              <tr key={l.id}>
                <td className="px-4 py-3"><span className="ck-pill ck-pill-orange">{l.code}</span></td>
                <td className="font-medium">{l.name}</td>
                <td className="text-[var(--ck-muted)]">{l.program}</td>
                <td className="text-[var(--ck-muted)]">{l.duration_months}mo · {l.sessions_per_week}x/wk</td>
                <td className="text-right">{fmt(l.monthly_fee)}</td>
                <td className="text-right">{fmt(l.quarterly_fee)}</td>
                <td className="text-right">{fmt(l.annual_fee)}</td>
                <td className="text-right">{fmt(l.custom_fee)} · {l.custom_duration_days || 0}d</td>
                <td className="pr-4">
                  <div className="flex justify-end gap-1">
                    <button className="att-btn flex items-center gap-1" onClick={()=>startEdit(l)} data-testid={`level-list-edit-${l.id}`}>
                      <Pencil size={12}/> Edit
                    </button>
                    <button className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600" onClick={()=>del(l)} data-testid={`level-list-delete-${l.id}`}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="9" className="text-center text-[var(--ck-muted)] py-8">No levels yet. Add your first.</td></tr>}
          </tbody>
        </table>
      </div>
      )}
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
