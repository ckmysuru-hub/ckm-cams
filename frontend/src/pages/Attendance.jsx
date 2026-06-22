import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Save } from "lucide-react";
import { toast } from "sonner";

const OPTIONS = [
  { v: "P", label: "Present" },
  { v: "A", label: "Absent" },
  { v: "LT", label: "Late" },
  { v: "L", label: "Leave" },
  { v: "H", label: "Holiday" },
];

export default function Attendance() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/batches").then((r) => setBatches(r.data)); }, []);

  useEffect(() => {
    if (!batchId) return;
    api.get(`/batches/${batchId}/students`).then((r) => setStudents(r.data));
    api.get("/attendance", { params: { batch_id: batchId, session_date: date } })
      .then((r) => setMarks(r.data?.marks || {}));
  }, [batchId, date]);

  const setMark = (sid, v) => setMarks((m) => ({ ...m, [sid]: v }));
  const setAll = (v) => {
    const m = {}; students.forEach((s) => { m[s.id] = v; }); setMarks(m);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/attendance", { batch_id: batchId, session_date: date, marks });
      toast.success("Attendance saved");
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const exportCsv = async () => {
    try {
      const params = {};
      if (batchId) params.batch_id = batchId;
      if (date) {
        params.start_date = date;
        params.end_date = date;
      }
      const { data } = await api.get("/attendance/export", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${date || "export"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Daily roll-call"
        title="Attendance"
        subtitle="Tap to mark. Auto-saves the session. Late counts toward attendance percentage."
      />

      <div className="ck-card-elevated p-4 mb-4 grid md:grid-cols-3 gap-3 items-end">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Batch</div>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger data-testid="att-batch"><SelectValue placeholder="Select a batch" /></SelectTrigger>
            <SelectContent>
              {batches.map((b)=>(<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Session Date</div>
          <Input type="date" data-testid="att-date" value={date} onChange={(e)=>setDate(e.target.value)} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <button className="ck-btn-ghost" onClick={()=>setAll("P")} disabled={!students.length} data-testid="mark-all-present">Mark all Present</button>
          <button className="ck-btn-ghost flex items-center gap-2" onClick={exportCsv} data-testid="att-export">
            <Download size={14}/> Export
          </button>
          <button className="ck-btn-primary flex items-center gap-2" onClick={save} disabled={!batchId || saving} data-testid="att-save">
            <Save size={14}/> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="ck-card-elevated p-2">
        <table className="w-full ck-table text-sm" data-testid="att-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Student</th>
              <th>Code</th>
              <th className="text-right pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s)=>(
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">{s.full_name}</td>
                <td className="font-mono text-xs">{s.student_code}</td>
                <td className="pr-4">
                  <div className="flex gap-2 justify-end">
                    {OPTIONS.map((o)=>(
                      <button key={o.v}
                        onClick={()=>setMark(s.id, o.v)}
                        className={`att-btn ${marks[s.id]===o.v?`active ${o.v}`:""}`}
                        data-testid={`mark-${s.id}-${o.v}`}>
                        {o.v}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!students.length && (
              <tr><td colSpan="3" className="text-center text-[var(--ck-muted)] py-8">{batchId ? "No students in this batch." : "Select a batch to start."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
