import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
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

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-[var(--ck-muted)]">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/portal/:token" element={<ParentPortal />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/levels" element={<Levels />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
