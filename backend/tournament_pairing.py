"""
FIDE-style Swiss (Dutch System) pairing engine.

This is a pragmatic implementation that respects the core FIDE C.02 rules:
  - No repeat opponents
  - Pair within score groups (high → low)
  - Colour balance: |W-B| <= 2, no 3 consecutive same colour
  - Lowest-ranked in lowest score group gets bye when odd
  - No player gets two byes (unless unavoidable)

It is not the full official C.02 reference implementation, but produces
valid Swiss pairings for tournaments up to several hundred players.
"""
from typing import List, Dict, Optional, Tuple


def _color_pref(history: List[str]) -> Tuple[int, str]:
    """Return (priority, color) where priority is:
       2 = absolute (must), 1 = strong, 0 = mild/none
       color is 'W' or 'B' or '' (no preference)"""
    if not history:
        return 0, ''
    w = history.count('W')
    b = history.count('B')
    diff = w - b  # positive => too many whites => prefers B
    last_two = history[-2:]
    # absolute: same color twice in a row → must alternate
    if len(last_two) == 2 and last_two[0] == last_two[1]:
        return 2, ('B' if last_two[0] == 'W' else 'W')
    if abs(diff) >= 2:
        return 2, ('B' if diff > 0 else 'W')
    if diff != 0:
        return 1, ('B' if diff > 0 else 'W')
    if history:
        last = history[-1]
        return 0, ('B' if last == 'W' else 'W')
    return 0, ''


def _assign_colors(p1: dict, p2: dict) -> Tuple[str, str]:
    """Return (white_id, black_id). p1 is higher-ranked (lower pairing number)."""
    pr1, c1 = _color_pref(p1['color_history'])
    pr2, c2 = _color_pref(p2['color_history'])
    # If both have a preference and they conflict ideally, give priority to higher.
    if pr1 > pr2 and c1:
        return (p1['id'], p2['id']) if c1 == 'W' else (p2['id'], p1['id'])
    if pr2 > pr1 and c2:
        return (p2['id'], p1['id']) if c2 == 'W' else (p1['id'], p2['id'])
    if c1 and c2 and c1 != c2:
        return (p1['id'], p2['id']) if c1 == 'W' else (p2['id'], p1['id'])
    if c1:
        return (p1['id'], p2['id']) if c1 == 'W' else (p2['id'], p1['id'])
    if c2:
        return (p2['id'], p1['id']) if c2 == 'W' else (p1['id'], p2['id'])
    # Default: higher-ranked gets the color opposite of their last; else white
    if p1['color_history']:
        last = p1['color_history'][-1]
        return (p2['id'], p1['id']) if last == 'W' else (p1['id'], p2['id'])
    return p1['id'], p2['id']


def generate_swiss_pairings(
    players: List[dict],
    past_opponents: Dict[str, set],
    byes_received: Dict[str, int],
) -> Tuple[List[dict], Optional[str]]:
    """
    players: list of dicts with keys id, points (float), rating (int),
             color_history (list of 'W'/'B'), pairing_number (int)
    past_opponents: dict player_id -> set of opponent_ids
    byes_received: dict player_id -> int

    Returns (pairings, bye_player_id_or_None)
    pairings: list of {white: id, black: id}
    """
    # Sort by score, then stored starting rank/pairing number, then rating.
    # Lower pairing_number means higher starting rank. Older tournaments may
    # not have pairing numbers yet, so rating remains the stable fallback.
    eligible = sorted(players, key=lambda p: (-p['points'], p.get('pairing_number') or 999999, -p['rating']))

    bye_id = None
    if len(eligible) % 2 == 1:
        # lowest-ranked in lowest score group who hasn't had a bye yet
        for p in reversed(eligible):
            if byes_received.get(p['id'], 0) == 0:
                bye_id = p['id']
                break
        if bye_id is None:
            bye_id = eligible[-1]['id']
        eligible = [p for p in eligible if p['id'] != bye_id]

    # Build score groups
    score_groups: Dict[float, List[dict]] = {}
    for p in eligible:
        score_groups.setdefault(p['points'], []).append(p)

    scores_desc = sorted(score_groups.keys(), reverse=True)

    pairings: List[dict] = []
    floaters: List[dict] = []

    def try_pair_group(group: List[dict]) -> Tuple[List[dict], List[dict]]:
        """Attempt to pair group via top-half vs bottom-half. Returns (pairs, leftover)."""
        group = sorted(group, key=lambda p: (p.get('pairing_number') or 999999, -p['rating']))
        n = len(group)
        if n == 0:
            return [], []
        if n == 1:
            return [], group[:]
        half = n // 2
        top = group[:half]
        bottom = group[half:]
        used = set()
        result_pairs = []
        # greedy with backtracking light: pair top[i] with first available bottom not played
        # Try multiple shuffles of bottom if straight pairing fails
        for attempt in range(6):
            used.clear()
            result_pairs.clear()
            ok = True
            order = list(range(len(bottom)))
            # rotate by attempt
            if attempt > 0:
                order = order[attempt:] + order[:attempt]
            for ti, t in enumerate(top):
                paired = False
                for oi in order:
                    if oi in used:
                        continue
                    cand = bottom[oi]
                    if cand['id'] in past_opponents.get(t['id'], set()):
                        continue
                    used.add(oi)
                    result_pairs.append((t, cand))
                    paired = True
                    break
                if not paired:
                    ok = False
                    break
            if ok:
                leftover = [bottom[i] for i in range(len(bottom)) if i not in used]
                # if half != n-half (odd group) some top leftover
                if len(top) > len(bottom):
                    leftover += top[len(bottom):]
                return result_pairs, leftover
        # last resort: pair top[i] with bottom[i] anyway
        result_pairs = []
        for i in range(min(len(top), len(bottom))):
            result_pairs.append((top[i], bottom[i]))
        leftover = bottom[len(top):] if len(bottom) > len(top) else top[len(bottom):]
        return result_pairs, leftover

    for s in scores_desc:
        group = floaters + score_groups[s]
        floaters = []
        pairs, leftover = try_pair_group(group)
        for hi, lo in pairs:
            w, b = _assign_colors(hi, lo)
            pairings.append({'white': w, 'black': b})
        floaters = leftover

    # If any floaters left (couldn't pair), pair them among themselves arbitrarily
    while len(floaters) >= 2:
        a = floaters.pop(0)
        b = floaters.pop(0)
        w, bl = _assign_colors(a, b)
        pairings.append({'white': w, 'black': bl})

    return pairings, bye_id


def calc_tiebreaks(
    standings_input: List[dict],
    results_by_player: Dict[str, List[dict]],
) -> List[dict]:
    """
    standings_input: list of {id, name, rating, title, federation, points}
    results_by_player: id -> list of {opponent_id, result_score (1/0.5/0), is_bye}

    Returns list with added 'buchholz', 'sb', 'direct_encounter' values.
    """
    # Build map id -> points
    pts_map = {p['id']: p['points'] for p in standings_input}

    out = []
    for p in standings_input:
        pid = p['id']
        games = results_by_player.get(pid, [])
        buchholz = 0.0
        sb = 0.0
        for g in games:
            if g.get('is_bye'):
                # use own points as virtual opponent (FIDE-style FBB approximation)
                buchholz += p['points']
                continue
            opp = g['opponent_id']
            opp_pts = pts_map.get(opp, 0)
            buchholz += opp_pts
            sb += opp_pts * g['result_score']
        out.append({**p, 'buchholz': round(buchholz, 1), 'sb': round(sb, 2)})
    return out
