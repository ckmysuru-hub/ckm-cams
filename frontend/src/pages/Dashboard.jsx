import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Users, Wallet, AlertTriangle, Activity, UserPlus, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Link } from "react-router-dom";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function StatCard({ icon: Icon, label, value, accent, hint, testid }) {
  return (
    <div className="ck-card-elevated p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--ck-muted)] font-semibold">{label}</span>
        <Icon size={16} className={accent ? "text-[var(--ck-orange)]" : "text-[var(--ck-muted)]"} />
      </div>
      <div className="ck-display text-3xl font-semibold mt-2">{value}</div>
      {hint && <div className="text-xs text-[var(--ck-muted)] mt-1">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [pending, setPending] = useState([]);

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setS(r.data));
    api.get("/dashboard/pending").then((r) => setPending(r.data));
  }, []);

  const revenueData = s ? Object.entries(s.revenue_by_month).map(([k, v]) => ({ month: k, revenue: v })) : [];
  const modeData = s ? Object.entries(s.payment_by_mode).map(([k, v]) => ({ name: k, value: v })) : [];
  const COLORS = ["#f45b2a", "#0f0f10", "#a78bfa", "#10b981", "#f59e0b"];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Today at the Klub"
        subtitle="A snapshot of students, dues, and revenue across Chess Klub Mysuru."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard testid="stat-active-students" icon={Users} label="Active Students" value={s?.active_students ?? "—"} hint={`${s?.total_students ?? 0} total enrolled`} />
        <StatCard testid="stat-revenue" icon={TrendingUp} label="This Month Revenue" value={fmtINR(s?.this_month_revenue)} accent hint="Collected so far" />
        <StatCard testid="stat-pending" icon={Wallet} label="Pending Dues" value={fmtINR(s?.pending_amount)} hint="across all invoices" />
        <StatCard testid="stat-overdue" icon={AlertTriangle} label="Overdue" value={fmtINR(s?.overdue_amount)} hint={`${s?.overdue_count ?? 0} invoices`} />
      </div>

      {(s?.expiring_soon || s?.expired_subs) ? (
        <div className="ck-card-elevated p-4 mb-8 flex flex-col md:flex-row md:items-center gap-3 md:gap-6" data-testid="sub-banner"
             style={{ borderLeft: "4px solid var(--ck-orange)" }}>
          <CalendarClock size={20} className="text-[var(--ck-orange)]" />
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Subscriptions</div>
            <div className="text-sm">
              <span className="font-semibold">{s?.expired_subs || 0}</span> expired ·{" "}
              <span className="font-semibold text-[var(--ck-orange)]">{s?.expiring_soon || 0}</span> expiring in next 7 days.
              {" "}Renew or remind these parents before they drop off.
            </div>
          </div>
          <Link to="/students" className="ck-btn-ghost text-xs">Review students →</Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="ck-card-elevated p-5 lg:col-span-2" data-testid="chart-revenue">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--ck-muted)] font-semibold">Revenue Trend</div>
              <div className="ck-display text-xl font-semibold">Last 6 months</div>
            </div>
            <Activity size={16} className="text-[var(--ck-orange)]" />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenueData}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} />
              <Tooltip formatter={(v) => fmtINR(v)} />
              <Bar dataKey="revenue" fill="#f45b2a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="ck-card-elevated p-5" data-testid="chart-modes">
          <div className="text-xs uppercase tracking-wider text-[var(--ck-muted)] font-semibold">Payment Modes</div>
          <div className="ck-display text-xl font-semibold mb-4">Split</div>
          {modeData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={modeData} dataKey="value" nameKey="name" outerRadius={70} innerRadius={42}>
                  {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtINR(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-[var(--ck-muted)] py-10 text-center">No payments yet.</div>
          )}
        </div>
      </div>

      <div className="ck-card-elevated p-5" data-testid="pending-table">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--ck-muted)] font-semibold">Action needed</div>
            <div className="ck-display text-xl font-semibold">Pending invoices</div>
          </div>
          <Link to="/billing" className="text-xs font-semibold text-[var(--ck-orange)] hover:underline">View all →</Link>
        </div>
        <table className="w-full ck-table text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-3">Invoice</th>
              <th>Student</th>
              <th>Period</th>
              <th className="text-right">Balance</th>
              <th>Due</th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {pending.slice(0, 8).map((inv) => (
              <tr key={inv.id}>
                <td className="py-3 font-mono text-xs">{inv.invoice_no}</td>
                <td>{inv.student_name}</td>
                <td className="text-[var(--ck-muted)]">{inv.period}</td>
                <td className="text-right font-medium">{fmtINR(inv.balance)}</td>
                <td className="text-[var(--ck-muted)]">{inv.due_date}</td>
                <td className="text-right">
                  {inv.days_overdue > 0 ? (
                    <span className="ck-pill ck-pill-red">{inv.days_overdue}d overdue</span>
                  ) : (
                    <span className="ck-pill ck-pill-orange">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {!pending.length && (
              <tr><td colSpan="6" className="text-center text-[var(--ck-muted)] py-8">Nothing pending. Well done.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
