import { useCallback, useEffect, useState } from 'react';
import { userService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

export default function MyCredits() {
    const [summary, setSummary] = useState({ totalCredits: 0, finishedContributions: 0, tracksContributed: 0 });
    const [tracks, setTracks] = useState([]);
    const [creditRules, setCreditRules] = useState({ High: 10, Medium: 7, Low: 5 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchCredits = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await userService.getMyCredits();
            setSummary(res.data?.summary || { totalCredits: 0, finishedContributions: 0, tracksContributed: 0 });
            setTracks(res.data?.tracks || []);
            setCreditRules(res.data?.creditRules || { High: 10, Medium: 7, Low: 5 });
        } catch {
            setError('Failed to load your credits');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredits();
    }, [fetchCredits]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchCredits} />;

    return (
        <div className="space-y-5">
            <Card hover={false} className="p-5">
                <h1 className="text-2xl sm:text-3xl font-bold text-charcoal-800">My Credits</h1>
                <p className="text-sm text-charcoal-500 mt-1">
                    Base impact rules: High {creditRules.High}, Medium {creditRules.Medium}, Low {creditRules.Low}. Credits gained use harmonic with hours spent.
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-violet-700">Total Credits</p>
                        <p className="mt-1 text-2xl font-bold text-violet-700">{Number(summary.totalCredits || 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-emerald-700">Finished Contributions</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{summary.finishedContributions || 0}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-amber-700">Tracks Contributed</p>
                        <p className="mt-1 text-2xl font-bold text-amber-700">{summary.tracksContributed || 0}</p>
                    </div>
                </div>
            </Card>

            <Card hover={false} className="p-5">
                <h2 className="text-lg font-semibold text-charcoal-800">Credits by Track</h2>
                {tracks.length === 0 ? (
                    <p className="mt-3 text-sm text-charcoal-500">No approved finished contributions yet.</p>
                ) : (
                    <div className="mt-4 overflow-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-charcoal-500 border-b border-sand-200">
                                    <th className="py-2 pr-3">Track</th>
                                    <th className="py-2 pr-3">Credits</th>
                                    <th className="py-2 pr-3">Finished</th>
                                    <th className="py-2">Impact Mix (H/M/L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tracks.map((row) => (
                                    <tr key={row.track} className="border-b border-sand-100 last:border-0">
                                        <td className="py-2 pr-3">
                                            <Badge color="sand">{row.track}</Badge>
                                        </td>
                                        <td className="py-2 pr-3 font-semibold text-violet-700">{Number(row.credits || 0).toFixed(2)}</td>
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
