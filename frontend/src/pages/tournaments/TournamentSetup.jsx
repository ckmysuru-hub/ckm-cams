import React, { useState } from 'react';
import { api, formatApiError as formatError } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';

const steps = ['Basic Info', 'Rounds & Time', 'Categories & Fees', 'Confirm'];

const Label = ({ children }) => (
  <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold block mb-1">{children}</label>
);
const Input = (props) => (
  <input {...props} className={"w-full px-3 py-2 border border-gray-300 rounded-sm focus:outline-none focus:border-[#F57C00] focus:ring-2 focus:ring-orange-100 " + (props.className || '')} />
);

export default function TournamentSetup() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    organising_body: 'CK Mysuru Chess Association',
    venue: '',
    start_date: '',
    end_date: '',
    num_rounds: 7,
    time_control: '90+30',
    chief_arbiter_name: '',
    rating_type: 'FIDE Standard',
    tiebreak_order: ['buchholz', 'sb', 'direct_encounter'],
    bye_type: 'half',
    categories: [{ name: 'Open', fee: 500 }],
    notes: '',
    public_visible: true,
  });

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const setCat = (i, k, v) => setForm(s => ({ ...s, categories: s.categories.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addCat = () => setForm(s => ({ ...s, categories: [...s.categories, { name: '', fee: 0 }] }));
  const delCat = (i) => setForm(s => ({ ...s, categories: s.categories.filter((_, idx) => idx !== i) }));

  const next = () => setStep(s => Math.min(steps.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const canNext = () => {
    if (step === 0) return form.name && form.start_date && form.end_date;
    if (step === 1) return form.num_rounds > 0 && form.time_control;
    if (step === 2) return form.categories.length > 0 && form.categories.every(c => c.name.trim());
    return true;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const cats = form.categories.filter(c => c.name.trim());
      const payload = {
        ...form,
        sections: cats.map(c => c.name.trim()),
        fee_structure: Object.fromEntries(cats.map(c => [c.name.trim(), +c.fee || 0])),
      };
      delete payload.categories;
      const { data } = await api.post('/tournaments', payload);
      toast.success('Tournament created');
      nav(`/tournaments/${data.id}`);
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="ckm-tournament-scope max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="brand-bar w-10 mb-3" />
      <h1 className="font-serif text-4xl font-bold mb-1">New Tournament</h1>
      <p className="text-sm text-gray-500 mb-8">Four steps to launch your event.</p>

      <div className="flex items-center justify-between mb-8" data-testid="wizard-steps">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex items-center">
            <div className="wiz-step">
              <div className={`wiz-circle ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs font-semibold uppercase tracking-wide hidden sm:inline ${i === step ? 'text-[#E65100]' : 'text-gray-400'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-sm p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div><Label>Tournament Name *</Label><Input data-testid="wiz-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={120} /></div>
            <div><Label>Organising Body</Label><Input value={form.organising_body} onChange={e => set('organising_body', e.target.value)} /></div>
            <div><Label>Venue</Label><Input data-testid="wiz-venue" value={form.venue} onChange={e => set('venue', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4 ckm-form-grid">
              <div><Label>Start Date *</Label><Input data-testid="wiz-start" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
              <div><Label>End Date *</Label><Input data-testid="wiz-end" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
            </div>
            <div><Label>Chief Arbiter Name</Label><Input value={form.chief_arbiter_name} onChange={e => set('chief_arbiter_name', e.target.value)} /></div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 ckm-form-grid">
              <div><Label>Number of Rounds</Label><Input data-testid="wiz-rounds" type="number" min={1} max={20} value={form.num_rounds} onChange={e => set('num_rounds', +e.target.value)} /></div>
              <div><Label>Time Control</Label><Input data-testid="wiz-tc" value={form.time_control} onChange={e => set('time_control', e.target.value)} placeholder="90+30" /></div>
            </div>
            <div>
              <Label>Rating Type</Label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-sm" value={form.rating_type} onChange={e => set('rating_type', e.target.value)}>
                {['FIDE Standard', 'FIDE Rapid', 'FIDE Blitz', 'National', 'Unrated'].map(x => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <Label>Bye Type (default)</Label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-sm" value={form.bye_type} onChange={e => set('bye_type', e.target.value)}>
                <option value="half">Half-point (0.5)</option>
                <option value="full">Full-point (1.0)</option>
                <option value="zero">Zero-point (0)</option>
              </select>
            </div>
            <div className="text-xs text-gray-500">Tie-Break Order: <span className="font-mono">{form.tiebreak_order.join(' › ')}</span></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Categories &amp; Entry Fees</Label>
              <button type="button" onClick={addCat} data-testid="wiz-add-category"
                className="text-xs border border-[#F57C00] text-[#E65100] px-2 py-1 rounded-sm flex items-center gap-1 hover:bg-orange-50">
                <Plus className="w-3 h-3" /> Add Category
              </button>
            </div>
            <p className="text-xs text-gray-500">Each category has its own entry fee. Common examples: Open, Women, Under-18, Under-12, Veterans (50+).</p>
            <div className="space-y-2">
              {form.categories.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <Input data-testid={`wiz-cat-name-${i}`} placeholder="Category name (e.g., Open, U-12, Women)" value={c.name} onChange={e => setCat(i, 'name', e.target.value)} />
                  </div>
                  <div className="col-span-5">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <Input data-testid={`wiz-cat-fee-${i}`} type="number" min={0} placeholder="Fee" value={c.fee} onChange={e => setCat(i, 'fee', e.target.value)} className="pl-7" />
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {form.categories.length > 1 && (
                      <button type="button" onClick={() => delCat(i)} data-testid={`wiz-cat-del-${i}`}
                        className="p-1.5 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Set fee to 0 for free-entry categories.</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div className="font-serif text-2xl mb-3">Confirm</div>
            <div className="grid grid-cols-2 gap-3 ckm-form-grid">
              <div><span className="text-gray-500 text-xs uppercase">Name</span><div className="font-semibold">{form.name}</div></div>
              <div><span className="text-gray-500 text-xs uppercase">Venue</span><div className="font-semibold">{form.venue || '—'}</div></div>
              <div><span className="text-gray-500 text-xs uppercase">Dates</span><div className="font-semibold">{form.start_date} → {form.end_date}</div></div>
              <div><span className="text-gray-500 text-xs uppercase">Rounds</span><div className="font-semibold">{form.num_rounds} · {form.time_control}</div></div>
              <div className="col-span-2"><span className="text-gray-500 text-xs uppercase">Categories</span>
                <div className="mt-1 space-y-1">
                  {form.categories.map((c, i) => (
                    <div key={i} className="flex justify-between border-b border-gray-100 py-1">
                      <span className="font-semibold">{c.name}</span>
                      <span className="font-mono text-[#E65100]">₹ {(+c.fee || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div><span className="text-gray-500 text-xs uppercase">Rating</span><div className="font-semibold">{form.rating_type}</div></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button onClick={back} disabled={step === 0} data-testid="wiz-back"
            className="text-sm flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < steps.length - 1 ? (
            <button onClick={next} disabled={!canNext()} data-testid="wiz-next"
              className="bg-black text-white px-4 py-2 rounded-sm font-semibold flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={saving} data-testid="wiz-create"
              className="bg-[#F57C00] hover:bg-[#FF9800] text-white px-5 py-2 rounded-sm font-semibold">
              {saving ? 'Creating…' : 'Create Tournament'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
