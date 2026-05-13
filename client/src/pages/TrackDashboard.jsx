import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService, userService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { getAssignedAdminTrack } from '../utils/access';
import { getTrackIconSrc } from '../utils/trackIcons';

const TRACK_ICON_BG = {
    'Solutions': 'bg-indigo-600',
    'Delivery': 'bg-blue-600',
    'Learning': 'bg-green-600',
    'GTM/Sales': 'bg-orange-500',
    'Organizational Building & Thought Leadership': 'bg-slate-700',
};

const getTrackBadgeClass = (track) => {
    if (track === 'Solutions') return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
    if (track === 'Delivery') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (track === 'Learning') return 'bg-green-50 text-green-700 border border-green-200';
    if (track === 'GTM/Sales') return 'bg-orange-50 text-orange-700 border border-orange-200';
    return 'bg-slate-50 text-slate-700 border border-slate-200';
};

const getTrackShortLabel = (track) =>
    track === 'Organizational Building & Thought Leadership' ? 'Thought Leadership' : track;

export default function TrackDashboard() {
    const user = useAuthStore((s) => s.user);
    const track = getAssignedAdminTrack(user);

    const [stats, setStats] = useState({ total: 0, published: 0, live: 0, drafts: 0, finished: 0, cancelled: 0 });
    const [pendingApprovals, setPendingApprovals] = useState([]);
    const [recentSubmissions, setRecentSubmissions] = useState([]);
    const [liveContributions, setLiveContributions] = useState([]);
    const [topContributors, setTopContributors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchDashboard = useCallback(async () => {
        if (!track) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const firstRes = await pocService.getAll({ page: 1, limit: 100, track });
            let all = firstRes.data.pocs || [];
            const pages = firstRes.data.pagination?.pages || 1;
            for (let page = 2; page <= pages; page += 1) {
                const res = await pocService.getAll({ page, limit: 100, track });
                all = all.concat(res.data.pocs || []);
            }

            setStats({
                total: all.length,
                published: all.filter((p) => p.status === 'published').length,
                live: all.filter((p) => p.status === 'live').length,
                drafts: all.filter((p) => p.status === 'draft').length,
                finished: all.filter((p) => p.status === 'finished').length,
                cancelled: all.filter((p) => p.status === 'cancelled').length,
            });

            const [draftRes, publishedRes, liveRes, lbRes] = await Promise.all([
                pocService.getAll({ page: 1, limit: 5, track, status: 'draft' }),
                pocService.getAll({ page: 1, limit: 5, track, status: 'published' }),
                pocService.getAll({ page: 1, limit: 5, track, status: 'live' }),
                userService.getLeaderboard({ limit: 5, sortBy: 'credits', track }),
            ]);

            setPendingApprovals(
                [...(draftRes.data.pocs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            );
            setRecentSubmissions(
                [...(publishedRes.data.pocs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            );
            setLiveContributions(
                [...(liveRes.data.pocs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            );
            setTopContributors(lbRes.data?.leaderboard || []);
        } catch {
            setError('Failed to load track dashboard');
        } finally {
            setLoading(false);
        }
    }, [track]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

    if (!track) {
        return (
            <Card hover={false} className="p-8 text-center">
                <h2 className="text-lg font-semibold text-charcoal-800">Track Dashboard Unavailable</h2>
                <p className="text-charcoal-500 mt-1">This dashboard is available only for configured subadmin accounts.</p>
            </Card>
        );
    }

    const trackIconBg = TRACK_ICON_BG[track] || 'bg-terracotta-600';

    return (
        <div className="space-y-8">
            {/* Banner */}
            <div className="rounded-3xl bg-gradient-to-br from-terracotta-900 via-terracotta-700 to-coral-600 p-6 sm:p-8 text-white shadow-lg">
                <h1 className="text-2xl sm:text-3xl font-bold">{getTrackShortLabel(track)} Track Dashboard</h1>
                <p className="text-white/85 mt-1">
                    Hello {user?.name?.split(' ')[0] || 'there'}, here is your track-specific contribution pulse.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mt-6">
                    {[
                        { label: 'Total', count: stats.total, status: 'all' },
                        { label: 'Published', count: stats.published, status: 'published' },
                        { label: 'Live', count: stats.live, status: 'live' },
                        { label: 'Draft', count: stats.drafts, status: 'draft' },
                        { label: 'Finished', count: stats.finished, status: 'finished' },
                        { label: 'Cancelled', count: stats.cancelled, status: 'cancelled' },
                    ].map(({ label, count, status }) => (
                        <Link
                            key={status}
                            to={`/pocs?track=${encodeURIComponent(track)}&status=${status}`}
                            className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[88px] flex flex-col"
                        >
                            <p className="text-xs uppercase tracking-wide text-white/75">{label}</p>
                            <p className="text-3xl font-bold mt-auto">{count}</p>
                        </Link>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Recent Submissions */}
                <Card hover={false} className="p-6">
                    <div className="mb-1">
                        <h2 className="text-base font-semibold text-charcoal-800">Recent Submissions</h2>
                        <p className="text-sm text-charcoal-500">Latest published contributions in this track.</p>
                    </div>
                    <div className="mt-4">
                        {recentSubmissions.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">No published contributions yet.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-[1fr_144px_76px] gap-x-3 items-end">
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Track</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200 text-right">Interested</span>
                                    {recentSubmissions.map((poc) => (
                                        <Fragment key={poc._id}>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                                <div className={`h-8 w-8 rounded-lg ${trackIconBg} flex items-center justify-center shrink-0`}>
                                                    {getTrackIconSrc(track) ? (
                                                        <img src={getTrackIconSrc(track)} alt="" className="h-4 w-4 object-contain brightness-0 invert" />
                                                    ) : (
                                                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    )}
                                                </div>
                                                <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                            </Link>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center py-2.5 border-b border-sand-100 hover:bg-sand-50 transition-colors">
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getTrackBadgeClass(poc.track)}`}>
                                                    {getTrackShortLabel(poc.track)}
                                                </span>
                                            </Link>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center justify-end gap-1 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-r-lg -mr-2 pr-2 transition-colors">
                                                <svg className="h-3.5 w-3.5 text-charcoal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                                </svg>
                                                <span className="text-sm font-semibold text-charcoal-700">{poc.votesCount || 0}</span>
                                            </Link>
                                        </Fragment>
                                    ))}
                                </div>
                                {stats.published > recentSubmissions.length && (
                                    <div className="mt-3 text-center">
                                        <Link
                                            to={`/pocs?track=${encodeURIComponent(track)}&status=published`}
                                            className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700 hover:underline"
                                        >
                                            View all {stats.published} published contributions →
                                        </Link>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </Card>

                {/* Live Contributions */}
                <Card hover={false} className="p-6">
                    <div className="mb-1">
                        <h2 className="text-base font-semibold text-charcoal-800">Live Contributions</h2>
                        <p className="text-sm text-charcoal-500">Contributions currently active in this track.</p>
                    </div>
                    <div className="mt-4">
                        {liveContributions.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">No live contributions at the moment.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-end">
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Point of Contact</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200 text-right">Working</span>
                                    {liveContributions.map((poc) => (
                                        <Fragment key={poc._id}>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                                                <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                            </Link>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center py-2.5 border-b border-sand-100 hover:bg-sand-50 transition-colors px-2">
                                                <span className="text-xs text-charcoal-600 truncate max-w-[120px]">
                                                    {poc.pointOfContact || <span className="text-charcoal-400 italic">—</span>}
                                                </span>
                                            </Link>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center justify-end gap-1 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-r-lg -mr-2 pr-2 transition-colors">
                                                <svg className="h-3.5 w-3.5 text-charcoal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                                </svg>
                                                <span className="text-sm font-semibold text-charcoal-700">
                                                    {(poc.approvedUsers || []).length}
                                                </span>
                                            </Link>
                                        </Fragment>
                                    ))}
                                </div>
                                {stats.live > liveContributions.length && (
                                    <div className="mt-3 text-center">
                                        <Link
                                            to={`/pocs?track=${encodeURIComponent(track)}&status=live`}
                                            className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700 hover:underline"
                                        >
                                            View all {stats.live} live contributions →
                                        </Link>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </Card>

            {/* Pending Approvals */}
            <Card hover={false} className="p-6">
                <div className="mb-1">
                    <h2 className="text-base font-semibold text-charcoal-800">Pending Approvals</h2>
                    <p className="text-sm text-charcoal-500">Draft contributions in this track awaiting review.</p>
                </div>
                <div className="mt-4">
                    {pendingApprovals.length === 0 ? (
                        <p className="text-sm text-charcoal-400 py-6 text-center">No contributions pending approval.</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-[1fr_144px] gap-x-3 items-end">
                                <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Track</span>
                                {pendingApprovals.map((poc) => (
                                    <Fragment key={poc._id}>
                                        <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                            <div className={`h-8 w-8 rounded-lg ${trackIconBg} flex items-center justify-center shrink-0`}>
                                                {getTrackIconSrc(track) ? (
                                                    <img src={getTrackIconSrc(track)} alt="" className="h-4 w-4 object-contain brightness-0 invert" />
                                                ) : (
                                                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                )}
                                            </div>
                                            <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                        </Link>
                                        <Link to={`/pocs/${poc._id}`} className="flex items-center py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-r-lg -mr-2 pr-2 transition-colors">
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getTrackBadgeClass(poc.track)}`}>
                                                {getTrackShortLabel(poc.track)}
                                            </span>
                                        </Link>
                                    </Fragment>
                                ))}
                            </div>
                            {stats.drafts > pendingApprovals.length && (
                                <div className="mt-3 text-center">
                                    <Link
                                        to={`/pocs?track=${encodeURIComponent(track)}&status=draft`}
                                        className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700 hover:underline"
                                    >
                                        View all {stats.drafts} draft contributions →
                                    </Link>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Card>

            {/* Top 5 Users by Credits */}
            <Card hover={false} className="p-6">
                <div className="flex items-center gap-2 mb-5">
                    <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 000 4.5h9a2.25 2.25 0 000-4.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.798 49.798 0 00-6.093-.377.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" />
                    </svg>
                    <h2 className="text-lg font-semibold text-charcoal-800">
                        Top 5 Users by Credits — {getTrackShortLabel(track)}
                    </h2>
                </div>
                {topContributors.length === 0 ? (
                    <p className="text-sm text-charcoal-400">No credit data available yet for this track.</p>
                ) : (
                    <div className="space-y-2.5">
                        {topContributors.map((row, idx) => (
                            <div
                                key={row.user?._id || idx}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-sand-200 bg-sand-50/50"
                            >
                                <span className="w-6 shrink-0 text-sm font-bold text-charcoal-800">{idx + 1}</span>
                                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-terracotta-400 to-terracotta-600 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-white">{(row.user?.name || 'U').charAt(0).toUpperCase()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-charcoal-800 truncate">{row.user?.name || 'Unknown'}</p>
                                    <p className="text-xs text-charcoal-400 truncate">{row.user?.email || ''}</p>
                                </div>
                                <p className="text-sm font-bold text-charcoal-700 shrink-0">{Number(row.totalScore || 0).toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
            </div>
        </div>
    );
}
