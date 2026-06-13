import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, BACKEND_URL, formatApiError } from "@/lib/api";
import { FileText, CheckCircle2, AlertCircle, Calendar, GraduationCap } from "lucide-react";

const fmtINR = (n) => `₹${Number(n||0).toLocaleString("en-IN")}`;

export default function ParentPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/portal/${token}/data`)
      .then((r) => setData(r.data))
      .catch((ex) => setErr(formatApiError(ex.response?.data?.detail) || "Link is invalid or expired."));
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" data-testid="portal-error" style={{ background: "var(--ck-cream)" }}>
        <div className="ck-card-elevated p-8 max-w-md text-center">
          <AlertCircle size={36} className="text-red-600 mx-auto mb-3" />
          <h1 className="ck-display text-2xl font-semibold mb-2">Link unavailable</h1>
          <p className="text-sm text-[var(--ck-muted)]">{err}</p>
          <p className="text-xs text-[var(--ck-muted)] mt-4">Please contact the academy for a fresh link.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen flex items-center justify-center text-sm text-[var(--ck-muted)]">Loading your portal…</div>;

  const { student, academy, attendance, invoices, receipts } = data;
  const subPill =
    student.subscription_status === "active" ? "ck-pill ck-pill-green"
    : student.subscription_status === "expiring_soon" ? "ck-pill ck-pill-orange"
    : student.subscription_status === "expired" ? "ck-pill ck-pill-red" : "ck-pill ck-pill-black";

  return (
    <div className="min-h-screen" data-testid="portal-page" style={{ background: "var(--ck-cream)" }}>
      <header className="bg-white border-b border-[var(--ck-line)] px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {academy?.logo_url && <img src={academy.logo_url} alt="" className="w-10 h-10 object-contain" />}
            <div>
              <div className="ck-display text-lg font-semibold">{academy?.name}</div>
              <div className="text-xs text-[var(--ck-muted)]">{academy?.phone} · {academy?.email}</div>
            </div>
          </div>
          <span className="ck-pill ck-pill-orange">Parent Portal</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">Welcome, {student.parent_name || "Parent"}</div>
          <h1 className="ck-display text-4xl md:text-5xl font-semibold leading-tight" data-testid="portal-student-name">{student.name}</h1>
          <div className="text-sm text-[var(--ck-muted)] mt-2 flex flex-wrap gap-3">
            <span className="font-mono">{student.code}</span>
            {student.level && <span className="flex items-center gap-1"><GraduationCap size={14}/> {student.level}</span>}
            {student.batch && <span className="flex items-center gap-1"><Calendar size={14}/> {student.batch}</span>}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Attendance" value={`${attendance.percentage}%`} hint={`${attendance.counts.P + attendance.counts.LT} of ${attendance.counts.P + attendance.counts.A + attendance.counts.L + attendance.counts.LT} sessions`} />
          <StatCard label="Outstanding" value={fmtINR(invoices.reduce((a,b)=>a + (b.balance||0), 0))} hint={`${invoices.filter(i=>i.status!=='paid').length} pending`} accent />
          <StatCard label="Receipts" value={receipts.length} hint="payments received" />
          <StatCard
            label="Subscription"
            value={student.subscription_end ? new Date(student.subscription_end).toLocaleDateString([], { day: "numeric", month: "short" }) : "—"}
            hint={<span className={subPill}>{student.subscription_status || "none"}</span>}
          />
        </div>

        {/* Attendance history */}
        <Section title="Recent attendance" eyebrow="Last 30 sessions">
          <div className="flex flex-wrap gap-1.5" data-testid="portal-attendance-history">
            {attendance.history.length === 0 && <div className="text-sm text-[var(--ck-muted)]">No sessions recorded yet.</div>}
            {attendance.history.map((h, i) => (
              <div key={i} className={`px-2.5 py-1 rounded-md text-[11px] font-mono ${
                h.status === "P" ? "bg-green-50 text-green-700" :
                h.status === "LT" ? "bg-orange-50 text-orange-700" :
                h.status === "A" ? "bg-red-50 text-red-700" :
                h.status === "H" ? "bg-violet-50 text-violet-700" :
                "bg-slate-50 text-slate-600"
              }`}>
                {h.date.slice(5)} · {h.status}
              </div>
            ))}
          </div>
        </Section>

        {/* Invoices */}
        <Section title="Invoices" eyebrow="Bills issued">
          <div data-testid="portal-invoices">
            {invoices.length === 0 && <div className="text-sm text-[var(--ck-muted)]">No invoices yet.</div>}
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3 border-t border-[var(--ck-line)] first:border-0">
                <div>
                  <div className="font-mono text-xs">{inv.invoice_no}</div>
                  <div className="text-xs text-[var(--ck-muted)]">{inv.period} · due {inv.due_date}</div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <div className="font-medium">{fmtINR(inv.amount)}</div>
                    <span className={`ck-pill ${inv.status === 'paid' ? 'ck-pill-green' : inv.status === 'partial' ? 'ck-pill-orange' : 'ck-pill-black'}`}>{inv.status}</span>
                  </div>
                  <a
                    href={`${BACKEND_URL}/api/portal/${token}/invoice/${inv.id}/pdf`}
                    target="_blank" rel="noreferrer"
                    className="att-btn inline-flex items-center gap-1"
                  >
                    <FileText size={12}/> PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Receipts */}
        <Section title="Receipts" eyebrow="Payments received">
          <div data-testid="portal-receipts">
            {receipts.length === 0 && <div className="text-sm text-[var(--ck-muted)]">No receipts yet.</div>}
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3 border-t border-[var(--ck-line)] first:border-0">
                <div>
                  <div className="font-mono text-xs">{r.receipt_no}</div>
                  <div className="text-xs text-[var(--ck-muted)]">{r.created_at?.slice(0,10)} · {r.mode}</div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div className="font-medium text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={12}/> {fmtINR(r.amount)}
                  </div>
                  <a
                    href={`${BACKEND_URL}/api/portal/${token}/receipt/${r.id}/pdf`}
                    target="_blank" rel="noreferrer"
                    className="att-btn inline-flex items-center gap-1"
                  >
                    <FileText size={12}/> PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="text-center text-xs text-[var(--ck-muted)] mt-10">
          This is a private link generated for {student.parent_name || "the parent"}. Do not share it publicly.
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, hint, accent }) {
  return (
    <div className="ck-card-elevated p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ck-muted)] font-semibold">{label}</div>
      <div className={`ck-display text-2xl font-semibold mt-1 ${accent ? "text-[var(--ck-orange)]" : ""}`}>{value}</div>
      <div className="text-xs text-[var(--ck-muted)] mt-1">{hint}</div>
    </div>
  );
}

function Section({ title, eyebrow, children }) {
  return (
    <div className="ck-card-elevated p-5 mb-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--ck-muted)] font-semibold">{eyebrow}</div>
      <div className="ck-display text-xl font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}
