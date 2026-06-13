import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Brand";
import {
  LayoutDashboard, Users, Calendar, ClipboardCheck, GraduationCap,
  ReceiptText, Settings, LogOut, FileText, ScanLine
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/students", label: "Students", icon: Users, testid: "nav-students" },
  { to: "/batches", label: "Batches", icon: Calendar, testid: "nav-batches" },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, testid: "nav-attendance" },
  { to: "/levels", label: "Levels & Fees", icon: GraduationCap, testid: "nav-levels" },
  { to: "/billing", label: "Billing", icon: ReceiptText, testid: "nav-billing" },
  { to: "/receipts", label: "Receipts", icon: FileText, testid: "nav-receipts" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex" data-testid="app-shell">
      <aside className="ck-sidebar w-[240px] hidden md:flex flex-col" data-testid="sidebar">
        <div className="px-5 py-6 border-b border-white/5">
          <Logo light />
        </div>
        <nav className="flex-1 py-4 text-sm">
          {NAV.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 ${isActive ? "active" : ""}`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
          <a
            href="/kiosk"
            target="_blank"
            rel="noreferrer"
            data-testid="nav-kiosk"
            className="flex items-center gap-3 px-5 py-2.5 text-[var(--ck-orange)] hover:text-white border-l-[3px] border-transparent hover:bg-[rgba(244,91,42,0.08)] mt-2"
          >
            <ScanLine size={16} />
            <span>Open Kiosk ↗</span>
          </a>
        </nav>
        <div className="px-5 py-4 border-t border-white/5">
          <div className="text-xs text-white/50 mb-2">Signed in as</div>
          <div className="text-sm text-white font-medium" data-testid="current-user-name">{user?.name}</div>
          <div className="text-xs text-white/50 capitalize mb-3">{user?.role?.replace("_", " ")}</div>
          <button
            data-testid="logout-btn"
            onClick={async () => { await logout(); nav("/login"); }}
            className="flex items-center gap-2 text-xs text-white/70 hover:text-[var(--ck-orange)]"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 ck-knight-bg min-h-screen">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-8">
          <Outlet />
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
