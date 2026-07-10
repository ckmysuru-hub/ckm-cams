import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/lib/usePagination";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, MessageCircle, CheckCircle2, AlertTriangle, Inbox, Send, Mail, Bell, Filter } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function statusTone(status) {
  if (["sent", "delivered", "read", "gmail_smtp"].includes(status)) return "text-green-700 bg-green-50 border-green-200";
  if (["failed", "deleted", "error"].includes(status)) return "text-red-700 bg-red-50 border-red-200";
  return "text-[var(--ck-muted)] bg-white border-[var(--ck-line)]";
}

const stamp = (value) => value?.slice(0, 16).replace("T", " ") || "--";

export default function WhatsAppMessages() {
  const [range, setRange] = useState({ start_date: monthStart(), end_date: today() });
  const [channel, setChannel] = useState("all");
  const [template, setTemplate] = useState("all");
  const [data, setData] = useState({ messages: [], inbound: [], dashboard: {}, templates: [] });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { ...range, channel };
      const { data } = await api.get("/notifications/messages", { params });
      setData(data);
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  const templateOptions = useMemo(() => {
    const values = new Set(data.templates || []);
    (data.messages || []).forEach((m) => { if (m.template) values.add(m.template); });
    return [...values].sort();
  }, [data]);

  const filtered = (data.messages || []).filter((m) => {
    if (template !== "all" && m.template !== template) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    const hay = [
      m.display_to || m.to || "",
      m.template || "",
      m.subject || "",
      m.latest_status || m.status || "",
      m.content || "",
      ...(m.params || []),
      ...((m.responses || []).map((r) => `${r.profile_name || ""} ${r.from || ""} ${r.text || r.type || ""}`)),
    ].join(" ").toLowerCase();
    return hay.includes(needle);
  });
  const filteredInbound = (data.inbound || []).filter((msg) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return `${msg.profile_name || ""} ${msg.from || ""} ${msg.text || msg.type || ""}`.toLowerCase().includes(needle);
  });
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages, totalItems } = usePagination(filtered, 20);

  return (
    <>
      <PageHeader
        eyebrow="Director"
        title="Notifications"
        subtitle="Email and WhatsApp notifications, delivery status, and parent replies from the webhook."
      />

      <div className="ck-card-elevated p-4 mb-4 grid lg:grid-cols-6 gap-3 items-end" data-testid="notifications-toolbar">
        <Field label="From">
          <Input type="date" value={range.start_date} onChange={(e)=>setRange({ ...range, start_date: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.end_date} onChange={(e)=>setRange({ ...range, end_date: e.target.value })} />
        </Field>
        <Field label="Channel">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-10" data-testid="notifications-channel-filter"><Filter size={12} className="mr-1"/><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Template">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="h-10" data-testid="notifications-template-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {templateOptions.map((name)=>(<SelectItem key={name} value={name}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Search</div>
          <div className="h-10 px-3 rounded-md border border-[var(--ck-line)] bg-white flex items-center gap-2">
            <Search size={15} className="text-[var(--ck-muted)]" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Template, number, subject or reply" className="flex-1 outline-none bg-transparent text-sm" />
          </div>
        </div>
        <button onClick={load} disabled={loading} className="ck-btn-primary flex items-center justify-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Refresh
        </button>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Stat label="Sent" value={data.dashboard?.sent ?? 0} icon={Send} />
        <Stat label="WhatsApp sent" value={data.dashboard?.whatsapp_sent ?? 0} icon={MessageCircle} />
        <Stat label="Email sent" value={data.dashboard?.email_sent ?? 0} icon={Mail} />
        <Stat label="Replies received" value={data.dashboard?.inbound ?? 0} icon={Inbox} />
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-4">
        <div>
          <div className="ck-card-elevated p-2 overflow-x-auto">
            <div className="px-2 py-3">
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Notification log</div>
              <div className="ck-display text-xl font-semibold">Sent email and WhatsApp messages</div>
            </div>
            <table className="w-full ck-table text-sm" data-testid="notifications-table">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">Sent at</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Content / replies</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((m)=>(
                  <tr key={m.id || `${m.channel}-${m.created_at}-${m.to}`}>
                    <td className="px-4 py-3 text-[var(--ck-muted)] whitespace-nowrap">{stamp(m.created_at)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize">
                        {m.channel === "email" ? <Mail size={13}/> : <MessageCircle size={13}/>}
                        {m.channel}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{m.display_to || m.to}</td>
                    <td className="font-medium">{m.template || "--"}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs capitalize ${statusTone(m.latest_status)}`}>
                        {["failed", "error"].includes(m.latest_status) ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>}
                        {m.latest_status || "unknown"}
                      </span>
                    </td>
                    <td className="max-w-[360px]">
                      {m.channel === "whatsapp" ? (
                        m.responses?.length ? (
                          <button type="button" onClick={()=>setSelected(m)} className="text-left text-xs text-[var(--ck-orange)] font-semibold hover:underline">
                            View {m.responses.length} full WhatsApp response{m.responses.length === 1 ? "" : "s"}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--ck-muted)]">{(m.params || []).join(" · ") || "No reply"}</span>
                        )
                      ) : (
                        <div className="text-xs">
                          <div className="font-semibold truncate">{m.subject || "Email"}</div>
                          <div className="text-[var(--ck-muted)] truncate">{m.content || "No body captured"}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan="6" className="text-center text-[var(--ck-muted)] py-8">No notifications match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} totalItems={totalItems}
                      pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testId="notifications-pagination" />
        </div>

        <div className="ck-card-elevated p-4" data-testid="whatsapp-inbound">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Webhook inbox</div>
              <div className="ck-display text-xl font-semibold">WhatsApp replies</div>
            </div>
            <Inbox size={18} className="text-[var(--ck-orange)]" />
          </div>
          <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
            {filteredInbound.map((msg)=>(
              <div key={msg.id || msg.message_id || `${msg.from}-${msg.received_at}`} className="border border-[var(--ck-line)] rounded-md p-3 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{msg.profile_name || msg.from || "Unknown"}</div>
                    <div className="font-mono text-[11px] text-[var(--ck-muted)]">{msg.from}</div>
                  </div>
                  <div className="text-[11px] text-[var(--ck-muted)] whitespace-nowrap">{stamp(msg.received_at)}</div>
                </div>
                <div className="text-sm mt-2 whitespace-pre-wrap break-words">{msg.text || msg.type || "Message received"}</div>
              </div>
            ))}
            {!filteredInbound.length && (
              <div className="text-sm text-[var(--ck-muted)] py-8 text-center">No incoming replies in this date range.</div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open)=>{ if (!open) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>WhatsApp responses</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--ck-line)] bg-white p-3 text-sm">
                <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">Original template</div>
                <div className="font-semibold">{selected.template}</div>
                <div className="text-xs text-[var(--ck-muted)] mt-1">{(selected.params || []).join(" · ")}</div>
              </div>
              <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                {(selected.responses || []).map((r)=>(
                  <div key={r.id || r.message_id || r.received_at} className="rounded-md border border-[var(--ck-line)] p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-sm">{r.profile_name || r.from || "Unknown"}</div>
                        <div className="font-mono text-[11px] text-[var(--ck-muted)]">{r.from}</div>
                      </div>
                      <div className="text-[11px] text-[var(--ck-muted)] whitespace-nowrap">{stamp(r.received_at)}</div>
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{r.text || r.type || "Message received"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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

function Stat({ label, value, icon: Icon = Bell }) {
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
