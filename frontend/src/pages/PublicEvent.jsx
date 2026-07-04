import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatApiError, BACKEND_URL, LOGO_URL } from "@/lib/api";
import PhoneNumberInput from "@/components/PhoneNumberInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MapPin, IndianRupee, CheckCircle2, Loader2, XCircle } from "lucide-react";

const fmt = (n) => (Number(n || 0) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "Free");
const fmtWhen = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }); }
  catch { return iso; }
};

export default function PublicEvent() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", custom_field_values: {} });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get(`/public/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch(() => setNotFound(true));
  }, [id]);

  const setCustom = (fieldId, value) =>
    setForm((f) => ({ ...f, custom_field_values: { ...f.custom_field_values, [fieldId]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const { data } = await api.post(`/public/events/${id}/register`, form);
      if (data.payment_required && data.payment_link_url) {
        window.location.href = data.payment_link_url;
        return;
      }
      setResult(data);
    } catch (ex) {
      setErr(formatApiError(ex.response?.data?.detail) || "Could not submit registration");
    } finally { setSubmitting(false); }
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--ck-cream)" }}>
        <div className="ck-card-elevated p-10 max-w-md text-center">
          <XCircle size={40} className="text-[var(--ck-muted)] mx-auto mb-4" />
          <h1 className="ck-display text-2xl font-semibold mb-2">Event not found</h1>
          <p className="text-sm text-[var(--ck-muted)]">This event doesn't exist, or registration hasn't opened yet.</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-[var(--ck-muted)]">Loading…</div>;
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--ck-cream)" }} data-testid="rsvp-done">
        <div className="ck-card-elevated p-10 max-w-lg text-center">
          <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
          <h1 className="ck-display text-3xl font-semibold mb-2">You're in!</h1>
          <p className="text-sm text-[var(--ck-muted)] mb-4">
            Registration <b>{result.registration_no}</b> for <b>{event.title}</b> is confirmed.
          </p>
          <p className="text-xs text-[var(--ck-muted)]">A confirmation has been sent to your WhatsApp / email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ck-cream)" }} data-testid="rsvp-page">
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <img src={LOGO_URL} alt="" className="w-8 h-8 object-contain" />
          <span className="ck-display text-sm font-semibold">Chess <span style={{ color: "var(--ck-orange)" }}>Klub</span> Mysuru</span>
        </div>

        <div className="ck-card-elevated overflow-hidden mb-6">
          {event.poster_url && (
            <img src={`${BACKEND_URL}${event.poster_url}`} alt="" className="w-full max-h-72 object-cover" />
          )}
          <div className="p-6">
            <h1 className="ck-display text-3xl font-semibold mb-3">{event.title}</h1>
            {event.description && <p className="text-sm text-[var(--ck-muted)] mb-4 whitespace-pre-wrap">{event.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5"><Calendar size={14} className="text-[var(--ck-orange)]" /> {fmtWhen(event.event_datetime)}</div>
              {event.venue && <div className="flex items-center gap-1.5"><MapPin size={14} className="text-[var(--ck-orange)]" /> {event.venue}</div>}
              <div className="flex items-center gap-1.5 font-semibold"><IndianRupee size={14} className="text-[var(--ck-orange)]" /> {fmt(event.fee)}</div>
            </div>
          </div>
        </div>

        {!event.registration_open ? (
          <div className="ck-card-elevated p-8 text-center">
            <p className="text-sm text-[var(--ck-muted)]">Registration for this event is currently closed.</p>
          </div>
        ) : (
          <div className="ck-card-elevated p-6 sm:p-8">
            <h2 className="text-lg font-semibold mb-4">Register</h2>
            <form onSubmit={submit} className="space-y-4" data-testid="rsvp-form">
              <div>
                <Label className="text-xs">Full name</Label>
                <Input data-testid="rsvp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input data-testid="rsvp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">WhatsApp / phone</Label>
                <PhoneNumberInput inputTestId="rsvp-phone" selectTestId="rsvp-phone-country"
                                  value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
              </div>

              {(event.custom_fields || []).map((f) => (
                <div key={f.id}>
                  <Label className="text-xs">{f.label}{f.required && <span className="text-[var(--ck-orange)]"> *</span>}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={form.custom_field_values[f.id] || ""} onChange={(e) => setCustom(f.id, e.target.value)} required={f.required} />
                  ) : f.type === "select" ? (
                    <Select value={form.custom_field_values[f.id] || ""} onValueChange={(v) => setCustom(f.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm mt-1.5">
                      <input type="checkbox" checked={form.custom_field_values[f.id] === "true"}
                             onChange={(e) => setCustom(f.id, e.target.checked ? "true" : "false")} />
                      Yes
                    </label>
                  ) : (
                    <Input type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                           value={form.custom_field_values[f.id] || ""} onChange={(e) => setCustom(f.id, e.target.value)}
                           required={f.required} />
                  )}
                </div>
              ))}

              {err && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{err}</div>}

              <button type="submit" disabled={submitting} data-testid="rsvp-submit"
                      className="ck-btn-primary w-full h-11 flex items-center justify-center gap-2">
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {event.fee > 0 ? `Continue to pay ${fmt(event.fee)}` : "Register"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
