import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, BACKEND_URL } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import EventForm, { emptyEvent, slugify } from "@/components/EventForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Calendar, MapPin, IndianRupee, Users, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const fmt = (n) => (Number(n || 0) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "Free");
const fmtWhen = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

export default function Events() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = () => api.get("/events").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const custom_fields = form.custom_fields
      .filter((f) => f.label.trim())
      .map((f) => ({ ...f, id: f.id || slugify(f.label), options: f.type === "select" ? f.options.filter(Boolean) : undefined }));
    setSaving(true);
    try {
      await api.post("/events", { ...form, custom_fields });
      toast.success("Event created");
      setOpen(false);
      setForm(emptyEvent);
      load();
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Could not create event");
    } finally { setSaving(false); }
  };

  const copyLink = (id) => {
    const url = `${window.location.origin}/events/${id}/rsvp`;
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div data-testid="events-page">
      <PageHeader
        eyebrow="Community"
        title="Events"
        subtitle="Create events, open them for public registration with a custom form, and collect the ticket fee online."
        actions={
          <button className="ck-btn-primary flex items-center gap-2" data-testid="new-event-btn" onClick={() => { setForm(emptyEvent); setOpen(true); }}>
            <Plus size={16} /> New event
          </button>
        }
      />

      {loading ? (
        <div className="text-sm text-[var(--ck-muted)]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="ck-card-elevated p-10 text-center">
          <Calendar size={28} className="mx-auto mb-3 text-[var(--ck-muted)]" />
          <p className="text-sm text-[var(--ck-muted)]">No events yet. Create one to open it up for public registration.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="events-grid">
          {items.map((ev) => (
            <Link to={`/events/${ev.id}`} key={ev.id} className="ck-card-elevated overflow-hidden flex flex-col hover:border-[var(--ck-orange)] transition-colors" data-testid={`event-card-${ev.id}`}>
              <div className="h-32 bg-[var(--ck-cream)] flex items-center justify-center overflow-hidden">
                {ev.poster_url ? (
                  <img src={`${BACKEND_URL}${ev.poster_url}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Calendar size={28} className="text-[var(--ck-muted)]" />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{ev.title}</h3>
                  <span className={`ck-pill ${ev.status === "published" ? "ck-pill-green" : ev.status === "cancelled" ? "ck-pill-red" : "ck-pill-black"} shrink-0`}>
                    {ev.status}
                  </span>
                </div>
                <div className="text-xs text-[var(--ck-muted)] flex items-center gap-1.5"><Calendar size={12} /> {fmtWhen(ev.event_datetime)}</div>
                {ev.venue && <div className="text-xs text-[var(--ck-muted)] flex items-center gap-1.5"><MapPin size={12} /> {ev.venue}</div>}
                <div className="flex items-center justify-between mt-1 pt-2 border-t border-[var(--ck-line)]">
                  <span className="text-sm font-semibold flex items-center gap-1"><IndianRupee size={13} />{fmt(ev.fee).replace("₹", "")}</span>
                  <span className="text-xs text-[var(--ck-muted)] flex items-center gap-1"><Users size={12} /> {ev.confirmed_count}/{ev.registrations_count} confirmed</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyLink(ev.id); }}
                  className="mt-1 text-xs flex items-center gap-1.5 text-[var(--ck-orange)] hover:underline w-fit"
                  data-testid={`copy-link-${ev.id}`}
                >
                  {copiedId === ev.id ? <><Check size={12} /> Link copied</> : <><Copy size={12} /> Copy registration link</>}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4" data-testid="event-form">
            <EventForm form={form} setForm={setForm} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="ck-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" disabled={saving} className="ck-btn-primary flex items-center gap-2" data-testid="ev-submit">
                {saving && <Loader2 size={14} className="animate-spin" />} Create event
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
