import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Brand";
import { isDirector, formatRoles } from "@/lib/roles";
import {
  LayoutDashboard, Users, Calendar, ClipboardCheck, GraduationCap,
  ReceiptText, Settings, LogOut, FileText, ScanLine, Inbox, MessageCircle, BarChart3, PartyPopper, Trophy
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/students", label: "Students", icon: Users, testid: "nav-students" },
  { to: "/registrations", label: "Registrations", icon: Inbox, testid: "nav-registrations" },
  { to: "/batches", label: "Batches", icon: Calendar, testid: "nav-batches" },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, testid: "nav-attendance" },
  { to: "/levels", label: "Levels & Fees", icon: GraduationCap, testid: "nav-levels" },
  { to: "/billing", label: "Billing", icon: ReceiptText, testid: "nav-billing" },
  { to: "/receipts", label: "Receipts", icon: FileText, testid: "nav-receipts" },
  { to: "/events", label: "Events", icon: PartyPopper, testid: "nav-events", directorOnly: true },
  { to: "/tournaments", label: "Tournaments", icon: Trophy, testid: "nav-tournaments", directorOnly: true },
  { to: "/whatsapp-messages", label: "WhatsApp", icon: MessageCircle, testid: "nav-whatsapp", directorOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, testid: "nav-reports", directorOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const visibleNav = NAV.filter((item) => !item.directorOnly || isDirector(user));

  return (
    <div className="min-h-screen flex" data-testid="app-shell">
      <aside className="ck-sidebar w-[240px] hidden md:flex flex-col" data-testid="sidebar">
        <div className="px-5 py-6 border-b border-white/5">
          <Logo light />
        </div>
        <nav className="flex-1 py-4 text-sm">
          {visibleNav.map(({ to, label, icon: Icon, end, testid }) => (
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
          <div className="text-xs text-white/50 capitalize mb-3">{formatRoles(user)}</div>
          <button
            data-testid="logout-btn"
            onClick={async () => { await logout(); nav("/login"); }}
            className="flex items-center gap-2 text-xs text-white/70 hover:text-[var(--ck-orange)]"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--ck-line)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right min-w-0">
              <div className="text-xs font-semibold truncate max-w-[130px]" data-testid="current-user-name-mobile">{user?.name}</div>
              <div className="text-[10px] text-[var(--ck-muted)] capitalize truncate">{formatRoles(user)}</div>
            </div>
            <button
              data-testid="logout-btn-mobile"
              onClick={async () => { await logout(); nav("/login"); }}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-[var(--ck-line)] text-[var(--ck-muted)]"
              aria-label="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 ck-knight-bg min-h-screen">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-24 md:pt-8 pb-28 md:pb-8">
          <Outlet />
        </div>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--ck-black)] text-white border-t border-white/10" data-testid="mobile-nav">
        <div className="flex overflow-x-auto mobile-nav-scroll px-2 py-2 gap-1">
          {visibleNav.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`${testid}-mobile`}
              className={({ isActive }) =>
                `min-w-[74px] flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] ${isActive ? "bg-[var(--ck-orange)] text-white" : "text-white/70"}`
              }
            >
              <Icon size={16} />
              <span className="leading-none whitespace-nowrap">{label.replace(" & Fees", "")}</span>
            </NavLink>
          ))}
          <a
            href="/kiosk"
            target="_blank"
            rel="noreferrer"
            data-testid="nav-kiosk-mobile"
            className="min-w-[74px] flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] text-white/70"
          >
            <ScanLine size={16} />
            <span className="leading-none whitespace-nowrap">Kiosk</span>
          </a>
        </div>
      </nav>
      <Toaster richColors position="top-right" />
    </div>
  );
}
