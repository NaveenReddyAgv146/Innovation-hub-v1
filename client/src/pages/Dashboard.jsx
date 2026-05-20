import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService, userService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { getThumbnailGradient } from '../utils/thumbnailGradient';
import { getTrackIconSrc } from '../utils/trackIcons';
import { hasTrackDashboardAccess, getAssignedAdminTrack } from '../utils/access';
import { COMPANY_LOGO_FULL_URL, COMPANY_NAME,COMPANY_LOGO_Dashboard } from '../config/branding';

const AVAILABILITY_UNITS = ['per day', 'per week'];

const TRACK_COLORS = {
    'Solutions': '#314797',
    'Delivery': '#0070c0',
    'GTM/Sales': '#9706a2',
    'Organizational Building & Thought Leadership': '#6da353',
    'Learning': '#eb7b1e',
};

const STATUS_BAR_COLORS = {
    published: '#314797',
    live: '#0070c0',
    draft: '#eb7b1e',
    finished: '#6da353',
    cancelled: '#db3a35',
};

const TRACKS = [
    { key: 'Solutions', label: 'Solutions', icon: getTrackIconSrc('Solutions'), ringColor: '#314797', barClass: 'bg-indigo-600', color: '#314797' },
    { key: 'Delivery', label: 'Delivery', icon: getTrackIconSrc('Delivery'), ringColor: '#0070c0', barClass: 'bg-blue-600', color: '#0070c0' },
    { key: 'Learning', label: 'Learning', icon: getTrackIconSrc('Learning'), ringColor: '#eb7b1e', barClass: 'bg-green-600', color: '#eb7b1e' },
    { key: 'GTM/Sales', label: 'GTM/Sales', icon: getTrackIconSrc('GTM/Sales'), ringColor: '#9706a2', barClass: 'bg-orange-500', color: '#9706a2' },
    { key: 'Organizational Building & Thought Leadership', label: 'Thought Leadership', icon: getTrackIconSrc('Organizational Building & Thought Leadership'), ringColor: '#6da353', barClass: 'bg-slate-700', color: '#6da353' },
];
const buildEmptyTrackStats = () =>
    TRACKS.reduce((acc, track) => {
        acc[track.key] = { published: 0, live: 0, draft: 0, finished: 0, cancelled: 0, total: 0 };
        return acc;
    }, {});

const getHubStatusLabel = (status) => {
    if (status === 'live') return 'Live';
    if (status === 'published') return 'In Progress';
    if (status === 'finished') return 'Finished';
    return status;
};

export default function Dashboard() {
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const isViewer = user?.role === 'viewer';
    const adminTrack = getAssignedAdminTrack(user);
    const isTrackAdmin = !!adminTrack;
    const [stats, setStats] = useState({ total: 0, published: 0, live: 0, drafts: 0, finished: 0, cancelled: 0, interested: 0 });
    const [recentPocs, setRecentPocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [allPocs, setAllPocs] = useState([]);
    const [viewerInvolvedPocs, setViewerInvolvedPocs] = useState([]);
    const [trackStats, setTrackStats] = useState(buildEmptyTrackStats());
    const [topUsersByCredits, setTopUsersByCredits] = useState([]);
    const [myCreditsData, setMyCreditsData] = useState(null);
    const [fullLeaderboard, setFullLeaderboard] = useState([]);
    const [viewerHubTab, setViewerHubTab] = useState('involved');
    const [pendingApprovalsList, setPendingApprovalsList] = useState([]);

    const [publishingId, setPublishingId] = useState(null);

    const leaderboardSectionRef = useRef(null);

    const [interestModalOpen, setInterestModalOpen] = useState(false);
    const [interestingPoc, setInterestingPoc] = useState(null);
    const [availabilityValue, setAvailabilityValue] = useState('');
    const [availabilityUnit, setAvailabilityUnit] = useState('per week');
    const [voting, setVoting] = useState(false);
    const [interestError, setInterestError] = useState('');

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const loadAllPages = async (params = {}) => {
                const firstRes = await pocService.getAll({ page: 1, limit: 100, ...params });
                const firstData = firstRes.data;
                let items = firstData.pocs || [];
                const pages = firstData.pagination?.pages || 1;
                for (let page = 2; page <= pages; page += 1) {
                    const res = await pocService.getAll({ page, limit: 100, ...params });
                    items = items.concat(res.data.pocs || []);
                }
                return items;
            };

            let allTrackPocs = [];
            if (isViewer) {
                const defaultVisible = await loadAllPages();
                const liveVisible = await loadAllPages({ status: 'live' });
                const merged = new Map();
                [...defaultVisible, ...liveVisible].forEach((item) => {
                    if (item?._id) merged.set(item._id, item);
                });
                allTrackPocs = Array.from(merged.values());
            } else {
                const [allResult, draftResult] = await Promise.all([
                    loadAllPages(),
                    loadAllPages({ status: 'draft' }),
                ]);
                allTrackPocs = allResult;
                setPendingApprovalsList(
                    [...draftResult].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                );
            }

            const total = allTrackPocs.length;
            const pocs = [...allTrackPocs]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5);

            const computedTrackStats = buildEmptyTrackStats();
            let published = 0;
            let live = 0;
            let draft = 0;
            let finished = 0;
            let cancelled = 0;
            let interested = 0;
            allTrackPocs.forEach((poc) => {
                if (poc.status === 'published') published += 1;
                if (poc.status === 'live') live += 1;
                if (poc.status === 'draft') draft += 1;
                if (poc.status === 'finished') finished += 1;
                if (poc.status === 'cancelled') cancelled += 1;
                if (poc.hasVoted) interested += 1;
                const bucket = computedTrackStats[poc.track];
                if (!bucket) return;
                bucket.total += 1;
                if (poc.status === 'published') bucket.published += 1;
                else if (poc.status === 'live') bucket.live += 1;
                else if (poc.status === 'draft') bucket.draft += 1;
                else if (poc.status === 'finished') bucket.finished += 1;
                else if (poc.status === 'cancelled') bucket.cancelled += 1;
            });

            setStats({ total, published, live, drafts: draft, finished, cancelled, interested });
            setRecentPocs(pocs);
            setTrackStats(computedTrackStats);
            setAllPocs(allTrackPocs);

            if (isViewer) {
                const firstInvolvedPageRes = await pocService.getAll({ page: 1, limit: 100, involved: true });
                const firstInvolvedPageData = firstInvolvedPageRes.data;
                let allInvolved = firstInvolvedPageData.pocs || [];
                const involvedPages = firstInvolvedPageData.pagination?.pages || 1;
                for (let page = 2; page <= involvedPages; page += 1) {
                    const res = await pocService.getAll({ page, limit: 100, involved: true });
                    allInvolved = allInvolved.concat(res.data.pocs || []);
                }
                setViewerInvolvedPocs(allInvolved);

                const [creditsRes, lbRes] = await Promise.all([
                    userService.getMyCredits(),
                    userService.getLeaderboard({ limit: 100, sortBy: 'credits', track: 'all' }),
                ]);
                setMyCreditsData(creditsRes.data);
                const lb = lbRes.data?.leaderboard || [];
                setFullLeaderboard(lb);
                setTopUsersByCredits(lb.slice(0, 5));
            } else {
                setViewerInvolvedPocs([]);
                const leaderboardRes = await userService.getLeaderboard({ limit: 5, sortBy: 'credits', track: 'all' });
                setTopUsersByCredits(leaderboardRes.data?.leaderboard || []);
            }
        } catch {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [isViewer]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

    const handleMarkInterest = (poc) => {
        setInterestingPoc(poc);
        setAvailabilityValue('');
        setAvailabilityUnit('per week');
        setInterestError('');
        setInterestModalOpen(true);
    };

    const confirmInterest = async () => {
        if (!interestingPoc?._id || !availabilityValue.trim()) {
            setInterestError('Please enter how many hours you are free');
            return;
        }
        setVoting(true);
        setInterestError('');
        try {
            await pocService.upvote(interestingPoc._id, { availabilityValue, availabilityUnit });
            setAllPocs((prev) =>
                prev.map((p) => p._id === interestingPoc._id ? { ...p, hasVoted: true, votesCount: (p.votesCount || 0) + 1 } : p)
            );
            setInterestModalOpen(false);
            setInterestingPoc(null);
            setAvailabilityValue('');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data?.detail === 'string' && data.detail) || (typeof data?.message === 'string' && data.message) || 'Failed to mark interest';
            setInterestError(msg);
        } finally {
            setVoting(false);
        }
    };

    // ── Viewer-specific derivations ───────────────────────────────────────────
    const currentUserId = user?._id || user?.id;
    const currentUserEmail = String(user?.email || '').trim().toLowerCase();
    const currentUserName = String(user?.name || '').trim().toLowerCase();
    const firstName = user?.name?.split(' ')[0] || 'there';

    const myRankEntry = fullLeaderboard.find((r) => String(r.user?._id) === String(currentUserId));
    const myRank = myRankEntry?.rank ?? null;
    const myTotalScore = Number(myCreditsData?.summary?.totalScore ?? 0);

    const liveContribCount = viewerInvolvedPocs.filter((p) => p.status === 'live').length;
    const activeInvolvementsCount = viewerInvolvedPocs.filter((p) => ['published', 'live'].includes(p.status)).length;
    const completedCount = viewerInvolvedPocs.filter((p) => p.status === 'finished').length;

    const discoverPocs = allPocs.filter((poc) => poc.status === 'published' && !poc.hasVoted).slice(0, 3);

    const pocContactPocs = allPocs.filter((poc) => {
        const poc_poc = String(poc.pointOfContact || '').trim().toLowerCase();
        return poc_poc &&
            (poc_poc === currentUserEmail || poc_poc === currentUserName) &&
            !['finished', 'cancelled'].includes(poc.status);
    });

    const livePocs = viewerInvolvedPocs.filter((p) => p.status === 'live').slice(0, 3);

    const myTrackCredits = TRACKS.map((t) => {
        const trackData = (myCreditsData?.tracks || []).find((r) => r.track === t.key);
        return { ...t, score: Number(trackData?.totalScore || 0) };
    });
    const maxTrackScore = Math.max(1, ...myTrackCredits.map((t) => t.score));

    const isInTop5 = topUsersByCredits.some((r) => String(r.user?._id) === String(currentUserId));
    const rank5Score = Number(topUsersByCredits[4]?.totalScore || 0);
    const creditsToTop5 = !isInTop5 && myRank !== null && myRank > 5
        ? Math.max(0, rank5Score - myTotalScore + 0.01)
        : null;

    // ── Viewer Dashboard ──────────────────────────────────────────────────────
    if (isViewer) {
        const hubItems = viewerHubTab === 'involved' ? livePocs : pocContactPocs.slice(0, 3);

        return (
            <div className="space-y-8">
                {/* Welcome + Stat Cards Banner */}
                <div className="rounded-3xl p-6 sm:p-8 text-white shadow-lg" style={{background: 'linear-gradient(135deg, #0d1540 0%, #1a3580 50%, #5c1515 100%)'}}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-4xl font-bold">Welcome back, {firstName}! 👋</h1>
                            <p className="text-white/85 mt-1">Explore new ideas, contribute to innovation and earn recognition.</p>
                        </div>
                        <div className="shrink-0 hidden sm:flex items-center bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-2">
                            <img src={COMPANY_LOGO_Dashboard} alt={COMPANY_NAME} className="h-8 w-auto object-contain" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mt-6">
                        {/* My Rank */}
                        <button type="button" onClick={() => leaderboardSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="text-left rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[104px] flex flex-col cursor-pointer">
                            <p className="text-xs uppercase tracking-wide text-white/75 leading-tight">My Rank</p>
                            <p className="text-3xl font-bold mt-auto leading-none">{myRank !== null ? `#${myRank}` : '-'}</p>
                            <p className="text-xs text-white/60 mt-1">Overall leaderboard rank</p>
                        </button>

                        {/* My Credits */}
                        <Link to="/my-credits" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[104px] flex flex-col">
                            <p className="text-xs uppercase tracking-wide text-white/75 leading-tight">My Credits</p>
                            <p className="text-3xl font-bold mt-auto leading-none">{myTotalScore.toFixed(2)}</p>
                            <p className="text-xs text-white/60 mt-1">VIBE score</p>
                        </Link>

                        {/* Live VIBEs */}
                        <Link to="/pocs?involved=true&status=live" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[104px] flex flex-col">
                            <p className="text-xs uppercase tracking-wide text-white/75 leading-tight">Live VIBEs</p>
                            <p className="text-3xl font-bold mt-auto leading-none">{liveContribCount}</p>
                            <p className="text-xs text-white/60 mt-1">You are part of</p>
                        </Link>

                        {/* Active Involvements */}
                        <Link to="/pocs?involved=true" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[104px] flex flex-col">
                            <p className="text-xs uppercase tracking-wide text-white/75 leading-tight">Active Involvements</p>
                            <p className="text-3xl font-bold mt-auto leading-none">{activeInvolvementsCount}</p>
                            <p className="text-xs text-white/60 mt-1">Needs your attention</p>
                        </Link>

                        {/* Completed VIBEs */}
                        <Link to="/pocs?involved=true&status=finished" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors min-h-[104px] flex flex-col">
                            <p className="text-xs uppercase tracking-wide text-white/75 leading-tight">Completed VIBE</p>
                            <p className="text-3xl font-bold mt-auto leading-none">{completedCount}</p>
                            <p className="text-xs text-white/60 mt-1">VIBE completed</p>
                        </Link>
                    </div>
                </div>

                {/* My Workspace | Discover Contributions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* My Workspace */}
                    <Card hover={false} className="p-6">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-semibold text-charcoal-800">My Workspace</h2>
                            <Link
                                to={viewerHubTab === 'involved' ? '/pocs?involved=true&status=live' : '/pocs?pocContact=true'}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                View all
                            </Link>
                        </div>
                        <p className="text-sm text-charcoal-500 mb-5">Things that need your attention.</p>

                        {/* Tabs */}
                        <div className="flex border-b border-sand-200 mb-4 gap-1">
                            <button
                                type="button"
                                onClick={() => setViewerHubTab('involved')}
                                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${viewerHubTab === 'involved' ? 'border-blue-600 text-blue-600' : 'border-transparent text-charcoal-500 hover:text-charcoal-700'}`}
                            >
                                Live ({liveContribCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewerHubTab('poc')}
                                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${viewerHubTab === 'poc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-charcoal-500 hover:text-charcoal-700'}`}
                            >
                                Point of Contact ({pocContactPocs.length})
                            </button>
                        </div>

                        {hubItems.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">
                                {viewerHubTab === 'involved' ? 'No live VIBEs yet.' : 'No active VIBEs assigned to you as point of contact.'}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {hubItems.map((poc) => {
                                    const statusLabel = getHubStatusLabel(poc.status);
                                    const isLive = poc.status === 'live';
                                    return (
                                        <Link
                                            key={poc._id}
                                            to={`/pocs/${poc._id}`}
                                            className="flex items-center gap-3 px-3 py-3 rounded border border-transparent hover:border-sand-200 hover:bg-sand-50 transition-colors group"
                                        >
                                            <div className="h-10 w-10 rounded bg-sand-100 flex items-center justify-center shrink-0 p-[5px]" style={{background: TRACK_COLORS[poc.track] || '#314797'}}>
                                                {getTrackIconSrc(poc.track) ? (
                                                    <img src={getTrackIconSrc(poc.track)} alt="" className="h-5 w-5 object-contain opacity-60" style={{mixBlendMode:'screen'}} />
                                                ) : (
                                                    <svg className="h-5 w-5 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-semibold text-charcoal-800 truncate">{poc.title}</p>
                                                    {poc.track && (
                                                        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sand-100 text-charcoal-600">{poc.track.replace('Organizational Building & Thought Leadership', 'Thought Leadership')}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-charcoal-400 mt-0.5">
                                                    Status: {statusLabel} &bull; Role: Contributor
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${isLive ? 'bg-emerald-100 text-emerald-700' : poc.status === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-sand-100 text-charcoal-600'}`}>
                                                {statusLabel}
                                            </span>
                                            <svg className="h-4 w-4 text-charcoal-300 shrink-0 group-hover:text-charcoal-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                            </svg>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {/* Discover VIBEs */}
                    <Card hover={false} className="p-6">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-semibold text-charcoal-800">Discover VIBEs</h2>
                            <Link to="/pocs?status=published" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</Link>
                        </div>
                        <p className="text-sm text-charcoal-500 mb-5">Newly published opportunities. Mark interest to get involved.</p>

                        {discoverPocs.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">No new VIBEs to discover right now.</p>
                        ) : (
                            <div className="space-y-3">
                                {discoverPocs.map((poc) => (
                                    <div key={poc._id} className="flex items-center gap-4 rounded p-2 -mx-2 hover:bg-sand-50 transition-colors group">
                                        <Link to={`/pocs/${poc._id}`} className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{background: TRACK_COLORS[poc.track] || '#314797'}}>
                                                {getTrackIconSrc(poc.track) ? (
                                                    <img src={getTrackIconSrc(poc.track)} alt="" className="h-8 w-8 object-contain" style={{mixBlendMode:'screen'}} />
                                                ) : (
                                                    <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-charcoal-800 truncate group-hover:text-blue-700 transition-colors">{poc.title}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                    {poc.track && (
                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{poc.track.replace('Organizational Building & Thought Leadership', 'Thought Leadership')}</span>
                                                    )}
                                                    {(poc.techStack || []).slice(0, 2).map((t) => (
                                                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-sand-100 text-charcoal-600">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </Link>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex items-center gap-1 text-xs text-charcoal-500">
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                                </svg>
                                                {poc.votesCount || 0} Interested
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleMarkInterest(poc)}
                                                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap"
                                            >
                                                Mark Interest
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Track Overview */}
                <div>
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-charcoal-800">Track Overview</h2>
                        <p className="text-sm text-charcoal-500">Published, live, and finished VIBE counts by track.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
                        {TRACKS.map((track) => {
                            const ts = trackStats[track.key] || { published: 0, live: 0, finished: 0, total: 0 };
                            const publishedPct = ts.total ? Math.round((ts.published / ts.total) * 100) : 0;
                            const livePct = ts.total ? Math.round((ts.live / ts.total) * 100) : 0;
                            const finishedPct = ts.total ? Math.round((ts.finished / ts.total) * 100) : 0;
                            const trackParam = encodeURIComponent(track.key);
                            return (
                                <Card
                                    key={track.key}
                                    hover={false}
                                    className="p-5 border-sand-200 cursor-pointer hover:border-terracotta-300 hover:shadow-md transition-all duration-200"
                                    onClick={() => navigate(`/pocs?track=${trackParam}&status=all`)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-base font-semibold text-charcoal-800">{track.label}</p>
                                        <div className="h-10 w-10 rounded flex items-center justify-center shrink-0 p-[5px]" style={{background: track.color}}>
                                            <img src={track.icon} alt="" className="w-full h-full object-contain" style={{mixBlendMode:'screen'}} />
                                        </div>
                                    </div>
                                    <p className="mt-1 text-xs text-charcoal-500">{ts.total} total VIBEs</p>
                                    <div className="mt-5 space-y-3.5">
                                        {[
                                            { label: 'Published', status: 'published', count: ts.published, pct: publishedPct },
                                            { label: 'Live', status: 'live', count: ts.live, pct: livePct },
                                            { label: 'Finished', status: 'finished', count: ts.finished, pct: finishedPct },
                                        ].map(({ label, status, count, pct }) => (
                                            <div
                                                key={label}
                                                className="space-y-1 cursor-pointer group/bar"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/pocs?track=${trackParam}&status=${status}`); }}
                                            >
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-charcoal-600 group-hover/bar:text-charcoal-900 transition-colors">{label}</span>
                                                    <span className="font-medium text-charcoal-700">{count}</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-sand-100 overflow-hidden group-hover/bar:h-2.5 transition-all">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_BAR_COLORS[status] }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Top 5 Leaderboard | Credits by Track */}
                <div ref={leaderboardSectionRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top 5 Users by Credits */}
                    <Card hover={false} className="p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-semibold text-charcoal-800 flex items-center gap-2">
                                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 000 4.5h9a2.25 2.25 0 000-4.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.798 49.798 0 00-6.093-.377.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" />
                                </svg>
                                Top 5 Users by Credits
                            </h2>
                            {/* <Link to="/admin/leaderboard" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View full leaderboard</Link> */}
                        </div>
                        {topUsersByCredits.length === 0 ? (
                            <p className="text-sm text-charcoal-400">No credit data available yet.</p>
                        ) : (
                            <div className="space-y-2.5">
                                {topUsersByCredits.map((row, idx) => {
                                    const isMe = String(row.user?._id) === String(currentUserId);
                                    return (
                                        <div
                                            key={row.user?._id || idx}
                                            className={`flex items-center gap-3 px-4 py-3 rounded border transition-colors ${isMe ? 'border-blue-200 bg-blue-50' : 'border-sand-200 bg-sand-50/50'}`}
                                        >
                                            <span className="w-6 shrink-0 text-sm font-bold text-charcoal-800">
                                                {idx + 1}
                                            </span>
                                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-terracotta-400 to-terracotta-600 flex items-center justify-center shrink-0 p-[5px]" style={{background:'#2e6fff'}}>
                                                <span className="text-xs font-bold text-white">{(row.user?.name || 'U').charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold truncate ${isMe ? 'text-blue-800' : 'text-charcoal-800'}`}>
                                                    {isMe ? `You (${user?.name})` : (row.user?.name || 'Unknown')}
                                                </p>
                                                <p className="text-xs text-charcoal-400 truncate">{row.user?.email || ''}</p>
                                            </div>
                                            <p className={`text-sm font-bold shrink-0 ${isMe ? 'text-blue-700' : 'text-charcoal-700'}`}>
                                                {Number(row.totalScore || 0).toFixed(2)}
                                            </p>
                                        </div>
                                    );
                                })}
                                {!isInTop5 && myRankEntry && (
                                    <div className="flex items-center gap-3 px-3 py-2.5 rounded border border-blue-200 bg-blue-50">
                                        <span className="w-6 shrink-0 text-sm font-bold text-blue-500">#{myRank}</span>
                                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0 p-[5px]" style={{background:'#2e6fff'}}>
                                            <span className="text-xs font-bold text-white">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-blue-800 truncate">You ({user?.name})</p>
                                            <p className="text-xs text-charcoal-400 truncate">{user?.email || ''}</p>
                                        </div>
                                        <p className="text-sm font-bold text-blue-700 shrink-0">{myTotalScore.toFixed(2)}</p>
                                    </div>
                                )}
                                {creditsToTop5 !== null && (
                                    <div className="mt-2 flex items-center gap-2 rounded border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-charcoal-600">
                                        <span>You're just</span>
                                        <span className="font-semibold text-charcoal-800">{creditsToTop5.toFixed(2)}</span>
                                        <span>credits away from Top 5! 🚀</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Credits by Track */}
                    <Card hover={false} className="p-6 flex flex-col">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold text-charcoal-800">Credits by Track (Till Date)</h2>
                            <p className="text-sm text-charcoal-500">Your earned credits per track.</p>
                        </div>
                        {myTrackCredits.every((t) => t.score === 0) ? (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-charcoal-400">No track credits earned yet.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="flex gap-2">
                                    {/* Y-axis labels */}
                                    <div className="flex flex-col justify-between items-end shrink-0 w-8" style={{ height: '176px' }}>
                                        {[maxTrackScore, maxTrackScore * 0.75, maxTrackScore * 0.5, maxTrackScore * 0.25, 0].map((val, i) => (
                                            <span key={i} className="text-[11px] leading-none text-charcoal-400">{val === 0 ? '0' : val.toFixed(1)}</span>
                                        ))}
                                    </div>
                                    {/* Chart area */}
                                    <div className="flex-1 flex flex-col">
                                        <div className="relative h-44">
                                            {[100, 75, 50, 25, 0].map((pct) => (
                                                <div key={pct} className="absolute inset-x-0 border-t border-sand-200" style={{ top: `${100 - pct}%` }} />
                                            ))}
                                            <div className="absolute inset-0 flex items-end gap-1 px-2">
                                                {myTrackCredits.map((t) => {
                                                    const heightPct = Math.max(2, (t.score / maxTrackScore) * 100);
                                                    return (
                                                        <div key={t.key} className="flex-1 h-full flex items-end justify-center">
                                                            <div
                                                                className="relative group/bar w-12 rounded-t-md cursor-default transition-opacity duration-150 hover:opacity-75"
                                                                style={{ height: `${heightPct}%`, background: TRACK_COLORS[t.key] || '#314797' }}
                                                            >
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-charcoal-800 text-white text-xs font-medium rounded-lg px-2.5 py-2 whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-30 shadow-xl">
                                                                    <p className="font-semibold mb-0.5">{t.label}</p>
                                                                    <p className="text-white/75">{t.score.toFixed(2)} credits</p>
                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-px w-2 h-2 bg-charcoal-800 rotate-45" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {/* X-axis labels */}
                                        <div className="flex gap-1 px-2 mt-2">
                                            {myTrackCredits.map((t) => (
                                                <div key={t.key} className="flex-1 text-center">
                                                    <span className="text-[11px] font-medium text-charcoal-500 leading-tight">{t.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Mark Interest Modal */}
                <Modal isOpen={interestModalOpen} onClose={() => !voting && setInterestModalOpen(false)} title="Share Your Availability" size="sm">
                    {interestingPoc && (
                        <div className="space-y-4">
                            <p className="text-sm text-charcoal-600">
                                Let the team know how much time you can contribute to <span className="font-semibold text-charcoal-800">{interestingPoc.title}</span>.
                            </p>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-charcoal-700">Please enter the number of hours</label>
                                <div className="flex gap-3">
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="8"
                                        value={availabilityValue}
                                        onChange={(e) => setAvailabilityValue(e.target.value)}
                                        className="flex-1"
                                    />
                                    <select
                                        value={availabilityUnit}
                                        onChange={(e) => setAvailabilityUnit(e.target.value)}
                                        className="w-36 rounded border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                                    >
                                        {AVAILABILITY_UNITS.map((unit) => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-xs text-charcoal-500">Example: 8 hours per week</p>
                                {interestError && <p className="text-xs text-red-600">{interestError}</p>}
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" disabled={voting} onClick={() => setInterestModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="button" size="sm" loading={voting} onClick={confirmInterest}>
                                    Mark Interested
                                </Button>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>
        );
    }

    // ── Admin / Developer Dashboard ───────────────────────────────────────────
    const pendingApprovalPocs = pendingApprovalsList.slice(0, 5);

    const recentSubmissions = [...allPocs]
        .filter((p) => p.status === 'published')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

    const trackInterestData = TRACKS.map((track) => {
        const totalInterest = allPocs
            .filter((p) => p.track === track.key)
            .reduce((sum, p) => sum + (p.votesCount || 0), 0);
        const totalPocs = allPocs.filter((p) => p.track === track.key).length;
        return { ...track, totalInterest, totalPocs };
    });
    const maxTrackInterest = Math.max(1, ...trackInterestData.map((t) => t.totalInterest));

    const handlePublishPoc = async (pocId) => {
        setPublishingId(pocId);
        try {
            await pocService.publish(pocId);
            setAllPocs((prev) => prev.map((p) => p._id === pocId ? { ...p, status: 'published' } : p));
            setPendingApprovalsList((prev) => prev.filter((p) => p._id !== pocId));
        } catch { /* ignore */ } finally {
            setPublishingId(null);
        }
    };

    const getStatusBadgeClass = (status) => {
        if (status === 'published') return 'bg-violet-100 text-violet-700';
        if (status === 'live') return 'bg-emerald-100 text-emerald-700';
        if (status === 'finished') return 'bg-green-100 text-green-700';
        if (status === 'draft') return 'bg-amber-100 text-amber-700';
        if (status === 'cancelled') return 'bg-red-100 text-red-700';
        return 'bg-sand-100 text-charcoal-600';
    };

    const getTrackBadgeStyle = (track) => {
        const color = TRACK_COLORS[track] || '#314797';
        return { color, background: color + '20', borderColor: color + '50' };
    };

    const getTrackShortLabel = (track) =>
        track === 'Organizational Building & Thought Leadership' ? 'Thought Leadership' : track;

    return (
        <div className="space-y-8">
            {/* Gradient Banner */}
            <div className="rounded-3xl p-6 sm:p-8 text-white shadow-lg" style={{background: 'linear-gradient(135deg, #0d1540 0%, #1a3580 50%, #5c1515 100%)'}}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
                        <p className="text-white/80 mt-1">Monitor, manage and drive innovation across the organization.</p>
                    </div>
                    <div className="shrink-0 hidden sm:flex items-center bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-2">
                        <img src={COMPANY_LOGO_Dashboard} alt={COMPANY_NAME} className="h-8 w-auto object-contain" />
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mt-6">
                    <Link to="/pocs?status=all" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.total}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Total VIBEs</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#6366f1'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" /></svg>
                        </div>
                    </Link>
                    <Link to="/pocs?status=published" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.published}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Published</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#314797'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                        </div>
                    </Link>
                    <Link to="/pocs?status=live" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.live}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Live</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#0070c0'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                        </div>
                    </Link>
                    <Link to="/pocs?status=draft" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.drafts}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Draft</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#eb7b1e'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </div>
                    </Link>
                    <Link to="/pocs?status=finished" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.finished}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Finished</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#6da353'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                    </Link>
                    <Link to="/pocs?status=cancelled" className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors flex items-center justify-between gap-3">
                        <div>
                            <p className="text-3xl font-bold leading-none">{stats.cancelled}</p>
                            <p className="text-xs font-medium text-white/80 mt-1.5">Cancelled</p>
                        </div>
                        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{background:'#db3a35'}}>
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Track Overview */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-charcoal-800">Track Overview</h2>
                        <p className="text-sm text-charcoal-500">Published, live, draft, finished and cancelled VIBEs by track.</p>
                    </div>
                    <Link to="/pocs" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all tracks</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    {TRACKS.map((track) => {
                        const ts = trackStats[track.key] || { published: 0, live: 0, draft: 0, finished: 0, cancelled: 0, total: 0 };
                        const publishedPct = ts.total ? Math.round((ts.published / ts.total) * 100) : 0;
                        const livePct = ts.total ? Math.round((ts.live / ts.total) * 100) : 0;
                        const draftPct = ts.total ? Math.round((ts.draft / ts.total) * 100) : 0;
                        const finishedPct = ts.total ? Math.round((ts.finished / ts.total) * 100) : 0;
                        const cancelledPct = ts.total ? Math.round((ts.cancelled / ts.total) * 100) : 0;
                        return (
                            <Card
                                key={track.key}
                                hover={false}
                                className="p-4 border-sand-200 cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => navigate(`/pocs?track=${encodeURIComponent(track.key)}&status=all`)}
                            >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div>
                                        <p className="text-sm font-semibold text-charcoal-800">{track.label}</p>
                                        <p className="text-xs text-charcoal-400">{ts.total} Total</p>
                                    </div>
                                    <div className="h-10 w-10 rounded flex items-center justify-center shrink-0 p-[5px]" style={{background: track.color}}>
                                        <img src={track.icon} alt={track.label} className="w-full h-full object-contain" style={{mixBlendMode:'screen'}} />
                                    </div>
                                </div>
                                <div className="mt-4 space-y-2.5">
                                    {[
                                        { label: 'Published', count: ts.published, pct: publishedPct, status: 'published' },
                                        { label: 'Live', count: ts.live, pct: livePct, status: 'live' },
                                        { label: 'Draft', count: ts.draft, pct: draftPct, status: 'draft' },
                                        { label: 'Finished', count: ts.finished, pct: finishedPct, status: 'finished' },
                                        { label: 'Cancelled', count: ts.cancelled, pct: cancelledPct, status: 'cancelled' },
                                    ].map(({ label, count, pct, status }) => (
                                        <div
                                            key={label}
                                            className="space-y-1 cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); navigate(`/pocs?track=${encodeURIComponent(track.key)}&status=${status}`); }}
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-charcoal-600">{label}</span>
                                                <span className="font-medium text-charcoal-700">{count}</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-sand-100 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_BAR_COLORS[status] }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Pending Approvals + Recent Submissions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending Approvals */}
                <Card hover={false} className="p-6">
                    <div className="mb-1">
                        <h2 className="text-base font-semibold text-charcoal-800">Pending Approvals</h2>
                        <p className="text-sm text-charcoal-500">VIBEs that need your review and approval.</p>
                    </div>
                    <div className="mt-4">
                        {pendingApprovalPocs.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">No VIBEs pending approval.</p>
                        ) : isTrackAdmin ? (
                            <>
                            
                            <div className="grid grid-cols-[1fr_144px] gap-x-3 items-end">
                                <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Track</span>
                                {pendingApprovalPocs.map((poc) => (
                                    <Fragment key={poc._id}>
                                        <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2.5 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: TRACK_COLORS[poc.track] || '#314797'}}></span>
                                            <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                        </Link>
                                        <Link to={`/pocs/${poc._id}`} className="flex items-center py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-r-lg -mr-2 pr-2 transition-colors">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full border" style={getTrackBadgeStyle(poc.track)}>
                                                {getTrackShortLabel(poc.track)}
                                            </span>
                                        </Link>
                                    </Fragment>
                                ))}
                            </div>
                            <div className="mt-3 flex justify-end">
                                <Link to="/pocs?status=draft" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all approvals</Link>
                            </div>
                            </>

                            
                        ) : (
                            /* Global admin: title + track + action (Publish only) */
                            <>
                                <div className="grid grid-cols-[1fr_144px_72px] gap-x-3 items-end">
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Track</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Action</span>
                                    {pendingApprovalPocs.map((poc) => (
                                        <Fragment key={poc._id}>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2.5 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: TRACK_COLORS[poc.track] || '#314797'}}></span>
                                                <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                            </Link>
                                            <div className="flex items-center py-2.5 border-b border-sand-100">
                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full border" style={getTrackBadgeStyle(poc.track)}>
                                                    {getTrackShortLabel(poc.track)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-end py-2.5 border-b border-sand-100">
                                                <button
                                                    type="button"
                                                    disabled={publishingId === poc._id}
                                                    onClick={() => handlePublishPoc(poc._id)}
                                                    className="text-center text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
                                                >
                                                    {publishingId === poc._id ? '…' : 'Publish'}
                                                </button>
                                            </div>
                                        </Fragment>
                                    ))}
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <Link to="/admin/idea-reviews" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all approvals</Link>
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                {/* Recent Submissions */}
                <Card hover={false} className="p-6">
                    <div className="mb-1">
                        <h2 className="text-base font-semibold text-charcoal-800">Recent Submissions</h2>
                        <p className="text-sm text-charcoal-500">Latest published VIBEs added to the system.</p>
                    </div>
                    <div className="mt-4">
                        {recentSubmissions.length === 0 ? (
                            <p className="text-sm text-charcoal-400 py-6 text-center">No published VIBEs yet.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-[1fr_144px_76px] gap-x-3 items-end">
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Title</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200">Track</span>
                                    <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide pb-2 border-b border-sand-200 text-right">Interested</span>
                                    {recentSubmissions.map((poc) => (
                                        <Fragment key={poc._id}>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center gap-2.5 min-w-0 py-2.5 border-b border-sand-100 hover:bg-sand-50 rounded-l-lg -ml-2 pl-2 transition-colors">
                                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: TRACK_COLORS[poc.track] || '#314797'}}></span>
                                                <span className="text-sm font-medium text-charcoal-800 truncate">{poc.title}</span>
                                            </Link>
                                            <Link to={`/pocs/${poc._id}`} className="flex items-center py-2.5 border-b border-sand-100 hover:bg-sand-50 transition-colors">
                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full border" style={getTrackBadgeStyle(poc.track)}>
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
                                <div className="mt-3 flex justify-end">
                                    <Link to="/pocs?status=published" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all submissions</Link>
                                </div>
                            </>
                        )}
                    </div>
                </Card>
            </div>

            {/* Top Contributors + Interest Pulse */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Contributors */}
                <Card hover={false} className="p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-semibold text-charcoal-800 flex items-center gap-2">
                            <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 000 4.5h9a2.25 2.25 0 000-4.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.798 49.798 0 00-6.093-.377.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" />
                            </svg>
                            Top 5 Users by Credits
                        </h2>
                    </div>
                    {topUsersByCredits.length === 0 ? (
                        <p className="text-sm text-charcoal-400">No credit data available yet.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {topUsersByCredits.map((row, idx) => (
                                <div
                                    key={row.user?._id || idx}
                                    className="flex items-center gap-3 px-4 py-3 rounded border border-sand-200 bg-sand-50/50 transition-colors"
                                >
                                    <span className="w-6 shrink-0 text-sm font-bold text-charcoal-800">{idx + 1}</span>
                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-terracotta-400 to-terracotta-600 flex items-center justify-center shrink-0 p-[5px]" style={{background:'#2e6fff'}}>
                                        <span className="text-xs font-bold text-white">{(row.user?.name || 'U').charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-charcoal-800 truncate">{row.user?.name || 'Unknown'}</p>
                                        <p className="text-xs text-charcoal-400 truncate">{row.user?.email || ''}</p>
                                    </div>
                                    <p className="text-sm font-bold text-charcoal-700 shrink-0">{Number(row.totalScore || 0).toFixed(2)}</p>
                                </div>
                            ))}
                            <div className="mt-2 flex justify-end">
                                <Link to="/admin/leaderboard" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View full leaderboard</Link>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Interest Pulse */}
                <Card hover={false} className="p-6 flex flex-col">
                    <div className="mb-4">
                        <h2 className="text-base font-semibold text-charcoal-800">Interest Pulse by Track</h2>
                        <p className="text-sm text-charcoal-500">Interested users per track.</p>
                    </div>
                    {trackInterestData.every((t) => t.totalInterest === 0) ? (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-sm text-charcoal-400">No interest data yet.</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="flex gap-2">
                                {/* Y-axis labels */}
                                <div className="flex flex-col justify-between items-end shrink-0 w-6" style={{ height: '176px' }}>
                                    {[maxTrackInterest, Math.round(maxTrackInterest * 0.75), Math.round(maxTrackInterest * 0.5), Math.round(maxTrackInterest * 0.25), 0].map((val, i) => (
                                        <span key={i} className="text-[12px] leading-none text-charcoal-400">{val}</span>
                                    ))}
                                </div>

                                {/* Chart area */}
                                <div className="flex-1 flex flex-col">
                                    {/* Bars + gridlines */}
                                    <div className="relative h-44">
                                        {[100, 75, 50, 25, 0].map((pct) => (
                                            <div key={pct} className="absolute inset-x-0 border-t border-sand-200" style={{ top: `${100 - pct}%` }} />
                                        ))}
                                        <div className="absolute inset-0 flex items-end gap-1 px-2">
                                            {trackInterestData.map((track) => {
                                                const heightPct = Math.max(2, (track.totalInterest / maxTrackInterest) * 100);
                                                return (
                                                    <div key={track.key} className="flex-1 h-full flex items-end justify-center">
                                                        <div
                                                            className="relative group/bar w-12 rounded-t-md cursor-default transition-opacity duration-150 hover:opacity-75"
                                                            style={{ height: `${heightPct}%`, background: track.color }}
                                                        >
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-charcoal-800 text-white text-xs font-medium rounded-lg px-2.5 py-2 whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-30 shadow-xl">
                                                                <p className="font-semibold mb-0.5">{track.label}</p>
                                                                <p className="text-white/75">{track.totalInterest} interested users</p>
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-px w-2 h-2 bg-charcoal-800 rotate-45" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {/* X-axis labels */}
                                    <div className="flex gap-1 px-2 mt-2">
                                        {trackInterestData.map((track) => (
                                            <div key={track.key} className="flex-1 text-center">
                                                <span className="text-[14px] font-bold text-charcoal-700 leading-tight">{track.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
