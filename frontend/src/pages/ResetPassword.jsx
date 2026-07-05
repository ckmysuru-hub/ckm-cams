import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Logo } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError, LOGO_URL } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
    } catch (ex) {
      setErr(formatApiError(ex.response?.data?.detail) || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2" data-testid="reset-password-page">
      <div className="ck-auth-art ck-grain relative hidden md:flex flex-col justify-between p-12 text-white overflow-hidden">
        <div className="flex items-center gap-3"><Logo light /></div>
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[var(--ck-orange)] mb-4">
            Coaching Center Management
          </div>
          <h2 className="ck-display text-5xl font-semibold leading-[1.05] mb-5">
            Choose a new<br />
            <span style={{ color: "var(--ck-orange)" }}>password.</span>
          </h2>
        </div>
        <img src={LOGO_URL} alt="" className="absolute -right-24 -bottom-16 w-[460px] opacity-[0.10] pointer-events-none" />
      </div>

      <div className="flex items-center justify-center p-8 md:p-12 bg-[var(--ck-cream)]">
        {!token ? (
          <div className="w-full max-w-sm text-center">
            <XCircle size={40} className="text-[var(--ck-muted)] mx-auto mb-4" />
            <h1 className="ck-display text-3xl font-semibold mb-2">Invalid link</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">This reset link is missing its token. Please request a new one from the login page.</p>
            <Link to="/login" className="ck-btn-primary inline-flex h-11 items-center justify-center px-6">Back to sign in</Link>
          </div>
        ) : done ? (
          <div className="w-full max-w-sm text-center" data-testid="reset-password-done">
            <CheckCircle2 size={40} className="text-green-600 mx-auto mb-4" />
            <h1 className="ck-display text-3xl font-semibold mb-2">Password updated</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">You can now sign in with your new password.</p>
            <button onClick={() => nav("/login", { replace: true })} className="ck-btn-primary w-full h-11">Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-sm" data-testid="reset-password-form">
            <div className="md:hidden mb-8"><Logo /></div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">
              Reset password
            </div>
            <h1 className="ck-display text-4xl font-semibold mb-2">Set a new password.</h1>
            <p className="text-sm text-[var(--ck-muted)] mb-8">This link can only be used once and expires in 30 minutes.</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">New password</Label>
                <Input id="new-password" data-testid="reset-password-input" type="password" value={password}
                       onChange={(e) => setPassword(e.target.value)} className="mt-2 h-11" required minLength={8} />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Confirm password</Label>
                <Input id="confirm-password" data-testid="reset-password-confirm" type="password" value={confirm}
                       onChange={(e) => setConfirm(e.target.value)} className="mt-2 h-11" required minLength={8} />
              </div>
            </div>

            {err && (
              <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2" data-testid="reset-password-error">{err}</div>
            )}

            <button type="submit" data-testid="reset-password-submit" disabled={loading}
                    className="ck-btn-primary w-full mt-6 h-11 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
