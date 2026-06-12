import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = localStorage.getItem("ck_token");
      if (!t) { setUser(false); setReady(true); return; }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        localStorage.removeItem("ck_token");
        setUser(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) localStorage.setItem("ck_token", data.token);
    setUser(data);
    return data;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (_) { /* ignore */ }
    localStorage.removeItem("ck_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
