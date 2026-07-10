import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError, LOGO_URL } from "@/lib/api";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function Login() {
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "forgot-sent"
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/", { replace: true });
    } catch (ex) {
      setErr(formatApiError(ex.response?.data?.detail) || ex.message);
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
    } catch {
      // Backend always responds the same way regardless of outcome; ignore.
    } finally {
      setForgotLoading(false);
      setMode("forgot-sent");
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2" data-testid="login-page">
      {/* Left art panel */}
      <div className="ck-auth-art ck-grain relative hidden md:flex flex-col justify-between p-12 text-white overflow-hidden">
        <div className="flex items-center gap-3">
          <Logo light />
        </div>
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[var(--ck-orange)] mb-4">
            Coaching Center Management
          </div>
          <h2 className="ck-display text-5xl font-semibold leading-[1.05] mb-5">
            Every move,<br />
            every student,<br />
            <span style={{ color: "var(--ck-orange)" }}>in one board.</span>
          </h2>
          <p className="text-white/60 max-w-md text-sm leading-relaxed">
            Manage enrollments, batches, attendance, fees and receipts for Chess Klub Mysuru — built for the way coaches actually run their academy.
          </p>
        </div>
        <img
          src={LOGO_URL}
          alt=""
          className="absolute -right-24 -bottom-16 w-[460px] opacity-[0.10] pointer-events-none"
        />
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8 md:p-12 bg-[var(--ck-cream)]">
        {mode === "login" && (
          <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
            <div className="md:hidden mb-8"><Logo /></div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">
              Sign in
            </div>
            <h1 className="ck-display text-4xl font-semibold mb-2">Welcome back.</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">
              Use your academy credentials to continue.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Email</Label>
                <Input
                  id="email"
                  data-testid="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Password</Label>
                  <button
                    type="button"
                    data-testid="forgot-password-link"
                    onClick={() => { setErr(""); setForgotEmail(email); setMode("forgot"); }}
                    className="text-xs text-[var(--ck-orange)] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-11"
                  required
                />
              </div>
            </div>

            {err && (
              <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2"
                   data-testid="login-error">{err}</div>
            )}

            <button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="ck-btn-primary w-full mt-6 h-11 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Enter the board
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={submitForgot} className="w-full max-w-sm" data-testid="forgot-password-form">
            <div className="md:hidden mb-8"><Logo /></div>
            <button type="button" onClick={() => setMode("login")}
                    className="text-xs text-[var(--ck-muted)] hover:text-[var(--ck-black)] flex items-center gap-1 mb-6">
              <ArrowLeft size={14} /> Back to sign in
            </button>
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">
              Reset password
            </div>
            <h1 className="ck-display text-3xl font-semibold mb-2">Forgot your password?</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">
              Enter your account email and we'll send you a link to set a new password.
            </p>
            <div>
              <Label htmlFor="forgot-email" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Email</Label>
              <Input
                id="forgot-email"
                data-testid="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="mt-2 h-11"
                required
              />
            </div>
            <button
              type="submit"
              data-testid="forgot-submit"
              disabled={forgotLoading}
              className="ck-btn-primary w-full mt-6 h-11 flex items-center justify-center gap-2"
            >
              {forgotLoading && <Loader2 size={16} className="animate-spin" />}
              Send reset link
            </button>
          </form>
        )}

        {mode === "forgot-sent" && (
          <div className="w-full max-w-sm text-center" data-testid="forgot-password-sent">
            <div className="md:hidden mb-8 flex justify-center"><Logo /></div>
            <MailCheck size={40} className="text-[var(--ck-orange)] mx-auto mb-4" />
            <h1 className="ck-display text-3xl font-semibold mb-2">Check your email</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">
              If an account exists for <b>{forgotEmail}</b>, we've sent a link to reset your password. It's valid for 30 minutes.
            </p>
            <button type="button" onClick={() => setMode("login")} className="ck-btn-ghost w-full h-11 flex items-center justify-center gap-2">
              <ArrowLeft size={14} /> Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
