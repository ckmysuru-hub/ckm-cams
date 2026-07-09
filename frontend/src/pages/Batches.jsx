import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Pencil, Trash2, MessageCircle, ExternalLink, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/lib/usePagination";
import Pagination from "@/components/Pagination";

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const empty = {
  name:"", level_id:"", coach_id:"", schedule_days:[], session_time:"", venue:"",
  max_capacity:20, status:"active", whatsapp_group_link:"", whatsapp_group_recipient:"",
};
const pickForm = (b) => ({
  name: b.name || "", level_id: b.level_id || "", coach_id: b.coach_id || "",
  schedule_days: b.schedule_days || [], session_time: b.session_time || "",
  venue: b.venue || "", max_capacity: b.max_capacity ?? 20, status: b.status || "active",
  whatsapp_group_link: b.whatsapp_group_link || "", whatsapp_group_recipient: b.whatsapp_group_recipient || "",
});

export default function Batches() {
  const [items, setItems] = useState([]);
  const [levels, setLevels] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);
  const [sendingId, setSendingId] = useState(null);
  const [invitingId, setInvitingId] = useState(null);
  const [view, setView] = useState("grid");
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages, totalItems } = usePagination(items, 12);

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

  const sendBatchWhatsapp = async (b) => {
    setSendingId(b.id);
    try {
      const { data } = await api.post(`/batches/${b.id}/whatsapp`, {
        template: "batch_announcement",
        title: "Class update",
        event_date: new Date().toISOString().slice(0, 10),
      });
      if (data.whatsapp?.sent) toast.success("Batch WhatsApp template sent");
      else if (data.group_link) {
        window.open(data.group_link, "_blank", "noopener,noreferrer");
        toast.success("Opened linked WhatsApp group");
      } else {
        toast.info("Add a WhatsApp group link or recipient for this batch");
      }
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setSendingId(null); }
  };

  const sendParentInvites = async (b) => {
    setInvitingId(b.id);
    try {
      const { data } = await api.post(`/batches/${b.id}/invite-parents`);
      if (data.sent) {
        toast.success(`Sent ${data.sent} group invite${data.sent === 1 ? "" : "s"}`);
      } else if (data.total === 0) {
        toast.info("No active students in this batch yet");
      } else {
        toast.info("No invites sent. Check parent numbers and the group link.");
      }
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setInvitingId(null); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Classroom"
        title="Batches"
        subtitle="Group your students by level and schedule. Assign coaches and venues."
        actions={
          <>
          <div className="flex rounded-lg border border-[var(--ck-line)] bg-white overflow-hidden">
            <button type="button" title="Grid view" onClick={()=>setView("grid")}
              className={`h-10 w-10 flex items-center justify-center ${view === "grid" ? "bg-[var(--ck-black)] text-white" : "text-[var(--ck-muted)] hover:text-[var(--ck-black)]"}`}
              data-testid="batches-grid-view">
              <LayoutGrid size={16}/>
            </button>
            <button type="button" title="List view" onClick={()=>setView("list")}
              className={`h-10 w-10 flex items-center justify-center border-l border-[var(--ck-line)] ${view === "list" ? "bg-[var(--ck-black)] text-white" : "text-[var(--ck-muted)] hover:text-[var(--ck-black)]"}`}
              data-testid="batches-list-view">
              <List size={16}/>
            </button>
          </div>
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
                <Field label="WhatsApp Group Link" full>
                  <Input data-testid="bf-wa-group" placeholder="https://chat.whatsapp.com/..." value={form.whatsapp_group_link} onChange={(e)=>setForm({...form, whatsapp_group_link:e.target.value})} />
                </Field>
                <Field label="WhatsApp Template Recipient" full>
                  <Input data-testid="bf-wa-recipient" placeholder="+91... or approved recipient ID" value={form.whatsapp_group_recipient} onChange={(e)=>setForm({...form, whatsapp_group_recipient:e.target.value})} />
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
          </>
        }
      />

      {view === "grid" ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="batches-grid">
        {pageItems.map((b)=>(
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
            {b.whatsapp_group_link && (
              <a href={b.whatsapp_group_link} target="_blank" rel="noreferrer" className="text-xs text-[var(--ck-orange)] mt-3 inline-flex items-center gap-1">
                <ExternalLink size={12}/> WhatsApp group
              </a>
            )}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[var(--ck-line)]">
              <button className="att-btn flex items-center gap-1" onClick={()=>sendBatchWhatsapp(b)} disabled={sendingId === b.id} data-testid={`batch-whatsapp-${b.id}`}>
                <MessageCircle size={12}/> {sendingId === b.id ? "Sending" : "WhatsApp"}
              </button>
              <button className="att-btn flex items-center gap-1" onClick={()=>sendParentInvites(b)} disabled={invitingId === b.id} data-testid={`batch-invite-${b.id}`}>
                <MessageCircle size={12}/> {invitingId === b.id ? "Inviting" : "Invites"}
              </button>
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
      ) : (
      <div className="ck-card-elevated p-2 overflow-x-auto" data-testid="batches-list">
        <table className="w-full ck-table text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Batch</th>
              <th>Level</th>
              <th>Schedule</th>
              <th>Venue</th>
              <th>Students</th>
              <th>Status</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((b)=>(
              <tr key={b.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{b.name}</div>
                  {b.whatsapp_group_link && (
                    <a href={b.whatsapp_group_link} target="_blank" rel="noreferrer" className="text-xs text-[var(--ck-orange)] inline-flex items-center gap-1">
                      <ExternalLink size={12}/> WhatsApp group
                    </a>
                  )}
                </td>
                <td className="text-[var(--ck-muted)]">{levels.find((l)=>l.id === b.level_id)?.name || "—"}</td>
                <td className="text-[var(--ck-muted)]">
                  <div>{b.session_time || "—"}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(b.schedule_days||[]).map((d)=>(<span key={d} className="ck-pill ck-pill-black">{d}</span>))}
                  </div>
                </td>
                <td className="text-[var(--ck-muted)]">{b.venue || "—"}</td>
                <td><span className="text-xs flex items-center gap-1 text-[var(--ck-muted)]"><Users size={12}/>{b.enrolled}/{b.max_capacity}</span></td>
                <td><span className="ck-pill ck-pill-orange">{b.status}</span></td>
                <td className="pr-4">
                  <div className="flex justify-end gap-1">
                    <button className="att-btn flex items-center gap-1" onClick={()=>sendBatchWhatsapp(b)} disabled={sendingId === b.id} data-testid={`batch-list-whatsapp-${b.id}`}>
                      <MessageCircle size={12}/> {sendingId === b.id ? "Sending" : "WhatsApp"}
                    </button>
                    <button className="att-btn flex items-center gap-1" onClick={()=>sendParentInvites(b)} disabled={invitingId === b.id} data-testid={`batch-list-invite-${b.id}`}>
                      <MessageCircle size={12}/> {invitingId === b.id ? "Inviting" : "Invites"}
                    </button>
                    <button className="att-btn flex items-center gap-1" onClick={()=>startEdit(b)} data-testid={`batch-list-edit-${b.id}`}>
                      <Pencil size={12}/> Edit
                    </button>
                    <button className="att-btn flex items-center gap-1 hover:!border-red-500 hover:!text-red-600" onClick={()=>del(b)} data-testid={`batch-list-delete-${b.id}`}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="7" className="text-center text-[var(--ck-muted)] py-8">No batches yet. Add your first.</td></tr>}
          </tbody>
        </table>
      </div>
      )}
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems}
                  pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testId="batches-pagination" />
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
