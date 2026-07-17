import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/lib/usePagination";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, MessageCircle, CheckCircle2, AlertTriangle, Send, Mail, Bell, Filter, Eye } from "lucide-react";
import { toast } from "sonner";
import TableActions, { TableActionItem } from "@/components/TableActions";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function statusTone(status) {
  if (["sent", "delivered", "read", "gmail_smtp"].includes(status)) return "text-green-700 bg-green-50 border-green-200";
  if (["failed", "deleted", "error"].includes(status)) return "text-red-700 bg-red-50 border-red-200";
  return "text-[var(--ck-muted)] bg-white border-[var(--ck-line)]";
}

const stamp = (value) => value?.slice(0, 16).replace("T", " ") || "--";
const notificationContent = (item) => item?.content || (item?.params || []).map((p, i) => `${i + 1}. ${p}`).join("\n") || "";
const errorDetails = (item) => {
  if (item?.error_details) return item.error_details;
  const result = item?.result || {};
  if (result.error) return String(result.error);
  const apiError = result.response?.error;
  if (apiError) return typeof apiError === "string" ? apiError : JSON.stringify(apiError, null, 2);
  if (result.response?.errors) return JSON.stringify(result.response.errors, null, 2);
  return "";
};

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
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages, totalItems } = usePagination(filtered, 20);

  return (
    <>
      <PageHeader
        eyebrow="Director"
        title="Notifications"
        subtitle="Email and WhatsApp notifications with full sent content and delivery/error details."
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
        <Stat label="Failed" value={data.dashboard?.failed ?? 0} icon={AlertTriangle} />
      </div>

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
                <th>Content</th>
                <th className="text-right pr-4">Details</th>
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
                  <td className="max-w-[440px]">
                    <div className="text-xs">
                      <div className="font-semibold truncate">{m.subject || m.template || "Notification"}</div>
                      <div className="text-[var(--ck-muted)] truncate">{notificationContent(m) || "No content captured"}</div>
                      {errorDetails(m) && <div className="text-red-600 truncate mt-1">{errorDetails(m)}</div>}
                    </div>
                  </td>
                  <td className="text-right pr-4">
                    <TableActions testId={`notification-actions-${m.id || m.created_at}`}>
                      <TableActionItem icon={Eye} onSelect={()=>setSelected(m)} data-testid={`notification-detail-${m.id || m.created_at}`}>View details</TableActionItem>
                    </TableActions>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan="7" className="text-center text-[var(--ck-muted)] py-8">No notifications match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} totalItems={totalItems}
                    pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testId="notifications-pagination" />
      </div>

      <Dialog open={!!selected} onOpenChange={(open)=>{ if (!open) setSelected(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Notification details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Info label="Channel" value={selected.channel} />
                <Info label="Recipient" value={selected.display_to || selected.to} mono />
                <Info label="Template" value={selected.template || "--"} />
                <Info label="Status" value={selected.latest_status || selected.status || "unknown"} />
                <Info label="Sent at" value={stamp(selected.created_at)} />
                {selected.subject && <Info label="Subject" value={selected.subject} />}
              </div>

              <div className="rounded-md border border-[var(--ck-line)] bg-white p-3">
                <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-2">Full content sent</div>
                {selected.channel === "email" && selected.content_html ? (
                  <iframe title="Email content" srcDoc={selected.content_html} className="w-full h-[320px] border border-[var(--ck-line)] rounded-md bg-white" />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap break-words font-sans">{notificationContent(selected) || "No content captured."}</pre>
                )}
              </div>

              {selected.channel === "whatsapp" && (
                <div className="rounded-md border border-[var(--ck-line)] bg-white p-3">
                  <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-2">Template parameters sent to WhatsApp</div>
                  <ol className="space-y-1 text-sm">
                    {(selected.params || []).map((param, idx)=>(
                      <li key={`${idx}-${param}`} className="grid grid-cols-[32px_1fr] gap-2">
                        <span className="text-[var(--ck-muted)] tabular-nums">{idx + 1}.</span>
                        <span className="break-words">{param || "—"}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {errorDetails(selected) && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="text-xs uppercase tracking-wider font-semibold text-red-700 mb-2">Error details</div>
                  <pre className="text-sm whitespace-pre-wrap break-words text-red-800">{errorDetails(selected)}</pre>
                </div>
              )}

              <div className="rounded-md border border-[var(--ck-line)] bg-white p-3">
                <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-2">Provider result</div>
                <pre className="text-xs whitespace-pre-wrap break-words max-h-[220px] overflow-auto">{JSON.stringify(selected.result || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Info({ label, value, mono }) {
  return (
    <div className="rounded-md border border-[var(--ck-line)] bg-white p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-1">{label}</div>
      <div className={`text-sm break-words ${mono ? "font-mono text-xs" : "font-medium"}`}>{value || "—"}</div>
    </div>
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
