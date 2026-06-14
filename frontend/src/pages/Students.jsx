import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Download, Upload, Filter } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { SortableHead, applySort } from "@/components/SortableHead";

const empty = {
  full_name: "", dob: "", gender: "male", parent_name: "", parent_whatsapp: "",
  parent_email: "", address: "", level_id: "", batch_id: "", payment_plan: "monthly",
  subscription_start: "", subscription_end: "", concession_pct: 0, referred_by: "", status: "active",
};

const pickForm = (s) => ({
  full_name: s.full_name || "", dob: s.dob || "", gender: s.gender || "male",
  parent_name: s.parent_name || "", parent_whatsapp: s.parent_whatsapp || "",
  parent_email: s.parent_email || "", address: s.address || "",
  level_id: s.level_id || "", batch_id: s.batch_id || "",
  payment_plan: s.payment_plan || "monthly", concession_pct: s.concession_pct ?? 0,
  subscription_start: s.subscription_start || "", subscription_end: s.subscription_end || "",
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
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSub, setFilterSub] = useState("all");
  const [importing, setImporting] = useState(false);
  const [pendingLevel, setPendingLevel] = useState(null);
  const [savingLevel, setSavingLevel] = useState(false);

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

  // Derived list: filter + sort
  const batchById = Object.fromEntries(batches.map((b) => [b.id, b.name]));
  const levelById = Object.fromEntries(levels.map((l) => [l.id, l.name]));
  const levelName = (levelId) => levelId ? (levelById[levelId] || "Unknown level") : "No level";
  const filtered = items.filter((s) => {
    if (filterBatch !== "all" && s.batch_id !== filterBatch) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterSub !== "all" && (s.subscription_status || "none") !== filterSub) return false;
    return true;
  });
  const sorted = applySort(filtered, sort, {
    level_id: (s) => levelName(s.level_id),
  });

  const requestLevelChange = (student, nextValue) => {
    const levelId = nextValue === "_none" ? "" : nextValue;
    if ((student.level_id || "") === levelId) return;
    setPendingLevel({ student, level_id: levelId });
  };

  const confirmLevelChange = async () => {
    if (!pendingLevel) return;
    setSavingLevel(true);
    try {
      const payload = {
        ...pickForm(pendingLevel.student),
        level_id: pendingLevel.level_id,
        concession_pct: Number(pendingLevel.student.concession_pct || 0),
      };
      if (!payload.parent_email) payload.parent_email = null;
      await api.put(`/students/${pendingLevel.student.id}`, payload);
      toast.success(`Level updated to ${levelName(pendingLevel.level_id)}`);
      setPendingLevel(null);
      load();
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Level update failed");
    } finally {
      setSavingLevel(false);
    }
  };

  const exportCsv = () => {
    const rows = sorted.map((s) => ({
      student_code: s.student_code,
      full_name: s.full_name,
      dob: s.dob || "",
      gender: s.gender || "",
      parent_name: s.parent_name,
      parent_whatsapp: s.parent_whatsapp,
      parent_email: s.parent_email || "",
      address: s.address || "",
      batch: batchById[s.batch_id] || "",
      level: levelName(s.level_id),
      payment_plan: s.payment_plan || "",
      status: s.status || "",
      subscription_start: s.subscription_start || "",
      subscription_end: s.subscription_end || "",
      enrollment_date: s.enrollment_date || "",
    }));
    if (!rows.length) { toast.error("No students to export"); return; }
    downloadCsv(rows, `chessklub-students-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success(`Exported ${rows.length} student${rows.length === 1 ? "" : "s"}`);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) { toast.error("CSV appears empty"); return; }
      const { data } = await api.post("/students/import", { rows });
      const okMsg = `Imported ${data.created} student${data.created === 1 ? "" : "s"}`;
      if (data.errors?.length) {
        toast.warning(`${okMsg} · ${data.errors.length} row${data.errors.length === 1 ? "" : "s"} skipped`);
        console.warn("Import errors:", data.errors);
      } else {
        toast.success(okMsg);
      }
      load();
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Import failed");
    } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    downloadCsv(
      [{
        full_name: "Sample Kid", dob: "2015-04-12", gender: "male",
        parent_name: "Parent", parent_whatsapp: "+919876543210", parent_email: "parent@example.com",
        address: "Mysuru", payment_plan: "monthly", level_code: "BEG", batch_name: "Monday Evening",
        concession_pct: "0", referred_by: "Friend", enrollment_date: "",
      }],
      "students-import-template.csv",
    );
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
                <Field label="Validity Start">
                  <Input type="date" data-testid="sf-validity-start" value={form.subscription_start || ""} onChange={(e)=>setForm({...form, subscription_start:e.target.value})} />
                </Field>
                <Field label="Validity End">
                  <Input type="date" data-testid="sf-validity-end" value={form.subscription_end || ""} onChange={(e)=>setForm({...form, subscription_end:e.target.value})} />
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

      <div className="ck-card-elevated p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="students-toolbar">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Search size={16} className="text-[var(--ck-muted)]" />
          <input
            data-testid="student-search"
            placeholder="Search by name…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            className="flex-1 outline-none bg-transparent text-sm"
          />
        </div>
        <Select value={filterBatch} onValueChange={setFilterBatch}>
          <SelectTrigger className="w-[160px] h-9" data-testid="filter-batch"><Filter size={12} className="mr-1"/><SelectValue placeholder="Batch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            {batches.map((b)=>(<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSub} onValueChange={setFilterSub}>
          <SelectTrigger className="w-[150px] h-9" data-testid="filter-sub"><SelectValue placeholder="Subscription" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subscriptions</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring_soon">Expiring soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="none">No subscription</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={exportCsv} className="ck-btn-ghost text-xs flex items-center gap-1" data-testid="export-csv">
          <Download size={12}/> Export
        </button>
        <label className="ck-btn-ghost text-xs flex items-center gap-1 cursor-pointer" data-testid="import-csv">
          <Upload size={12}/> {importing ? "Importing…" : "Import"}
          <input type="file" accept=".csv,text/csv" hidden onChange={onImport} disabled={importing} />
        </label>
        <button onClick={downloadTemplate} className="text-[11px] text-[var(--ck-muted)] hover:text-[var(--ck-orange)] underline" data-testid="csv-template">template</button>
        <span className="text-xs text-[var(--ck-muted)] ml-1">{sorted.length} of {items.length}</span>
      </div>

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="students-table">
          <thead>
            <tr className="text-left">
              <SortableHead className="px-4 py-3" label="Code" sortKey="student_code" sort={sort} onSort={setSort} />
              <SortableHead label="Name" sortKey="full_name" sort={sort} onSort={setSort} />
              <th>Parent</th>
              <th>WhatsApp</th>
              <SortableHead label="Level" sortKey="level_id" sort={sort} onSort={setSort} />
              <SortableHead label="Plan" sortKey="payment_plan" sort={sort} onSort={setSort} />
              <SortableHead label="Subscription" sortKey="subscription_end" sort={sort} onSort={setSort} />
              <th>Status</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono text-xs">{s.student_code}</td>
                <td>
                  <Link to={`/students/${s.id}`} className="font-medium hover:text-[var(--ck-orange)]" data-testid={`student-link-${s.id}`}>
                    {s.full_name}
                  </Link>
                </td>
                <td className="text-[var(--ck-muted)]">{s.parent_name}</td>
                <td className="text-[var(--ck-muted)]">{s.parent_whatsapp}</td>
                <td>
                  <Select value={s.level_id || "_none"} onValueChange={(v) => requestLevelChange(s, v)}>
                    <SelectTrigger className="h-8 w-[150px]" data-testid={`student-level-${s.id}`}>
                      <SelectValue placeholder="Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {levels.map((l)=>(<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="capitalize">{s.payment_plan}</td>
                <td>
                  {s.subscription_end ? (
                    <span className={`ck-pill ${
                      s.subscription_status === "active" ? "ck-pill-green" :
                      s.subscription_status === "expiring_soon" ? "ck-pill-orange" :
                      s.subscription_status === "expired" ? "ck-pill-red" : "ck-pill-black"
                    }`}>
                      {s.subscription_end}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--ck-muted)]">—</span>
                  )}
                </td>
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
            {!sorted.length && (
              <tr><td colSpan="9" className="text-center text-[var(--ck-muted)] py-10">No students match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!pendingLevel} onOpenChange={(o) => { if (!o && !savingLevel) setPendingLevel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update student level?</AlertDialogTitle>
            <AlertDialogDescription>
              Change {pendingLevel?.student?.full_name}'s level from {levelName(pendingLevel?.student?.level_id)} to {levelName(pendingLevel?.level_id)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingLevel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingLevel}
              onClick={(e) => {
                e.preventDefault();
                confirmLevelChange();
              }}
            >
              {savingLevel ? "Updating…" : "Update level"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
