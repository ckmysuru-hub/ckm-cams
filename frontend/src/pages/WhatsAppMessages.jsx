import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, MessageCircle, CheckCircle2, AlertTriangle, Inbox, Send } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function statusTone(status) {
  if (["sent", "delivered", "read"].includes(status)) return "text-green-700 bg-green-50 border-green-200";
  if (["failed", "deleted"].includes(status)) return "text-red-700 bg-red-50 border-red-200";
  return "text-[var(--ck-muted)] bg-white border-[var(--ck-line)]";
}

export default function WhatsAppMessages() {
  const [range, setRange] = useState({ start_date: monthStart(), end_date: today() });
  const [data, setData] = useState({ messages: [], inbound: [], dashboard: {} });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp/messages", { params: range });
      setData(data);
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = (data.messages || []).filter((m) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const hay = `${m.display_to || m.to || ""} ${m.template || ""} ${m.status || ""} ${(m.params || []).join(" ")}`.toLowerCase();
    return hay.includes(needle);
  });

  return (
    <>
      <PageHeader
        eyebrow="Director"
        title="WhatsApp Messages"
        subtitle="Cloud API sends, delivery statuses and parent replies captured from the webhook."
      />

      <div className="ck-card-elevated p-4 mb-4 grid lg:grid-cols-5 gap-3 items-end" data-testid="whatsapp-toolbar">
        <Field label="From">
          <Input type="date" value={range.start_date} onChange={(e)=>setRange({ ...range, start_date: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.end_date} onChange={(e)=>setRange({ ...range, end_date: e.target.value })} />
        </Field>
        <div className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Search</div>
          <div className="h-10 px-3 rounded-md border border-[var(--ck-line)] bg-white flex items-center gap-2">
            <Search size={15} className="text-[var(--ck-muted)]" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Template, number or status" className="flex-1 outline-none bg-transparent text-sm" />
          </div>
        </div>
        <button onClick={load} disabled={loading} className="ck-btn-primary flex items-center justify-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Stat label="Sent templates" value={data.dashboard?.sent ?? data.messages?.length ?? 0} icon={Send} />
        <Stat label="Incoming replies" value={data.dashboard?.inbound ?? data.inbound?.length ?? 0} icon={Inbox} />
        <Stat label="With responses" value={data.dashboard?.with_responses ?? (data.messages || []).filter((m)=>m.response_count > 0).length} icon={MessageCircle} />
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-4">
      <div className="ck-card-elevated p-2 overflow-x-auto">
        <div className="px-2 py-3">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Cloud API</div>
          <div className="ck-display text-xl font-semibold">Sent template messages</div>
        </div>
        <table className="w-full ck-table text-sm" data-testid="whatsapp-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Sent at</th>
              <th>Recipient</th>
              <th>Template</th>
              <th>Status</th>
              <th>Responses</th>
              <th>Parameters</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m)=>(
              <tr key={m.id || `${m.created_at}-${m.to}`}>
                <td className="px-4 py-3 text-[var(--ck-muted)] whitespace-nowrap">{m.created_at?.slice(0, 16).replace("T", " ")}</td>
                <td className="font-mono text-xs">{m.display_to || m.to}</td>
                <td className="font-medium">{m.template}</td>
                <td>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs capitalize ${statusTone(m.latest_status)}`}>
                    {m.latest_status === "failed" ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>}
                    {m.latest_status || "unknown"}
                  </span>
                </td>
                <td>
                  {m.responses?.length ? (
                    <div className="space-y-1 max-w-[260px]">
                      {m.responses.slice(0, 2).map((r)=>(
                        <div key={r.id || r.received_at} className="text-xs">
                          <span className="font-semibold">{r.profile_name || r.from}:</span> {r.text || r.type}
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-xs text-[var(--ck-muted)]">No reply</span>}
                </td>
                <td className="text-xs text-[var(--ck-muted)] max-w-[320px] truncate">{(m.params || []).join(" · ")}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan="6" className="text-center text-[var(--ck-muted)] py-8">No WhatsApp messages match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ck-card-elevated p-4" data-testid="whatsapp-inbound">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Webhook inbox</div>
            <div className="ck-display text-xl font-semibold">Incoming replies</div>
          </div>
          <Inbox size={18} className="text-[var(--ck-orange)]" />
        </div>
        <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
          {(data.inbound || []).map((msg)=>(
            <div key={msg.id || msg.message_id || `${msg.from}-${msg.received_at}`} className="border border-[var(--ck-line)] rounded-md p-3 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{msg.profile_name || msg.from || "Unknown"}</div>
                  <div className="font-mono text-[11px] text-[var(--ck-muted)]">{msg.from}</div>
                </div>
                <div className="text-[11px] text-[var(--ck-muted)] whitespace-nowrap">{msg.received_at?.slice(0, 16).replace("T", " ")}</div>
              </div>
              <div className="text-sm mt-2 whitespace-pre-wrap break-words">{msg.text || msg.type || "Message received"}</div>
            </div>
          ))}
          {!data.inbound?.length && (
            <div className="text-sm text-[var(--ck-muted)] py-8 text-center">No incoming replies in this date range.</div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon: Icon = MessageCircle }) {
  return (
    <div className="ck-card-elevated p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-[var(--ck-orange)] text-white flex items-center justify-center">
        <Icon size={17} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">{label}</div>
        <div className="ck-display text-2xl font-semibold">{value}</div>
      </div>
    </div>
  );
}
