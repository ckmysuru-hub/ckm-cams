import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiError, LOGO_URL } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@chessklub.in");
  const [password, setPassword] = useState("Admin@123");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)]">Password</Label>
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
      </div>
    </div>
  );
}
