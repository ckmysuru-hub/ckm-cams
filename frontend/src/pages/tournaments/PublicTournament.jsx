import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Crown } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PublicTournament() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('standings');

  useEffect(() => {
    axios.get(`${API}/public/tournaments/${id}`).then(r => setData(r.data)).catch(() => setData(false));
    const i = setInterval(() => {
      axios.get(`${API}/public/tournaments/${id}`).then(r => setData(r.data));
    }, 15000);
    return () => clearInterval(i);
  }, [id]);

  if (data === false) return <div className="p-10 text-center text-gray-500">Tournament not found or not public.</div>;
  if (!data) return <div className="p-10 text-center text-gray-500">Loading…</div>;

  const t = data.tournament;
  return (
    <div className="ckm-tournament-scope min-h-screen bg-[#F9FAFB]">
      <div className="bg-white border-b border-gray-200">
        <div className="brand-bar" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-[#F57C00]" />
            <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">CK Mysuru · Public</span>
          </div>
          <h1 className="font-serif text-4xl font-bold">{t.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.organising_body} · {t.venue || '—'} · {t.start_date} → {t.end_date}</p>
          <p className="text-xs text-gray-400 mt-2">{t.num_rounds} rounds · {t.time_control} · {t.rating_type}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          <TabBtn active={tab === 'standings'} onClick={() => setTab('standings')}>Standings</TabBtn>
          {data.rounds.map(r => <TabBtn key={r.round_number} active={tab === `r${r.round_number}`} onClick={() => setTab(`r${r.round_number}`)}>Round {r.round_number}</TabBtn>)}
        </div>

        {tab === 'standings' && (
          <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
            <table className="ckm-table">
              <thead><tr><th>Rank</th><th>Name</th><th>Title</th><th>Fed</th><th className="text-right">Rating</th><th className="text-right">Pts</th><th className="text-right">Buchholz</th><th className="text-right">SB</th></tr></thead>
              <tbody data-testid="public-standings">
                {data.standings.map(s => (
                  <tr key={s.id}>
                    <td className="font-serif text-lg font-semibold">{s.rank}</td>
                    <td className="font-semibold">{s.name}</td>
                    <td>{s.title}</td><td>{s.federation}</td>
                    <td className="text-right font-mono">{s.rating || '—'}</td>
                    <td className="text-right font-mono font-semibold text-[#E65100]">{(s.points || 0).toFixed(1)}</td>
                    <td className="text-right font-mono">{s.buchholz?.toFixed(1)}</td>
                    <td className="text-right font-mono">{s.sb?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab.startsWith('r') && (() => {
          const rn = +tab.slice(1);
          const prs = data.pairings_by_round[rn] || [];
          return (
            <div className="bg-white border border-gray-200 rounded-sm overflow-x-auto">
              <table className="ckm-table">
                <thead><tr><th>Board</th><th>White</th><th className="text-right">Rating</th><th>Result</th><th className="text-right">Rating</th><th>Black</th></tr></thead>
                <tbody>
                  {prs.map(p => (
                    <tr key={p.id}>
                      <td className="font-mono">{p.board_number}</td>
                      {p.is_bye ? <td colSpan={5} className="text-center italic text-gray-500">{p.white?.first_name} {p.white?.last_name} — BYE</td> : (
                        <>
                          <td>{p.white?.title} {p.white?.first_name} {p.white?.last_name}</td>
                          <td className="text-right font-mono">{p.white?.fide_rating || '—'}</td>
                          <td className="font-mono font-semibold text-center">{p.result || '—'}</td>
                          <td className="text-right font-mono">{p.black?.fide_rating || '—'}</td>
                          <td>{p.black?.title} {p.black?.first_name} {p.black?.last_name}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-semibold border-b-2 ${active ? 'border-[#F57C00] text-[#E65100]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{children}</button>
  );
}
