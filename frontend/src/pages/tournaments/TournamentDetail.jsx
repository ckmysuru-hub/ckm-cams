import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, API_BASE as API, formatApiError as formatError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { isDirector } from '@/lib/roles';
import { toast } from 'sonner';
import { Plus, Upload, Trash2, Printer, FileDown, Play, CheckCircle, ExternalLink, ChevronRight, Eye, Edit2, Settings, X, Shuffle } from 'lucide-react';
import { downloadCsv } from '@/lib/csv';
import TableActions, { TableActionItem } from '@/components/TableActions';

const TABS = ['Players', 'Rounds', 'Standings', 'Audit', 'Exports'];

export default function TournamentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('Players');
  const [t, setT] = useState(null);
  const [editing, setEditing] = useState(false);

  const reloadTournament = () => api.get(`/tournaments/${id}`).then(r => setT(r.data));
  useEffect(() => { reloadTournament().catch(e => toast.error(formatError(e))); }, [id]);

  if (!t) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  const publicUrl = `${window.location.origin}/public/tournaments/${id}`;
  const canEdit = isDirector(user);

  return (
    <div className="ckm-tournament-scope max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="brand-bar w-10 mb-3" />
          <h1 className="font-serif text-4xl font-bold">{t.name}</h1>
          <p className="text-sm text-gray-500">{t.organising_body} · {t.venue || '—'} · {t.start_date} → {t.end_date}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto [&>*]:shrink-0">
          {canEdit && (
            <button onClick={() => setEditing(true)} data-testid="edit-tournament-btn"
              className="text-sm border border-gray-300 px-3 py-2 rounded-sm hover:bg-gray-50 flex items-center gap-1.5">
              <Settings className="w-4 h-4" /> Edit
            </button>
          )}
          <a href={publicUrl} target="_blank" rel="noreferrer" data-testid="public-link"
            className="text-sm border border-gray-300 px-3 py-2 rounded-sm hover:bg-gray-50 flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Public View <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/tournaments/${id}/register`); toast.success('Registration link copied'); }}
            data-testid="copy-register-link"
            className="text-sm border border-[#F57C00] text-[#E65100] px-3 py-2 rounded-sm hover:bg-orange-50 flex items-center gap-1.5">
            Copy Registration Link
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Status" value={t.status?.replace('_', ' ')} accent />
        <Stat label="Rounds" value={`${t.current_round} / ${t.num_rounds}`} />
        <Stat label="Time Control" value={t.time_control} />
        <Stat label="Rating" value={t.rating_type} />
        <Stat label="Cross Category" value={t.allow_cross_category_pairing === false ? 'No' : 'Yes'} />
      </div>

      <div className="border-b border-gray-200 mb-4 no-print overflow-x-auto">
        <div className="flex gap-1 w-max min-w-full">
          {TABS.map(x => (
            <button key={x} onClick={() => setTab(x)} data-testid={`tab-${x.toLowerCase()}`}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === x ? 'border-[#F57C00] text-[#E65100]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {x}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Players' && <PlayersTab tid={id} user={user} t={t} />}
      {tab === 'Rounds' && <RoundsTab tid={id} user={user} t={t} setT={setT} />}
      {tab === 'Standings' && <StandingsTab tid={id} />}
      {tab === 'Audit' && <AuditTab tid={id} />}
      {tab === 'Exports' && <ExportsTab tid={id} t={t} />}
      {editing && <EditTournamentModal t={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reloadTournament(); }} />}
    </div>
  );
}

function EditTournamentModal({ t, onClose, onSaved }) {
  const initCats = (t.sections || ['Open']).map(s => ({ name: s, fee: +(t.fee_structure?.[s] || 0) }));
  const [f, setF] = useState({
    name: t.name || '', venue: t.venue || '', num_rounds: t.num_rounds || 7,
    time_control: t.time_control || '90+30', chief_arbiter_name: t.chief_arbiter_name || '',
    bye_type: t.bye_type || 'half', notes: t.notes || '',
    allow_cross_category_pairing: t.allow_cross_category_pairing !== false,
    public_visible: t.public_visible !== false, status: t.status || 'upcoming',
    categories: initCats.length ? initCats : [{ name: 'Open', fee: 0 }],
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const setCat = (i, k, v) => setF(s => ({ ...s, categories: s.categories.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addCat = () => setF(s => ({ ...s, categories: [...s.categories, { name: '', fee: 0 }] }));
  const delCat = (i) => setF(s => ({ ...s, categories: s.categories.filter((_, idx) => idx !== i) }));
  const submit = async () => {
    try {
      const cats = f.categories.filter(c => c.name.trim());
      await api.patch(`/tournaments/${t.id}`, {
        name: f.name, venue: f.venue, num_rounds: +f.num_rounds, time_control: f.time_control,
        chief_arbiter_name: f.chief_arbiter_name, bye_type: f.bye_type, notes: f.notes,
        public_visible: f.public_visible, status: f.status,
        allow_cross_category_pairing: f.allow_cross_category_pairing,
        sections: cats.map(c => c.name.trim()),
        fee_structure: Object.fromEntries(cats.map(c => [c.name.trim(), +c.fee || 0])),
      });
      toast.success('Tournament updated'); onSaved();
    } catch (e) { toast.error(formatError(e)); }
  };
  const inp = 'w-full px-3 py-2 mt-1 border border-gray-300 rounded-sm focus:outline-none focus:border-[#F57C00] focus:ring-2 focus:ring-orange-100';
  const lbl = 'text-xs uppercase tracking-widest text-gray-500 font-semibold';
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-sm w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-serif text-2xl mb-4">Edit Tournament</h3>
        <div className="grid grid-cols-2 gap-3 text-sm ckm-form-grid">
          <div className="col-span-2"><label className={lbl}>Name</label><input data-testid="edit-t-name" value={f.name} onChange={e => set('name', e.target.value)} className={inp} /></div>
          <div className="col-span-2"><label className={lbl}>Venue</label><input value={f.venue} onChange={e => set('venue', e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Rounds</label><input type="number" min={1} max={20} value={f.num_rounds} onChange={e => set('num_rounds', e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Time Control</label><input value={f.time_control} onChange={e => set('time_control', e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Chief Arbiter</label><input value={f.chief_arbiter_name} onChange={e => set('chief_arbiter_name', e.target.value)} className={inp} /></div>
          <div>
            <label className={lbl}>Bye Type</label>
            <select value={f.bye_type} onChange={e => set('bye_type', e.target.value)} className={inp}>
              <option value="half">Half-point (0.5)</option><option value="full">Full-point (1.0)</option><option value="zero">Zero (0)</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Cross Category Pairing</label>
            <select value={f.allow_cross_category_pairing ? 'yes' : 'no'} onChange={e => set('allow_cross_category_pairing', e.target.value === 'yes')} className={inp}>
              <option value="yes">Yes - pair across categories</option>
              <option value="no">No - pair only within each category</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Status</label>
            <select value={f.status} onChange={e => set('status', e.target.value)} className={inp}>
              {['upcoming', 'registration_open', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2 mt-2">
            <input id="pv" type="checkbox" checked={f.public_visible} onChange={e => set('public_visible', e.target.checked)} />
            <label htmlFor="pv" className="text-sm">Visible on public page</label>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label className={lbl}>Categories &amp; Fees</label>
            <button type="button" onClick={addCat} className="text-xs border border-[#F57C00] text-[#E65100] px-2 py-1 rounded-sm flex items-center gap-1 hover:bg-orange-50">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {f.categories.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6"><input data-testid={`edit-cat-name-${i}`} placeholder="Category name" value={c.name} onChange={e => setCat(i, 'name', e.target.value)} className={inp} /></div>
                <div className="col-span-5"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span><input data-testid={`edit-cat-fee-${i}`} type="number" min={0} value={c.fee} onChange={e => setCat(i, 'fee', e.target.value)} className={inp + ' pl-7'} /></div></div>
                <div className="col-span-1 flex justify-end">{f.categories.length > 1 && <button type="button" onClick={() => delCat(i)} className="p-1.5 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-sm border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} data-testid="edit-t-save" className="px-5 py-2 text-sm rounded-sm bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`bg-white border ${accent ? 'border-[#F57C00]' : 'border-gray-200'} rounded-sm p-3`}>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{label}</div>
      <div className={`font-serif text-2xl mt-1 ${accent ? 'text-[#E65100]' : ''}`}>{value || '—'}</div>
    </div>
  );
}

function PlayersTab({ tid, user, t }) {
  const [players, setPlayers] = useState([]);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const fileRef = useRef();

  const load = () => api.get(`/tournaments/${tid}/players`).then(r => setPlayers(r.data));
  useEffect(() => { load(); }, [tid]);

  const filtered = players.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase()) ||
    (p.fide_id || '').includes(q) || (p.club || '').toLowerCase().includes(q.toLowerCase()));

  const onImport = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try {
      const { data } = await api.post(`/tournaments/${tid}/players/import-csv`, fd);
      toast.success(`Imported ${data.added} players${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`);
      load();
    } catch (e) { toast.error(formatError(e)); }
    finally { e.target.value = ''; }
  };

  const downloadTemplate = () => {
    const category = t.sections?.[0] || 'Open';
    downloadCsv([{
      first_name: 'Sample',
      last_name: 'Player',
      fide_id: '12345678',
      federation: 'IND',
      title: '',
      fide_rating: '1200',
      dob: '2012-04-12',
      gender: 'male',
      club: 'Chess Klub Mysuru',
      email: 'player@example.com',
      phone: '+919876543210',
      category,
      section: category,
      payment_status: 'unpaid',
    }], 'tournament-players-import-template.csv');
  };

  const removePlayer = async (id) => {
    if (!window.confirm('Remove this player?')) return;
    await api.delete(`/tournaments/${tid}/players/${id}`); load();
  };

  const randomizePositions = async () => {
    if (!window.confirm('Randomize starting ranks for all players? This can only be done before round 1 is paired.')) return;
    try {
      const { data } = await api.post(`/tournaments/${tid}/players/randomize-positions`);
      toast.success(`Randomized ${data.count} player positions`);
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const canEdit = isDirector(user);
  const canRandomize = canEdit && Number(t.current_round || 0) < 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <input data-testid="players-search" placeholder="Search by name, FIDE ID, club…" value={q} onChange={e => setQ(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-sm w-full sm:w-80 focus:outline-none focus:border-[#F57C00]" />
        <div className="text-sm text-gray-500">{filtered.length} of {players.length} players</div>
        {canEdit && (
          <div className="flex gap-2">
            {canRandomize && (
              <button onClick={randomizePositions} data-testid="randomize-positions-btn"
                className="text-sm border border-[#F57C00] text-[#E65100] px-3 py-2 rounded-sm hover:bg-orange-50 flex items-center gap-1.5">
                <Shuffle className="w-4 h-4" /> Randomize positions
              </button>
            )}
            <input ref={fileRef} type="file" accept=".csv" onChange={onImport} className="hidden" />
            <button onClick={downloadTemplate} data-testid="players-template-btn"
              className="text-sm border border-gray-300 px-3 py-2 rounded-sm hover:bg-gray-50 flex items-center gap-1.5">
              <FileDown className="w-4 h-4" /> Template
            </button>
            <button onClick={() => fileRef.current?.click()} data-testid="import-csv-btn"
              className="text-sm border border-gray-300 px-3 py-2 rounded-sm hover:bg-gray-50 flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <button onClick={() => setShowAdd(true)} data-testid="add-player-btn"
              className="text-sm bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold px-3 py-2 rounded-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Player
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
        <table className="ckm-table">
          <thead>
            <tr>
              <th>Rank</th><th>Title</th><th>Name</th><th>Fed</th><th className="text-right">Rating</th>
              <th>Club</th><th>Cat</th><th className="text-right">Pts</th><th>Pay</th><th>Status</th>{canEdit && <th></th>}
            </tr>
          </thead>
          <tbody data-testid="players-table">
            {filtered.map((p, i) => (
              <tr key={p.id} data-testid={`player-row-${p.id}`}>
                <td className="font-mono text-gray-400">{p.pairing_number || i + 1}</td>
                <td className="font-semibold">{p.title}</td>
                <td className="font-semibold">{p.first_name} {p.last_name}</td>
                <td>{p.federation}</td>
                <td className="text-right font-mono">{p.fide_rating || '—'}</td>
                <td className="text-gray-600">{p.club || '—'}</td>
                <td>{p.category}</td>
                <td className="text-right font-mono font-semibold">{(p.points || 0).toFixed(1)}</td>
                <td>
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm ${p.payment_status === 'unpaid' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {p.payment_status}
                  </span>
                </td>
                <td>{p.status}</td>
                {canEdit && (
                  <td className="text-right">
                    <TableActions testId={`player-actions-${p.id}`}>
                      <TableActionItem icon={Edit2} onSelect={() => setEditPlayer(p)} data-testid={`edit-player-${p.id}`}>Edit</TableActionItem>
                      <TableActionItem icon={Trash2} className="text-red-600 focus:text-red-700" onSelect={() => removePlayer(p.id)} data-testid={`delete-player-${p.id}`}>Delete</TableActionItem>
                    </TableActions>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canEdit ? 11 : 10} className="text-center text-gray-400 py-10">No players. Add manually or import CSV.</td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && <PlayerModal tid={tid} categories={t.sections} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {editPlayer && <PlayerModal tid={tid} categories={t.sections} player={editPlayer} onClose={() => setEditPlayer(null)} onSaved={() => { setEditPlayer(null); load(); }} />}
    </div>
  );
}

function PlayerModal({ tid, categories, player, onClose, onSaved }) {
  const cats = categories?.length ? categories : ['Open'];
  const isEdit = !!player;
  const [f, setF] = useState({
    first_name: player?.first_name || '', last_name: player?.last_name || '',
    fide_id: player?.fide_id || '', federation: player?.federation || 'IND',
    title: player?.title || '', fide_rating: player?.fide_rating || 0,
    club: player?.club || '', email: player?.email || '', phone: player?.phone || '',
    dob: player?.dob || '', gender: player?.gender || '',
    category: player?.category || cats[0], payment_status: player?.payment_status || 'unpaid',
    status: player?.status || 'active', notes: player?.notes || '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async () => {
    try {
      const payload = { ...f, fide_rating: +f.fide_rating || 0, section: f.category };
      if (isEdit) {
        await api.patch(`/tournaments/${tid}/players/${player.id}`, payload);
        toast.success('Player updated');
      } else {
        await api.post(`/tournaments/${tid}/players`, payload);
        toast.success('Player added');
      }
      onSaved();
    } catch (e) { toast.error(formatError(e)); }
  };
  const fields = [
    ['first_name', 'First Name *'], ['last_name', 'Last Name'], ['fide_id', 'FIDE ID'],
    ['federation', 'Federation'], ['title', 'Title'], ['fide_rating', 'FIDE Rating'],
    ['club', 'Club'], ['email', 'Email'], ['phone', 'Phone'],
    ['dob', 'DOB (YYYY-MM-DD)'], ['gender', 'Gender'],
  ];
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-sm w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-serif text-2xl mb-4">{isEdit ? 'Edit Player' : 'Add Player'}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm ckm-form-grid">
          {fields.map(([k, l]) => (
            <div key={k}>
              <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{l}</label>
              <input data-testid={`player-modal-${k}`} value={f[k]} onChange={e => set(k, e.target.value)}
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-sm focus:outline-none focus:border-[#F57C00]" />
            </div>
          ))}
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Category</label>
            <select data-testid="player-modal-category" value={f.category} onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-sm">
              {cats.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Payment</label>
            <select value={f.payment_status} onChange={e => set('payment_status', e.target.value)}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-sm">
              {['unpaid', 'paid', 'cash', 'waived'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Status</label>
            <select value={f.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-sm">
              {['active', 'withdrawn'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-sm border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} data-testid="player-modal-save"
            className="px-5 py-2 text-sm rounded-sm bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold">{isEdit ? 'Save Changes' : 'Add Player'}</button>
        </div>
      </div>
    </div>
  );
}

function RoundsTab({ tid, user, t, setT }) {
  const [rounds, setRounds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState({});

  const reload = async () => {
    const r = await api.get(`/tournaments/${tid}/rounds`); setRounds(r.data);
  };
  useEffect(() => { reload(); }, [tid]);

  useEffect(() => {
    if (selected != null) {
      api.get(`/tournaments/${tid}/rounds/${selected}/pairings`).then(r => setData(r.data));
    }
  }, [selected, tid]);

  const pairRound = async (rn) => {
    try {
      await api.post(`/tournaments/${tid}/rounds/${rn}/pair`);
      toast.success(`Round ${rn} paired`);
      await reload();
      setSelected(rn);
      const { data: ref } = await api.get(`/tournaments/${tid}`); setT(ref);
    } catch (e) { toast.error(formatError(e)); }
  };
  const closeRound = async (rn) => {
    if (!window.confirm(`Close round ${rn}? Points will be applied.`)) return;
    try {
      await api.post(`/tournaments/${tid}/rounds/${rn}/close`);
      toast.success(`Round ${rn} closed`);
      await reload();
      const { data: ref } = await api.get(`/tournaments/${tid}`); setT(ref);
      api.get(`/tournaments/${tid}/rounds/${rn}/pairings`).then(r => setData(r.data));
    } catch (e) { toast.error(formatError(e)); }
  };

  const submitResult = async (pid, r) => {
    setSaving(s => ({ ...s, [pid]: true }));
    try {
      await api.post(`/tournaments/${tid}/rounds/${selected}/results`, { pairing_id: pid, result: r });
      setData(d => ({ ...d, pairings: d.pairings.map(p => p.id === pid ? { ...p, result: r } : p) }));
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(s => ({ ...s, [pid]: false })); }
  };

  const canPair = isDirector(user);
  const canEnterResult = isDirector(user);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-3 space-y-2" data-testid="rounds-list">
          {Array.from({ length: t.num_rounds }, (_, i) => i + 1).map(rn => {
            const r = rounds.find(x => x.round_number === rn);
            const status = r?.status || 'pending';
            return (
              <div key={rn} className={`bg-white border rounded-sm p-3 ${selected === rn ? 'border-[#F57C00]' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-serif text-lg">Round {rn}</div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-500">{status}</span>
                </div>
                <div className="flex gap-1">
                  {status === 'pending' && canPair && (
                    <button onClick={() => pairRound(rn)} data-testid={`pair-round-${rn}`}
                      className="text-xs bg-[#F57C00] text-white px-2 py-1 rounded-sm flex items-center gap-1"><Play className="w-3 h-3" /> Pair</button>
                  )}
                  {r && <button onClick={() => setSelected(rn)} data-testid={`view-round-${rn}`}
                    className="text-xs border border-gray-300 px-2 py-1 rounded-sm flex items-center gap-1">View <ChevronRight className="w-3 h-3" /></button>}
                  {status === 'paired' && canPair && (
                    <button onClick={() => closeRound(rn)} data-testid={`close-round-${rn}`}
                      className="text-xs bg-black text-white px-2 py-1 rounded-sm flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Close</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="md:col-span-9">
          {!selected || !data ? (
            <div className="bg-white border border-gray-200 rounded-sm p-10 text-center text-gray-400">
              Select a round to view pairings & enter results.
            </div>
          ) : (
            <div className="print-area">
              <div className="flex items-center justify-between mb-3 no-print">
                <div className="font-serif text-2xl">Round {selected} · {data.round?.status}</div>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="text-sm border border-gray-300 px-3 py-1.5 rounded-sm flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print</button>
                </div>
              </div>
              <div className="hidden print:block mb-4">
                <div className="font-serif text-2xl">{t.name} — Round {selected}</div>
                <div className="text-sm">{t.venue} · {t.start_date}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
                <table className="ckm-table">
                  <thead><tr><th>Board</th><th>White</th><th className="text-right">Rating</th><th>Result</th><th className="text-right">Rating</th><th>Black</th></tr></thead>
                  <tbody data-testid="pairings-table">
                    {data.pairings.map(p => (
                      <tr key={p.id} data-testid={`pairing-${p.board_number}`}>
                        <td className="font-mono font-semibold">{p.board_number}</td>
                        {p.is_bye ? (
                          <>
                            <td colSpan={5} className="text-center text-gray-500 italic">{p.white?.first_name} {p.white?.last_name} — BYE (0.5 pt)</td>
                          </>
                        ) : (
                          <>
                            <td><span className="dot-w mr-2 align-middle" /><span className="font-semibold">{p.white?.title} {p.white?.first_name} {p.white?.last_name}</span></td>
                            <td className="text-right font-mono">{p.white?.fide_rating || '—'}</td>
                            <td>
                              <ResultButtons disabled={!canEnterResult || data.round?.status === 'closed' || saving[p.id]} value={p.result}
                                onChange={(r) => submitResult(p.id, r)} testid={`board-${p.board_number}`} />
                            </td>
                            <td className="text-right font-mono">{p.black?.fide_rating || '—'}</td>
                            <td><span className="dot-b mr-2 align-middle" /><span className="font-semibold">{p.black?.title} {p.black?.first_name} {p.black?.last_name}</span></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ResultProgress pairings={data.pairings} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultButtons({ value, onChange, disabled, testid }) {
  // FIDE-standard chess tournament result codes
  const options = [
    { v: '',        label: '— Select result —' },
    { v: '1-0',     label: '1-0  (White wins)' },
    { v: '0-1',     label: '0-1  (Black wins)' },
    { v: '0.5-0.5', label: '½-½  (Draw)' },
    { v: '1-0F',    label: '+/-  (White wins by forfeit)' },
    { v: '0-1F',    label: '-/+  (Black wins by forfeit)' },
    { v: '0-0F',    label: '-/-  (Double forfeit)' },
  ];
  const isForfeit = value && value.endsWith('F');
  return (
    <select
      disabled={disabled}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      data-testid={`result-${testid}-select`}
      className={`result-select ${value ? 'has-value' : ''} ${isForfeit ? 'is-forfeit' : ''}`}
    >
      {options.map(o => (
        <option key={o.v} value={o.v}>{o.label}</option>
      ))}
    </select>
  );
}

function ResultProgress({ pairings }) {
  const games = pairings.filter(p => !p.is_bye);
  const done = games.filter(p => p.result).length;
  return (
    <div className="mt-3 text-sm text-gray-600 flex items-center gap-3 no-print">
      <div className="flex-1 h-2 bg-gray-100 rounded-sm overflow-hidden">
        <div className="h-full bg-[#F57C00]" style={{ width: `${games.length ? (done / games.length) * 100 : 0}%` }} />
      </div>
      <div className="font-mono">{done} / {games.length} results</div>
    </div>
  );
}

function StandingsTab({ tid }) {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('');
  useEffect(() => { api.get(`/tournaments/${tid}/standings`).then(r => setData(r.data)); }, [tid]);
  const filtered = filter === '' ? data : data.filter(p => p.section === filter);
  const sections = [...new Set(data.map(d => d.section))];

  return (
    <div className="print-area">
      <div className="flex items-center justify-between mb-3 no-print">
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={`text-xs px-3 py-1 rounded-sm ${filter === '' ? 'bg-black text-white' : 'border border-gray-300'}`}>All</button>
          {sections.map(s => <button key={s} onClick={() => setFilter(s)} className={`text-xs px-3 py-1 rounded-sm ${filter === s ? 'bg-black text-white' : 'border border-gray-300'}`}>{s}</button>)}
        </div>
        <button onClick={() => window.print()} className="text-sm border border-gray-300 px-3 py-1.5 rounded-sm flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print</button>
      </div>
      <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
        <table className="ckm-table">
          <thead><tr><th>Rank</th><th>Name</th><th>Title</th><th>Fed</th><th className="text-right">Rating</th><th className="text-right">Pts</th><th className="text-right">Buchholz</th><th className="text-right">SB</th></tr></thead>
          <tbody data-testid="standings-table">
            {filtered.map(s => (
              <tr key={s.id} data-testid={`stand-${s.id}`}>
                <td className="font-serif text-lg font-semibold">{s.rank}</td>
                <td className="font-semibold">{s.name}</td>
                <td>{s.title}</td>
                <td>{s.federation}</td>
                <td className="text-right font-mono">{s.rating || '—'}</td>
                <td className="text-right font-mono font-semibold text-[#E65100]">{(s.points || 0).toFixed(1)}</td>
                <td className="text-right font-mono">{s.buchholz?.toFixed(1)}</td>
                <td className="text-right font-mono">{s.sb?.toFixed(2)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-10">No standings yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab({ tid }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get(`/tournaments/${tid}/audit`).then(r => setItems(r.data)).catch(e => toast.error(formatError(e)));
  }, [tid]);
  return (
    <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
      <table className="ckm-table">
        <thead><tr><th>Time (IST)</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody data-testid="audit-table">
          {items.map(a => (
            <tr key={a.id}>
              <td className="font-mono text-xs">{new Date(a.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              <td>{a.user_email}</td>
              <td className="text-xs uppercase tracking-wide">{a.user_role}</td>
              <td className="font-mono text-xs">{a.action}</td>
              <td className="text-xs">{a.entity_type} {a.entity_id?.slice(0, 8)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-10">No audit entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ExportsTab({ tid, t }) {
  const dl = (path, name) => {
    fetch(`${API}/tournaments/${tid}/export/${path}`, { credentials: 'include' })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      });
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <ExportCard title="CSV Standings" desc="Comma-separated standings for spreadsheets" onClick={() => dl('csv', `standings_${t.name}.csv`)} testid="export-csv" />
      <ExportCard title="FIDE TRF16" desc="Tournament Report File for FIDE rating submission" onClick={() => dl('trf16', `trf16_${t.name}.txt`)} testid="export-trf16" />
    </div>
  );
}

function ExportCard({ title, desc, onClick, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className="bg-white border border-gray-200 hover:border-[#F57C00] rounded-sm p-5 text-left transition-colors">
      <FileDown className="w-5 h-5 text-[#F57C00] mb-2" />
      <div className="font-serif text-xl font-semibold mb-1">{title}</div>
      <div className="text-sm text-gray-500">{desc}</div>
    </button>
  );
}
