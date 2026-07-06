import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Crown, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RZP_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
function loadRzp() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = RZP_SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function PublicRegister() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', fide_id: '', federation: 'IND', title: '',
    fide_rating: 0, dob: '', gender: '', club: '', email: '', phone: '',
    category: 'Open', section: 'Open',
  });
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  useEffect(() => {
    axios.get(`${API}/public/tournaments/${id}/registration-info`)
      .then(r => {
        setInfo(r.data);
        const cats = Object.keys(r.data.tournament.fee_structure || {});
        if (cats.length) setForm(s => ({ ...s, category: cats[0], section: cats[0] }));
      })
      .catch(() => setInfo(false));
  }, [id]);

  if (info === false) return <Layout><div className="p-10 text-center text-gray-500">Tournament not found.</div></Layout>;
  if (!info) return <Layout><div className="p-10 text-center text-gray-500">Loading…</div></Layout>;

  const t = info.tournament;
  const fee = +(t.fee_structure?.[form.category] || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.email) { toast.error('Name and email are required'); return; }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/public/tournament-registrations`, { ...form, tournament_id: id, fide_rating: +form.fide_rating || 0 });
      if (data.free) {
        setDone({ free: true, registration_id: data.registration_id });
        return;
      }
      if (data.razorpay_not_configured) {
        toast.warning(data.message || 'Online payment unavailable. Contact organiser.');
        setDone({ pending_offline: true, registration_id: data.registration_id, amount: data.amount });
        return;
      }
      const ok = await loadRzp();
      if (!ok) { toast.error('Failed to load payment library'); return; }
      const rzp = new window.Razorpay({
        key: data.razorpay_key_id,
        amount: data.amount_paise,
        currency: data.currency,
        name: 'CK Mysuru Tournaments',
        description: t.name,
        order_id: data.razorpay_order_id,
        prefill: { name: `${form.first_name} ${form.last_name}`, email: form.email, contact: form.phone },
        theme: { color: '#F57C00' },
        method: { upi: true, card: true, netbanking: true, wallet: true },
        handler: async (resp) => {
          try {
            await axios.post(`${API}/public/tournament-registrations/verify-payment`, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              registration_id: data.registration_id,
            });
            setDone({ paid: true, payment_id: resp.razorpay_payment_id, amount: data.amount });
          } catch (err) {
            toast.error('Payment verification failed. Please contact organiser.');
          }
        },
        modal: { ondismiss: () => toast.warning('Payment cancelled. You can retry.') },
      });
      rzp.open();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-sm p-8 text-center mt-12">
          <div className="w-14 h-14 mx-auto rounded-full bg-orange-50 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-[#F57C00]" />
          </div>
          <h2 className="font-serif text-3xl mb-2">{done.paid ? 'Payment Successful' : done.free ? 'Registration Confirmed' : 'Registration Received'}</h2>
          <p className="text-gray-600 mb-1">{t.name}</p>
          {done.paid && <p className="text-sm text-gray-500">Payment ID: <span className="font-mono">{done.payment_id}</span></p>}
          {done.pending_offline && <p className="text-sm text-orange-700 mt-2"><AlertCircle className="inline w-4 h-4 mr-1" />Online payment not available. Please pay in cash at the venue and ask the organiser to mark you as paid.</p>}
          <p className="text-sm text-gray-500 mt-4">A confirmation email has been sent to <span className="font-semibold">{form.email}</span>.</p>
          <a href={`/public/tournaments/${id}`} className="inline-block mt-6 bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold px-5 py-2 rounded-sm">View Tournament</a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="brand-bar w-10 mb-3" />
        <h1 className="font-serif text-4xl font-bold">Register for {t.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.venue || '—'} · {t.start_date} → {t.end_date} · {t.num_rounds} rounds · {t.time_control}</p>

        <form onSubmit={submit} className="mt-6 bg-white border border-gray-200 rounded-sm p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="First Name *"><input data-testid="reg-first" required value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inputCls} /></Field>
            <Field label="Last Name"><input data-testid="reg-last" value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inputCls} /></Field>
            <Field label="Email *"><input data-testid="reg-email" type="email" required value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} /></Field>
            <Field label="Phone"><input data-testid="reg-phone" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} /></Field>
            <Field label="FIDE ID"><input value={form.fide_id} onChange={e => set('fide_id', e.target.value)} className={inputCls} /></Field>
            <Field label="FIDE Rating"><input type="number" value={form.fide_rating} onChange={e => set('fide_rating', e.target.value)} className={inputCls} /></Field>
            <Field label="DOB (YYYY-MM-DD)"><input value={form.dob} onChange={e => set('dob', e.target.value)} className={inputCls} placeholder="2005-04-15" /></Field>
            <Field label="Federation"><input value={form.federation} onChange={e => set('federation', e.target.value)} className={inputCls} /></Field>
            <Field label="Club / Academy"><input value={form.club} onChange={e => set('club', e.target.value)} className={inputCls} /></Field>
            <Field label="Title"><input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="GM / IM / FM / —" /></Field>
            <Field label="Category">
              <select data-testid="reg-category" value={form.category} onChange={e => { set('category', e.target.value); set('section', e.target.value); }} className={inputCls}>
                {Object.keys(t.fee_structure || { Open: 0 }).map(c => <option key={c} value={c}>{c} — ₹{t.fee_structure[c] || 0}</option>)}
              </select>
            </Field>
          </div>

          <div className="border-t pt-4 mt-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Entry Fee</div>
              <div className="font-serif text-3xl text-[#E65100]">₹ {fee.toFixed(2)}</div>
              {!info.razorpay_configured && fee > 0 && (
                <div className="text-xs text-orange-700 mt-1"><AlertCircle className="inline w-3.5 h-3.5 mr-1" />Online payment temporarily unavailable — cash at venue.</div>
              )}
            </div>
            <button type="submit" disabled={submitting} data-testid="reg-submit"
              className="bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold px-6 py-3 rounded-sm">
              {submitting ? 'Please wait…' : fee > 0 ? `Register & Pay ₹${fee.toFixed(2)}` : 'Register (Free Entry)'}
            </button>
          </div>
          <p className="text-xs text-gray-500">Payments processed securely by Razorpay (UPI, cards, netbanking, wallets). You&apos;ll receive a confirmation email after payment.</p>
        </form>
      </div>
    </Layout>
  );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-sm focus:outline-none focus:border-[#F57C00] focus:ring-2 focus:ring-orange-100 mt-1';
const Field = ({ label, children }) => (
  <div><label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{label}</label>{children}</div>
);

function Layout({ children }) {
  return (
    <div className="ckm-tournament-scope min-h-screen bg-[#F9FAFB]">
      <div className="bg-white border-b border-gray-200">
        <div className="brand-bar" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-2">
          <Crown className="w-5 h-5 text-[#F57C00]" />
          <span className="font-serif text-xl font-bold">CK Mysuru</span>
          <span className="text-xs uppercase tracking-widest text-gray-500">Tournament Registration</span>
        </div>
      </div>
      {children}
    </div>
  );
}
