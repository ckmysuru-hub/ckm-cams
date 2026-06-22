import { useEffect, useState } from "react";
import { api, formatApiError, LOGO_URL } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";

const empty = {
  full_name: "", dob: "", gender: "male", parent_name: "",
  parent_whatsapp: "", parent_email: "", address: "",
  level_preference: "", referred_by: "", notes: "",
};

export default function Register() {
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/registrations/public/meta").then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setSubmitting(true);
    try {
      const payload = { ...form, parent_email: form.parent_email || null };
      await api.post("/registrations", payload);
      setDone(true);
    } catch (ex) {
      setErr(formatApiError(ex.response?.data?.detail) || "Could not submit");
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--ck-cream)" }} data-testid="register-done">
        <div className="ck-card-elevated p-10 max-w-lg text-center">
          <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
          <h1 className="ck-display text-3xl font-semibold mb-2">Thank you!</h1>
          <p className="text-sm text-[var(--ck-muted)] mb-6">
            We've received your registration for <b>{form.full_name}</b>. Our team will reach out shortly to confirm batch, fees, and the joining date.
          </p>
          <p className="text-xs text-[var(--ck-muted)]">A confirmation has been sent to your WhatsApp / email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[1.05fr_1.4fr]" data-testid="register-page">
      <div className="ck-auth-art ck-grain relative hidden md:flex flex-col justify-between p-12 text-white overflow-hidden">
        <div className="flex items-center gap-3">
          <img src={meta?.academy?.logo_url || LOGO_URL} alt="" className="w-9 h-9 object-contain" />
          <div className="leading-tight">
            <div className="ck-display text-lg font-semibold">
              Chess <span style={{ color: "var(--ck-orange)" }}>Klub</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">{meta?.academy?.name || "Mysuru"}</div>
          </div>
        </div>
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[var(--ck-orange)] mb-4">Student registration</div>
          <h2 className="ck-display text-5xl font-semibold leading-[1.05] mb-5">
            Start the<br /><span style={{ color: "var(--ck-orange)" }}>next opening.</span>
          </h2>
          <p className="text-white/60 max-w-md text-sm leading-relaxed">
            Fill out a quick form and our team will confirm your child's batch, schedule and fees — usually within a day.
          </p>
          <p className="text-white/40 text-xs mt-6">
            Questions? Call us at {meta?.academy?.phone || ""} or write to {meta?.academy?.email || ""}.
          </p>
        </div>
        <img src={LOGO_URL} alt="" className="absolute -right-24 -bottom-20 w-[460px] opacity-[0.10] pointer-events-none" />
      </div>

      <div className="p-4 sm:p-8 md:p-12 bg-[var(--ck-cream)] overflow-y-auto">
        <div className="max-w-xl mx-auto">
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">Enroll your child</div>
          <h1 className="ck-display text-3xl sm:text-4xl font-semibold mb-2">Tell us about the player.</h1>
          <p className="text-sm text-[var(--ck-muted)] mb-8">
            This goes to our coaches for review. We'll lock in the level and batch when we get back to you.
          </p>

          <form onSubmit={submit} className="grid grid-cols-2 gap-4" data-testid="register-form">
            <Field label="Student's full name" required>
              <Input data-testid="rf-name" value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} required />
            </Field>
            <Field label="Date of birth">
              <Input type="date" data-testid="rf-dob" value={form.dob} onChange={(e)=>setForm({...form, dob:e.target.value})} />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onValueChange={(v)=>setForm({...form, gender:v})}>
                <SelectTrigger data-testid="rf-gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preferred level">
              <Select value={form.level_preference || "_open"} onValueChange={(v)=>setForm({...form, level_preference: v === "_open" ? "" : v})}>
                <SelectTrigger data-testid="rf-level"><SelectValue placeholder="Not sure / suggest one" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_open">Not sure — please suggest</SelectItem>
                  {(meta?.levels || []).map((l)=>(<SelectItem key={l.id} value={l.code}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Parent / guardian name" required>
              <Input data-testid="rf-parent" value={form.parent_name} onChange={(e)=>setForm({...form, parent_name:e.target.value})} required />
            </Field>
            <Field label="WhatsApp number" required>
              <Input data-testid="rf-wa" placeholder="+91..." value={form.parent_whatsapp} onChange={(e)=>setForm({...form, parent_whatsapp:e.target.value})} required />
            </Field>
            <Field label="Email" full>
              <Input data-testid="rf-email" type="email" value={form.parent_email} onChange={(e)=>setForm({...form, parent_email:e.target.value})} />
            </Field>
            <Field label="Address" full>
              <Input data-testid="rf-address" value={form.address} onChange={(e)=>setForm({...form, address:e.target.value})} />
            </Field>
            <Field label="How did you hear about us?">
              <Input value={form.referred_by} onChange={(e)=>setForm({...form, referred_by:e.target.value})} />
            </Field>
            <Field label="Anything we should know?">
              <Input value={form.notes} onChange={(e)=>setForm({...form, notes:e.target.value})} />
            </Field>

            {err && (
              <div className="col-span-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{err}</div>
            )}

            <div className="col-span-2 mt-2">
              <button type="submit" disabled={submitting} data-testid="rf-submit"
                className="ck-btn-primary w-full h-11 flex items-center justify-center gap-2">
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Submit registration
              </button>
              <p className="text-[11px] text-[var(--ck-muted)] mt-3 text-center">
                By submitting, you agree to be contacted by Chess Klub Mysuru regarding this enrolment.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
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
