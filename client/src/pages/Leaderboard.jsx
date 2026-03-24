import { useCallback, useEffect, useState } from 'react';
import useAuthStore from '../store/authStore';
import { userService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { getAssignedAdminTrack } from '../utils/access';

const TRACK_OPTIONS = [
    { key: 'all', label: 'All Tracks' },
    { key: 'Solutions', label: 'Solutions' },
    { key: 'Delivery', label: 'Delivery' },
    { key: 'Learning', label: 'Learning' },
    { key: 'GTM/Sales', label: 'GTM/Sales' },
    { key: 'Organizational Building & Thought Leadership', label: 'Thought Leadership' },
];

export default function Leaderboard() {
    const user = useAuthStore((s) => s.user);
    const adminTrack = getAssignedAdminTrack(user);
    const [selectedTrack, setSelectedTrack] = useState(adminTrack || 'all');
    const [sortBy, setSortBy] = useState('rank');
    const [leaderboard, setLeaderboard] = useState([]);
    const [scope, setScope] = useState('all');
    const [creditRules, setCreditRules] = useState({ High: 10, Medium: 7, Low: 5 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = { limit: 50, track: selectedTrack, sortBy };
            const res = await userService.getLeaderboard(params);
            setLeaderboard(res.data?.leaderboard || []);
            setScope(res.data?.scope || 'all');
            setCreditRules(res.data?.creditRules || { High: 10, Medium: 7, Low: 5 });
        } catch {
            setError('Failed to load leaderboard');
        } finally {
            setLoading(false);
        }
    }, [selectedTrack, sortBy]);

    useEffect(() => {
        setSelectedTrack(adminTrack || 'all');
    }, [adminTrack]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchLeaderboard} />;

    return (
        <div className="space-y-5">
            <Card hover={false} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-charcoal-800">Contribution Leaderboard</h1>
                        <p className="text-sm text-charcoal-500 mt-1">
                            Credits by impact: High {creditRules.High}, Medium {creditRules.Medium}, Low {creditRules.Low}
                        </p>
                        <p className="text-xs text-charcoal-500 mt-1">
                            Credits gained use harmonic mean of impact credits and hours spent on finished contributions.
                        </p>
                    </div>
                    <Badge color="sand">Current Scope: {scope === 'all' ? 'All Tracks' : scope}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    {TRACK_OPTIONS.map((track) => (
                        <button
                            key={track.key}
                            type="button"
                            onClick={() => setSelectedTrack(track.key)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                                selectedTrack === track.key
                                    ? 'bg-terracotta-100 border-terracotta-300 text-terracotta-700'
                                    : 'bg-white border-sand-200 text-charcoal-600 hover:bg-sand-50'
                            }`}
                        >
                            {track.label}
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-charcoal-500">Sort By</span>
                    {[
                        { key: 'rank', label: 'Rank' },
                        { key: 'credits', label: 'Credits' },
                        { key: 'finished', label: 'Finished' },
                    ].map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => setSortBy(option.key)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                                sortBy === option.key
                                    ? 'bg-violet-100 border-violet-300 text-violet-700'
                                    : 'bg-white border-sand-200 text-charcoal-600 hover:bg-sand-50'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </Card>

            <Card hover={false} className="p-5">
                {leaderboard.length === 0 ? (
                    <p className="text-sm text-charcoal-500">No finished contributions with approved users found for this track filter.</p>
                ) : (
                    <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-charcoal-500 border-b border-sand-200">
                                    <th className="py-2 pr-3">Rank</th>
                                    <th className="py-2 pr-3">User</th>
                                    <th className="py-2 pr-3">Credits</th>
                                    <th className="py-2 pr-3">Hours</th>
                                    <th className="py-2 pr-3">Finished</th>
                                    <th className="py-2">Impact Mix (H/M/L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((row) => (
                                    <tr key={row.user?._id || row.rank} className="border-b border-sand-100 last:border-0">
                                        <td className="py-2 pr-3 font-semibold text-charcoal-700">#{row.rank}</td>
                                        <td className="py-2 pr-3">
                                            <div className="font-medium text-charcoal-800">{row.user?.name || 'Unknown'}</div>
                                            <div className="text-xs text-charcoal-500">{row.user?.email || ''}</div>
                                        </td>
                                        <td className="py-2 pr-3 font-semibold text-violet-700">{row.totalCredits || 0}</td>
                                        <td className="py-2 pr-3 text-charcoal-700">{row.totalHoursSpent || 0}</td>
                                        <td className="py-2 pr-3 text-charcoal-700">{row.finishedContributions || 0}</td>
                                        <td className="py-2 text-charcoal-600">
                                            {row.highImpactCount || 0}/{row.mediumImpactCount || 0}/{row.lowImpactCount || 0}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
