import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isDirector } from '@/lib/roles';
import { Plus, Calendar, MapPin, Users, Trophy } from 'lucide-react';

const statusStyles = {
  upcoming: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-orange-100 text-[#E65100]',
  completed: 'bg-green-100 text-green-800',
  registration_open: 'bg-blue-100 text-blue-700',
};

export default function TournamentList() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tournaments').then(r => setTournaments(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="ckm-tournament-scope max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="brand-bar w-10 mb-3" />
          <h1 className="font-serif text-4xl font-bold">Tournaments</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.name}. Manage your active and upcoming events.</p>
        </div>
        {isDirector(user) && (
          <Link to="/tournaments/new" data-testid="dashboard-new-tournament"
            className="bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold px-4 py-2.5 rounded-sm flex items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> New Tournament
          </Link>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading…</div>
      ) : tournaments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
          <Trophy className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <div className="font-serif text-2xl mb-1">No tournaments yet</div>
          <p className="text-sm text-gray-500 mb-6">Create your first tournament to get started.</p>
          {isDirector(user) && (
            <Link to="/tournaments/new" className="inline-block bg-[#F57C00] hover:bg-[#FF9800] text-white font-semibold px-4 py-2.5 rounded-sm">
              Create Tournament
            </Link>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="tournament-list">
          {tournaments.map(t => (
            <Link key={t.id} to={`/tournaments/${t.id}`}
              data-testid={`tournament-card-${t.id}`}
              className="bg-white border border-gray-200 hover:border-[#F57C00] hover:shadow-md rounded-sm p-5 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-sm ${statusStyles[t.status] || 'bg-gray-100 text-gray-700'}`}>
                  {t.status?.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-400 font-mono">{t.rating_type}</span>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-1 group-hover:text-[#E65100]">{t.name}</h3>
              <p className="text-xs text-gray-500 mb-4">{t.organising_body}</p>
              <div className="space-y-1.5 text-sm text-gray-600">
                <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400" />{t.start_date} → {t.end_date}</div>
                {t.venue && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-gray-400" />{t.venue}</div>}
                <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-gray-400" />{t.num_rounds} rounds · Round {t.current_round}/{t.num_rounds}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
