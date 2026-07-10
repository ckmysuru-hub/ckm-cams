import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentDetail from "@/pages/StudentDetail";
import Batches from "@/pages/Batches";
import Attendance from "@/pages/Attendance";
import Levels from "@/pages/Levels";
import Billing from "@/pages/Billing";
import Receipts from "@/pages/Receipts";
import Settings from "@/pages/Settings";
import Kiosk from "@/pages/Kiosk";
import ParentPortal from "@/pages/ParentPortal";
import Register from "@/pages/Register";
import Registrations from "@/pages/Registrations";
import WhatsAppMessages from "@/pages/WhatsAppMessages";
import Reports from "@/pages/Reports";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import PublicEvent from "@/pages/PublicEvent";
import TournamentList from "@/pages/tournaments/TournamentList";
import TournamentSetup from "@/pages/tournaments/TournamentSetup";
import TournamentDetail from "@/pages/tournaments/TournamentDetail";
import PublicTournament from "@/pages/tournaments/PublicTournament";
import PublicTournamentRegister from "@/pages/tournaments/PublicTournamentRegister";
import "@/styles/tournament.css";
import { isDirector } from "@/lib/roles";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-[var(--ck-muted)]">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function DirectorOnly({ children }) {
  const { user } = useAuth();
  if (!isDirector(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/portal/:token" element={<ParentPortal />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events/:id/rsvp" element={<PublicEvent />} />
          <Route path="/public/tournaments/:id" element={<PublicTournament />} />
          <Route path="/tournaments/:id/register" element={<PublicTournamentRegister />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/levels" element={<Levels />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/registrations" element={<Registrations />} />
            <Route path="/events" element={<DirectorOnly><Events /></DirectorOnly>} />
            <Route path="/events/:id" element={<DirectorOnly><EventDetail /></DirectorOnly>} />
            <Route path="/tournaments" element={<DirectorOnly><TournamentList /></DirectorOnly>} />
            <Route path="/tournaments/new" element={<DirectorOnly><TournamentSetup /></DirectorOnly>} />
            <Route path="/tournaments/:id" element={<DirectorOnly><TournamentDetail /></DirectorOnly>} />
            <Route path="/notifications" element={<DirectorOnly><WhatsAppMessages /></DirectorOnly>} />
            <Route path="/whatsapp-messages" element={<DirectorOnly><WhatsAppMessages /></DirectorOnly>} />
            <Route path="/reports" element={<DirectorOnly><Reports /></DirectorOnly>} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
