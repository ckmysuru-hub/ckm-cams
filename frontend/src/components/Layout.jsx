import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Brand";
import { isDirector, formatRoles } from "@/lib/roles";
import {
  LayoutDashboard, Users, Calendar, ClipboardCheck, GraduationCap,
  ReceiptText, Settings, LogOut, FileText, ScanLine, Inbox, BarChart3, PartyPopper, Trophy,
  Bell, Menu, X, PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/students", label: "Students", icon: Users, testid: "nav-students" },
  { to: "/registrations", label: "Registrations", icon: Inbox, testid: "nav-registrations" },
  { to: "/batches", label: "Batches", icon: Calendar, testid: "nav-batches" },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, testid: "nav-attendance" },
  { to: "/levels", label: "Levels & Fees", icon: GraduationCap, testid: "nav-levels" },
  { to: "/billing", label: "Billing", icon: ReceiptText, testid: "nav-billing" },
  { to: "/receipts", label: "Receipts", icon: FileText, testid: "nav-receipts" },
  { to: "/events", label: "Events", icon: PartyPopper, testid: "nav-events", directorOnly: true },
  { to: "/tournaments", label: "Tournaments", icon: Trophy, testid: "nav-tournaments", directorOnly: true },
  { to: "/notifications", label: "Notifications", icon: Bell, testid: "nav-notifications", directorOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, testid: "nav-reports", directorOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const visibleNav = NAV.filter((item) => !item.directorOnly || isDirector(user));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("ck-sidebar-collapsed") === "1"; }
    catch { return false; }
  });

  useEffect(() => {
    try { window.localStorage.setItem("ck-sidebar-collapsed", collapsed ? "1" : "0"); }
    catch { /* ignore storage failures */ }
  }, [collapsed]);

  const onLogout = async () => {
    await logout();
    setMobileOpen(false);
    nav("/login");
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-5 py-2.5 ${collapsed ? "md:justify-center md:px-0" : ""} ${isActive ? "active" : ""}`;

  return (
    <div className="min-h-screen flex" data-testid="app-shell">
      {mobileOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-black/45"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`ck-sidebar fixed md:sticky top-0 left-0 z-50 h-screen flex flex-col transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "w-[260px] md:w-[76px]" : "w-[260px] md:w-[240px]"}`}
        data-testid="sidebar"
      >
        <div className={`px-5 py-6 border-b border-white/5 flex items-center ${collapsed ? "md:justify-center" : "justify-between"} gap-3`}>
          <Logo light withText={!collapsed || mobileOpen} />
          <button
            type="button"
            className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-md border border-white/10 text-white/80"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto py-4 text-sm">
          {visibleNav.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              onClick={() => setMobileOpen(false)}
              className={navLinkClass}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} />
              <span className={collapsed ? "md:hidden" : ""}>{label}</span>
            </NavLink>
          ))}
          <a
            href="/kiosk"
            target="_blank"
            rel="noreferrer"
            data-testid="nav-kiosk"
            className={`flex items-center gap-3 px-5 py-2.5 text-[var(--ck-orange)] hover:text-white border-l-[3px] border-transparent hover:bg-[rgba(244,91,42,0.08)] mt-2 ${collapsed ? "md:justify-center md:px-0" : ""}`}
            title={collapsed ? "Open Kiosk" : undefined}
          >
            <ScanLine size={16} />
            <span className={collapsed ? "md:hidden" : ""}>Open Kiosk ↗</span>
          </a>
        </nav>
        <div className={`shrink-0 px-5 py-4 border-t border-white/5 ${collapsed ? "md:px-0 md:flex md:flex-col md:items-center" : ""}`}>
          {(!collapsed || mobileOpen) && (
            <>
              <div className="text-xs text-white/50 mb-2">Signed in as</div>
              <div className="text-sm text-white font-medium" data-testid="current-user-name">{user?.name}</div>
              <div className="text-xs text-white/50 capitalize mb-3">{formatRoles(user)}</div>
            </>
          )}
          <button
            type="button"
            data-testid="sidebar-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex items-center gap-2 text-xs text-white/70 hover:text-[var(--ck-orange)] mb-3"
            title={collapsed ? "Expand menu" : "Collapse menu"}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            <span className={collapsed ? "hidden" : ""}>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className={`flex items-center gap-2 text-xs text-white/70 hover:text-[var(--ck-orange)] ${collapsed ? "md:h-9 md:w-9 md:justify-center" : ""}`}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut size={14} /> <span className={collapsed ? "md:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>

      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--ck-line)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[var(--ck-line)] text-[var(--ck-muted)]"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              data-testid="mobile-menu-btn"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <Logo withText={false} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right min-w-0">
              <div className="text-xs font-semibold truncate max-w-[150px]" data-testid="current-user-name-mobile">{user?.name}</div>
              <div className="text-[10px] text-[var(--ck-muted)] capitalize truncate">{formatRoles(user)}</div>
            </div>
            <button
              data-testid="logout-btn-mobile"
              onClick={onLogout}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-[var(--ck-line)] text-[var(--ck-muted)]"
              aria-label="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 ck-knight-bg min-h-screen">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-24 md:pt-8 pb-8">
          <Outlet />
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
