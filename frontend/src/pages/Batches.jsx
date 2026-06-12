import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const empty = { name:"", level_id:"", coach_id:"", schedule_days:[], session_time:"", venue:"", max_capacity:20, status:"active" };
const pickForm = (b) => ({
  name: b.name || "", level_id: b.level_id || "", coach_id: b.coach_id || "",
  schedule_days: b.schedule_days || [], session_time: b.session_time || "",
  venue: b.venue || "", max_capacity: b.max_capacity ?? 20, status: b.status || "active",
});

export default function Batches() {
  const [items, setItems] = useState([]);
  const [levels, setLevels] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/batches").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/levels").then((r) => setLevels(r.data));
    api.get("/users").then((r) => setCoaches(r.data.filter((u) => ["coach","director","ops_manager"].includes(u.role)))).catch(()=>{});
  }, []);

  const startCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const startEdit = (b) => { setEditingId(b.id); setForm(pickForm(b)); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, max_capacity: Number(form.max_capacity) };
      if (editingId) {
        await api.put(`/batches/${editingId}`, payload);
        toast.success("Batch updated");
      } else {
        await api.post("/batches", payload);
        toast.success("Batch created");
      }
      setOpen(false); setForm(empty); setEditingId(null); load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async (b) => {
    if (!window.confirm(`Delete batch "${b.name}"?`)) return;
    try {
      await api.delete(`/batches/${b.id}`);
      toast.success("Batch deleted");
      load();
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const toggleDay = (d) =>
    setForm((f)=>({ ...f, schedule_days: f.schedule_days.includes(d) ? f.schedule_days.filter(x=>x!==d) : [...f.schedule_days, d] }));

  return (
    <>
      <PageHeader
        eyebrow="Classroom"
        title="Batches"
        subtitle="Group your students by level and schedule. Assign coaches and venues."
        actions={
          <Dialog open={open} onOpenChange={(o)=>{ setOpen(o); if(!o){ setEditingId(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <button className="ck-btn-primary flex items-center gap-2" data-testid="add-batch-btn" onClick={startCreate}><Plus size={14}/> New Batch</button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>{editingId ? "Edit batch" : "Create a batch"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="grid grid-cols-2 gap-4" data-testid="batch-form">
                <Field label="Batch Name" required full>
                  <Input data-testid="bf-name" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required />
                </Field>
                <Field label="Level">
                  <Select value={form.level_id || "_none"} onValueChange={(v)=>setForm({...form, level_id: v === "_none" ? "" : v})}>
                    <SelectTrigger data-testid="bf-level"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {levels.map((l)=>(<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Coach">
                  <Select value={form.coach_id || "_none"} onValueChange={(v)=>setForm({...form, coach_id: v === "_none" ? "" : v})}>
                    <SelectTrigger data-testid="bf-coach"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {coaches.map((c)=>(<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Session Time">
                  <Input data-testid="bf-time" placeholder="e.g. 5:30 PM – 7:00 PM" value={form.session_time} onChange={(e)=>setForm({...form, session_time:e.target.value})} />
                </Field>
                <Field label="Venue / Room">
                  <Input data-testid="bf-venue" value={form.venue} onChange={(e)=>setForm({...form, venue:e.target.value})} />
                </Field>
                <Field label="Max Capacity">
                  <Input type="number" data-testid="bf-capacity" value={form.max_capacity} onChange={(e)=>setForm({...form, max_capacity:e.target.value})} />
                </Field>
                <Field label="Schedule Days" full>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d)=>(
                      <button type="button" key={d} onClick={()=>toggleDay(d)}
                        className={`att-btn ${form.schedule_days.includes(d) ? "active P" : ""}`}>{d}</button>
                    ))}
                  </div>
                </Field>
                <div className="col-span-2 flex justify-end gap-2 mt-2">
                  <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                  <button type="submit" className="ck-btn-primary" data-testid="bf-submit">{editingId ? "Save changes" : "Create"}</button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((b)=>(
          <div key={b.id} className="ck-card-elevated p-5" data-testid={`batch-card-${b.id}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="ck-pill ck-pill-orange">{b.status}</span>
              <span className="text-xs text-[var(--ck-muted)] flex items-center gap-1"><Users size={12}/>{b.enrolled}/{b.max_capacity}</span>
            </div>
            <div className="ck-display text-2xl font-semibold">{b.name}</div>
            <div className="text-xs text-[var(--ck-muted)] mt-1">{b.session_time || "—"}</div>
            <div className="text-xs text-[var(--ck-muted)] mt-1">{b.venue || "—"}</div>
            <div className="flex flex-wrap gap-1 mt-3">
              {(b.schedule_days||[]).map((d)=>(<span key={d} className="ck-pill ck-pill-black">{d}</span>))}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--ck-line)]">
              <button className="att-btn flex items-center gap-1" onClick={()=>startEdit(b)} data-testid={`batch-edit-${b.id}`}>
                <Pencil size={12}/> Edit
              </button>
              <button className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600" onClick={()=>del(b)} data-testid={`batch-delete-${b.id}`}>
                <Trash2 size={12}/> Delete
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-[var(--ck-muted)]">No batches yet. Add your first.</div>}
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
