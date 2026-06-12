import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["director","ops_manager","coach","front_desk","finance"];

export default function Settings() {
  const { user } = useAuth();
  const [academy, setAcademy] = useState(null);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"front_desk" });

  useEffect(() => {
    api.get("/settings/academy").then((r)=>setAcademy(r.data));
    if (user?.role === "director") api.get("/users").then((r)=>setUsers(r.data));
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users", form);
      toast.success("User added");
      setOpen(false); setForm({ name:"", email:"", password:"", role:"front_desk" });
      api.get("/users").then((r)=>setUsers(r.data));
    } catch (ex) { toast.error(formatApiError(ex.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete user?")) return;
    await api.delete(`/users/${id}`);
    api.get("/users").then((r)=>setUsers(r.data));
  };

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" subtitle="Academy details, integrations and team access." />

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="ck-card-elevated p-5" data-testid="academy-card">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-2">Academy</div>
          <div className="ck-display text-2xl font-semibold">{academy?.name}</div>
          <div className="text-sm text-[var(--ck-muted)] mt-1">{academy?.address}</div>
          <div className="text-sm mt-3 space-y-1">
            <div><span className="text-[var(--ck-muted)]">Phone:</span> {academy?.phone}</div>
            <div><span className="text-[var(--ck-muted)]">Email:</span> {academy?.email}</div>
          </div>
        </div>
        <div className="ck-card-elevated p-5" data-testid="integrations-card">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)] mb-2">Integrations</div>
          <IntegrationRow label="WhatsApp (Twilio)" enabled={academy?.integrations?.whatsapp_enabled} />
          <IntegrationRow label="Email (SendGrid)" enabled={academy?.integrations?.email_enabled} />
          <div className="text-xs text-[var(--ck-muted)] mt-4 leading-relaxed">
            When integrations are disabled, the app runs in <b>log-only mode</b> — all reminders are recorded in backend logs but not actually sent. Add your keys in backend <code>.env</code> to enable real sending.
          </div>
        </div>
      </div>

      {user?.role === "director" && (
        <div className="ck-card-elevated p-2">
          <div className="flex items-center justify-between p-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Team</div>
              <div className="ck-display text-xl font-semibold">User accounts</div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="ck-btn-primary flex items-center gap-2" data-testid="add-user-btn"><UserPlus size={14}/> Add user</button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add team member</DialogTitle></DialogHeader>
                <form onSubmit={submit} className="space-y-3" data-testid="user-form">
                  <div><Label className="text-xs">Name</Label><Input data-testid="uf-name" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required /></div>
                  <div><Label className="text-xs">Email</Label><Input data-testid="uf-email" type="email" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} required /></div>
                  <div><Label className="text-xs">Password</Label><Input data-testid="uf-password" type="password" value={form.password} onChange={(e)=>setForm({...form, password:e.target.value})} required /></div>
                  <div>
                    <Label className="text-xs">Role</Label>
                    <Select value={form.role} onValueChange={(v)=>setForm({...form, role:v})}>
                      <SelectTrigger data-testid="uf-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r)=>(<SelectItem key={r} value={r}>{r.replace("_"," ")}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="ck-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
                    <button type="submit" className="ck-btn-primary" data-testid="uf-submit">Add</button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <table className="w-full ck-table text-sm">
            <thead><tr className="text-left"><th className="px-4 py-3">Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map((u)=>(
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="ck-pill ck-pill-orange">{u.role?.replace("_"," ")}</span></td>
                  <td className="text-right pr-4">
                    {u.email !== "admin@chessklub.in" && (
                      <button onClick={()=>del(u.id)} className="text-[var(--ck-muted)] hover:text-red-600"><Trash2 size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function IntegrationRow({ label, enabled }) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-[var(--ck-line)] first:border-0">
      <div className="text-sm">{label}</div>
      <div className={`flex items-center gap-1 text-xs font-semibold ${enabled ? "text-green-700" : "text-[var(--ck-muted)]"}`}>
        {enabled ? <><CheckCircle2 size={14}/> Live</> : <><XCircle size={14}/> Log only</>}
      </div>
    </div>
  );
}
