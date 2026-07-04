import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, BACKEND_URL } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import EventForm from "@/components/EventForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Download, Copy, Check, Calendar, MapPin, Users, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n) => (Number(n || 0) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "Free");
const fmtWhen = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};
const statusPill = (s) =>
  s === "paid" || s === "free" ? "ck-pill-green" : s === "failed" ? "ck-pill-red" : "ck-pill-black";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => {
    Promise.all([
      api.get(`/events/${id}`),
      api.get(`/events/${id}/registrations`),
    ]).then(([ev, regs]) => {
      setEvent(ev.data);
      setRegistrations(regs.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const openEdit = () => {
    setForm({
      title: event.title, description: event.description || "", poster_url: event.poster_url || "",
      event_datetime: event.event_datetime, venue: event.venue || "", fee: event.fee || 0,
      registration_open: event.registration_open, status: event.status,
      custom_fields: event.custom_fields || [],
    });
    setEditOpen(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const custom_fields = form.custom_fields
        .filter((f) => f.label.trim())
        .map((f) => ({ ...f, id: f.id || f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), options: f.type === "select" ? f.options.filter(Boolean) : undefined }));
      await api.patch(`/events/${id}`, { ...form, custom_fields });
      toast.success("Event updated");
      setEditOpen(false);
      load();
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Could not update event");
    } finally { setSaving(false); }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/events/${id}/rsvp`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const cancelEvent = async () => {
    if (!window.confirm("Cancel this event? It will be removed from the public page and registration will close.")) return;
    try {
      await api.patch(`/events/${id}`, { status: "cancelled", registration_open: false });
      toast.success("Event cancelled");
      load();
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Could not cancel event");
    }
  };

  if (loading || !event) return <div className="text-sm text-[var(--ck-muted)]">Loading…</div>;

  const customFields = event.custom_fields || [];

  return (
    <div data-testid="event-detail-page">
      <button onClick={() => navigate("/events")} className="text-sm text-[var(--ck-muted)] hover:text-[var(--ck-black)] flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to events
      </button>

      <PageHeader
        eyebrow="Event"
        title={event.title}
        subtitle={event.description}
        actions={
          <>
            <button onClick={copyLink} className="ck-btn-ghost flex items-center gap-2" data-testid="ed-copy-link">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
            </button>
            <button onClick={openEdit} className="ck-btn-ghost flex items-center gap-2" data-testid="ed-edit-btn">
              <Pencil size={14} /> Edit
            </button>
            <a href={`${BACKEND_URL}/api/events/${id}/registrations/export.csv`}
               className="ck-btn-primary flex items-center gap-2" data-testid="ed-export-csv">
              <Download size={14} /> Export CSV
            </a>
          </>
        }
      />

      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <div className="ck-card-elevated p-4">
          <div className="text-xs text-[var(--ck-muted)] mb-1 flex items-center gap-1.5"><Calendar size={12} /> When</div>
          <div className="font-medium text-sm">{fmtWhen(event.event_datetime)}</div>
        </div>
        <div className="ck-card-elevated p-4">
          <div className="text-xs text-[var(--ck-muted)] mb-1 flex items-center gap-1.5"><MapPin size={12} /> Venue</div>
          <div className="font-medium text-sm">{event.venue || "—"}</div>
        </div>
        <div className="ck-card-elevated p-4">
          <div className="text-xs text-[var(--ck-muted)] mb-1">Ticket fee</div>
          <div className="font-medium text-sm">{fmt(event.fee)}</div>
        </div>
        <div className="ck-card-elevated p-4">
          <div className="text-xs text-[var(--ck-muted)] mb-1 flex items-center gap-1.5"><Users size={12} /> Registrations</div>
          <div className="font-medium text-sm">{registrations.filter((r) => r.payment_status === "paid" || r.payment_status === "free").length} confirmed / {registrations.length} total</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className={`ck-pill ${event.status === "published" ? "ck-pill-green" : event.status === "cancelled" ? "ck-pill-red" : "ck-pill-black"}`}>{event.status}</span>
        <span className={`ck-pill ${event.registration_open ? "ck-pill-green" : "ck-pill-black"}`}>{event.registration_open ? "Registration open" : "Registration closed"}</span>
        {event.status !== "cancelled" && (
          <button onClick={cancelEvent} className="text-xs text-red-600 hover:underline flex items-center gap-1 ml-auto" data-testid="ed-cancel-event">
            <Trash2 size={12} /> Cancel event
          </button>
        )}
      </div>

      <div className="ck-card-elevated p-2 overflow-x-auto">
        <table className="w-full ck-table text-sm" data-testid="registrations-table">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Reg. no</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              {customFields.map((f) => (<th key={f.id}>{f.label}</th>))}
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th className="pr-4">Registered</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr key={r.id} data-testid={`reg-row-${r.id}`}>
                <td className="px-4 py-3 font-mono text-xs">{r.registration_no}</td>
                <td>{r.name}</td>
                <td className="text-[var(--ck-muted)]">{r.email || "—"}</td>
                <td className="text-[var(--ck-muted)]">{r.phone || "—"}</td>
                {customFields.map((f) => (<td key={f.id}>{(r.custom_field_values || {})[f.id] || "—"}</td>))}
                <td className="text-right font-medium">{r.amount_paid > 0 ? `₹${Number(r.amount_paid).toLocaleString("en-IN")}` : (r.payment_status === "free" ? "Free" : "—")}</td>
                <td><span className={`ck-pill ${statusPill(r.payment_status)}`}>{r.payment_status}</span></td>
                <td className="pr-4 text-[var(--ck-muted)] text-xs">{r.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
            {!registrations.length && (
              <tr><td colSpan={6 + customFields.length} className="text-center text-[var(--ck-muted)] py-8">
                No registrations yet. Share the registration link to start collecting sign-ups.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit event</DialogTitle></DialogHeader>
            <form onSubmit={submitEdit} className="space-y-4" data-testid="event-edit-form">
              <EventForm form={form} setForm={setForm} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="ck-btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="ck-btn-primary flex items-center gap-2" data-testid="ev-edit-submit">
                  {saving && <Loader2 size={14} className="animate-spin" />} Save changes
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
