import { api, formatApiError, BACKEND_URL } from "@/lib/api";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Upload, X, GripVertical } from "lucide-react";
import { toast } from "sonner";

export const emptyEventField = () => ({ id: "", label: "", type: "text", required: false, options: [] });
export const emptyEvent = {
  title: "", description: "", poster_url: "", event_datetime: "", venue: "",
  fee: 0, registration_open: true, status: "published", custom_fields: [],
};
export const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export default function EventForm({ form, setForm, includeVisibility = true }) {
  const [posterUploading, setPosterUploading] = useState(false);

  const uploadPoster = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPosterUploading(true);
    try {
      const body = new FormData();
      body.append("poster", file);
      const { data } = await api.post("/events/poster", body, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, poster_url: data.poster_url }));
    } catch (ex) {
      toast.error(formatApiError(ex.response?.data?.detail) || "Could not upload poster");
    } finally { setPosterUploading(false); }
  };

  const addField = () => setForm((f) => ({ ...f, custom_fields: [...f.custom_fields, emptyEventField()] }));
  const updateField = (idx, patch) => setForm((f) => ({
    ...f, custom_fields: f.custom_fields.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)),
  }));
  const removeField = (idx) => setForm((f) => ({ ...f, custom_fields: f.custom_fields.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Title</Label>
        <Input data-testid="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea data-testid="ev-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Poster</Label>
        <label className="h-10 px-3 rounded-md border border-[var(--ck-line)] bg-white flex items-center justify-center gap-2 text-sm cursor-pointer hover:border-[var(--ck-orange)] w-fit">
          {posterUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {form.poster_url ? "Replace poster" : posterUploading ? "Uploading…" : "Upload poster image"}
          <input type="file" accept="image/*" hidden onChange={uploadPoster} disabled={posterUploading} data-testid="ev-poster" />
        </label>
        {form.poster_url && <img src={`${BACKEND_URL}${form.poster_url}`} alt="" className="mt-2 h-24 rounded-md border border-[var(--ck-line)] object-cover" />}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Date & time</Label>
          <Input data-testid="ev-datetime" type="datetime-local" value={form.event_datetime} onChange={(e) => setForm({ ...form, event_datetime: e.target.value })} required />
        </div>
        <div>
          <Label className="text-xs">Venue</Label>
          <Input data-testid="ev-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Optional" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Ticket fee (₹)</Label>
          <Input data-testid="ev-fee" type="number" min="0" step="1" value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
          <p className="text-[11px] text-[var(--ck-muted)] mt-1">0 = free, no payment collected.</p>
        </div>
        {includeVisibility && (
          <div>
            <Label className="text-xs">Visibility</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="ev-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (hidden)</SelectItem>
                <SelectItem value="published">Published (public)</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between rounded-md border border-[var(--ck-line)] px-3 py-2.5">
        <div>
          <div className="text-sm font-medium">Registration open</div>
          <div className="text-xs text-[var(--ck-muted)]">Turn off to stop accepting new registrations.</div>
        </div>
        <Switch checked={form.registration_open} onCheckedChange={(v) => setForm({ ...form, registration_open: v })} data-testid="ev-reg-open" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Custom registration fields</Label>
          <button type="button" onClick={addField} className="text-xs text-[var(--ck-orange)] hover:underline flex items-center gap-1" data-testid="ev-add-field">
            <Plus size={12} /> Add field
          </button>
        </div>
        <p className="text-[11px] text-[var(--ck-muted)] mb-2">Name, email and phone are always collected. Add anything else you need here (t-shirt size, FIDE ID, dietary preference…).</p>
        <div className="space-y-2">
          {form.custom_fields.map((f, idx) => (
            <div key={idx} className="border border-[var(--ck-line)] rounded-md p-3 space-y-2" data-testid={`ev-field-${idx}`}>
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-[var(--ck-muted)] shrink-0" />
                <Input placeholder="Field label (e.g. T-shirt size)" value={f.label}
                       onChange={(e) => updateField(idx, { label: e.target.value })} className="flex-1" />
                <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v })}>
                  <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="textarea">Long text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="select">Dropdown</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => removeField(idx)} className="text-[var(--ck-muted)] hover:text-red-600 shrink-0"><X size={16} /></button>
              </div>
              <div className="flex items-center gap-3 pl-6">
                <label className="flex items-center gap-1.5 text-xs text-[var(--ck-muted)]">
                  <input type="checkbox" checked={f.required} onChange={(e) => updateField(idx, { required: e.target.checked })} /> Required
                </label>
                {f.type === "select" && (
                  <Input placeholder="Options, comma separated (S, M, L, XL)" value={(f.options || []).join(", ")}
                         onChange={(e) => updateField(idx, { options: e.target.value.split(",").map((o) => o.trim()) })}
                         className="flex-1 h-8 text-xs" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
