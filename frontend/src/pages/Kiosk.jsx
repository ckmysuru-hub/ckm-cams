import { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Logo } from "@/components/Brand";
import { LogIn, LogOut, Loader2, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

const fmtTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

export default function Kiosk() {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("in"); // in | out
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [recent, setRecent] = useState([]);
  const [now, setNow] = useState(new Date());
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Recent list is auth-only; safely ignore if anonymous
  useEffect(() => {
    let ignore = false;
    const tick = () => api.get("/kiosk/recent").then((r) => !ignore && setRecent(r.data)).catch(() => {});
    tick();
    const t = setInterval(tick, 10000);
    return () => { ignore = true; clearInterval(t); };
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!code.trim()) return;
    setBusy(true); setFeedback(null);
    try {
      const path = mode === "in" ? "/kiosk/checkin" : "/kiosk/checkout";
      const { data } = await api.post(path, { code: code.trim() });
      setFeedback({ ok: true, ...data, mode });
      setCode("");
      setTimeout(() => setFeedback(null), 5000);
      api.get("/kiosk/recent").then((r) => setRecent(r.data)).catch(() => {});
    } catch (ex) {
      setFeedback({ ok: false, error: formatApiError(ex.response?.data?.detail) || "Could not process" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const pad = (k) => {
    if (k === "back") setCode((c) => c.slice(0, -1));
    else if (k === "clear") setCode("");
    else setCode((c) => (c + k).toUpperCase());
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="kiosk-page" style={{ background: "var(--ck-cream)" }}>
      <header className="px-8 py-5 border-b border-[var(--ck-line)] bg-white flex items-center justify-between">
        <Logo />
        <div className="text-right">
          <div className="ck-display text-2xl font-semibold leading-none">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-xs text-[var(--ck-muted)] mt-1">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center justify-center p-8 lg:p-16">
          <div className="text-[11px] uppercase tracking-[0.3em] font-semibold text-[var(--ck-orange)] mb-2">Self check-in</div>
          <h1 className="ck-display text-5xl lg:text-6xl font-semibold text-center mb-8 max-w-2xl leading-[1.05]">
            Welcome to the board.
          </h1>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("in")}
              data-testid="kiosk-mode-in"
              className={`px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 transition-all ${
                mode === "in" ? "bg-[var(--ck-black)] text-white" : "bg-white border border-[var(--ck-line)] text-[var(--ck-muted)]"
              }`}
            >
              <LogIn size={16} /> Check In
            </button>
            <button
              onClick={() => setMode("out")}
              data-testid="kiosk-mode-out"
              className={`px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 transition-all ${
                mode === "out" ? "bg-[var(--ck-orange)] text-white" : "bg-white border border-[var(--ck-line)] text-[var(--ck-muted)]"
              }`}
            >
              <LogOut size={16} /> Check Out
            </button>
          </div>

          <form onSubmit={submit} className="w-full max-w-md">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)] mb-2 block text-center">
              Enter your student code
            </label>
            <input
              ref={inputRef}
              data-testid="kiosk-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CKM-XXXXX"
              className="w-full px-6 py-5 text-2xl text-center font-mono tracking-wider rounded-2xl border-2 border-[var(--ck-line)] bg-white focus:outline-none focus:border-[var(--ck-black)]"
              autoComplete="off"
            />

            <div className="grid grid-cols-3 gap-2 mt-4">
              {["1","2","3","4","5","6","7","8","9"].map((k)=>(
                <button key={k} type="button" onClick={()=>pad(k)} className="py-4 text-xl font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)] active:scale-[.97] transition">
                  {k}
                </button>
              ))}
              <button type="button" onClick={()=>pad("clear")} className="py-4 text-sm font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-red-400 hover:text-red-600">
                Clear
              </button>
              <button type="button" onClick={()=>pad("0")} className="py-4 text-xl font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)]">0</button>
              <button type="button" onClick={()=>pad("back")} className="py-4 text-sm font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)]">
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || !code.trim()}
              data-testid="kiosk-submit"
              className="mt-5 w-full py-4 rounded-2xl text-base font-semibold bg-[var(--ck-black)] text-white hover:bg-[var(--ck-orange)] disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : (mode === "in" ? <LogIn size={18} /> : <LogOut size={18} />)}
              {busy ? "Processing…" : (mode === "in" ? "Check In" : "Check Out")}
            </button>
          </form>

          {feedback && (
            <div
              data-testid="kiosk-feedback"
              className={`mt-8 w-full max-w-md p-6 rounded-2xl text-center ${
                feedback.ok ? "bg-white border-2 border-green-200" : "bg-red-50 border-2 border-red-200"
              }`}
            >
              {feedback.ok ? (
                <>
                  <CheckCircle2 size={36} className="text-green-600 mx-auto mb-2" />
                  <div className="ck-display text-2xl font-semibold">{feedback.student_name}</div>
                  <div className="text-sm text-[var(--ck-muted)] mt-1">
                    {feedback.status === "checked_in" && `Checked in at ${fmtTime(feedback.check_in)}`}
                    {feedback.status === "checked_out" && `Checked out · ${feedback.duration_minutes} min spent`}
                    {feedback.status === "already_in" && `Already checked in at ${fmtTime(feedback.check_in)}`}
                    {feedback.status === "already_done" && `Already done for today`}
                    {feedback.status === "already_out" && `Already checked out`}
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={36} className="text-red-600 mx-auto mb-2" />
                  <div className="text-base font-semibold">{feedback.error}</div>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="bg-white border-l border-[var(--ck-line)] p-6 overflow-y-auto" data-testid="kiosk-recent">
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-1">Today on the board</div>
          <div className="ck-display text-xl font-semibold mb-4">{recent.length} check-in{recent.length === 1 ? "" : "s"}</div>
          <div className="space-y-2">
            {recent.map((c)=>(
              <div key={c.id} className="ck-card p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.student_name}</div>
                  <div className="text-[10px] font-mono text-[var(--ck-muted)]">{c.student_code}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs flex items-center gap-1 text-[var(--ck-muted)]"><Clock size={11}/> {fmtTime(c.check_in)}</div>
                  {c.check_out && <div className="text-[10px] text-green-700">Out · {fmtTime(c.check_out)}</div>}
                </div>
              </div>
            ))}
            {!recent.length && <div className="text-xs text-[var(--ck-muted)] py-8 text-center">No check-ins yet today.</div>}
          </div>
        </aside>
      </main>
    </div>
  );
}
