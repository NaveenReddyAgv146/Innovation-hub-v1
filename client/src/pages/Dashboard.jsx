import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import { getThumbnailGradient } from '../utils/thumbnailGradient';
import { getTrackIconSrc } from '../utils/trackIcons';

const getTitleWithTrack = (item = {}) => (item.track ? `${item.title} · ${item.track}` : item.title);
const TRACKS = [
    { key: 'Solutions', label: 'Solutions', icon: getTrackIconSrc('Solutions'), ringColor: '#1d4ed8', barClass: 'bg-blue-700' },
    { key: 'Delivery', label: 'Delivery', icon: getTrackIconSrc('Delivery'), ringColor: '#dc2626', barClass: 'bg-red-600' },
    { key: 'Learning', label: 'Learning', icon: getTrackIconSrc('Learning'), ringColor: '#7c3aed', barClass: 'bg-violet-600' },
    { key: 'GTM/Sales', label: 'GTM/Sales', icon: getTrackIconSrc('GTM/Sales'), ringColor: '#ea580c', barClass: 'bg-orange-600' },
    { key: 'Organizational Building & Thought Leadership', label: 'Thought Leadership', icon: getTrackIconSrc('Organizational Building & Thought Leadership'), ringColor: '#0f766e', barClass: 'bg-teal-700' },
];
const buildEmptyTrackStats = () =>
    TRACKS.reduce((acc, track) => {
        acc[track.key] = { published: 0, draft: 0, finished: 0, total: 0 };
        return acc;
    }, {});

export default function Dashboard() {
    const user = useAuthStore((s) => s.user);
    const isViewer = user?.role === 'viewer';
    const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0, finished: 0, interested: 0 });
    const [animatedPublishedPct, setAnimatedPublishedPct] = useState(0);
    const [animatedDraftPct, setAnimatedDraftPct] = useState(0);
    const [animatedFinishedPct, setAnimatedFinishedPct] = useState(0);
    const [animatedInterestedPct, setAnimatedInterestedPct] = useState(0);
    const [recentPocs, setRecentPocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [allPocs, setAllPocs] = useState([]);
    const [pipelineFilter, setPipelineFilter] = useState(null);
    const [trackStats, setTrackStats] = useState(buildEmptyTrackStats());

    const pipelineResetTimerRef = useRef(null);
    const animationFrameRef = useRef(null);

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const baseParams = isViewer ? { status: 'published' } : {};
            const recentRes = await pocService.getAll({ page: 1, limit: 5, ...baseParams });
            const pocs = recentRes.data.pocs;
            const total = recentRes.data.pagination.total;

            const firstTrackPageRes = await pocService.getAll({ page: 1, limit: 100, ...baseParams });
            const firstTrackPageData = firstTrackPageRes.data;
            let allTrackPocs = firstTrackPageData.pocs || [];
            const pages = firstTrackPageData.pagination?.pages || 1;
            for (let page = 2; page <= pages; page += 1) {
                const res = await pocService.getAll({ page, limit: 100, ...baseParams });
                allTrackPocs = allTrackPocs.concat(res.data.pocs || []);
            }

            const computedTrackStats = buildEmptyTrackStats();
            let published = 0;
            let draft = 0;
            let finished = 0;
            let interested = 0;
            allTrackPocs.forEach((poc) => {
                if (poc.status === 'published') published += 1;
                if (poc.status === 'draft') draft += 1;
                if (poc.status === 'finished') finished += 1;
                if (poc.hasVoted) interested += 1;
                const bucket = computedTrackStats[poc.track];
                if (!bucket) return;
                bucket.total += 1;
                if (poc.status === 'published') bucket.published += 1;
                else if (poc.status === 'draft') bucket.draft += 1;
                else if (poc.status === 'finished') bucket.finished += 1;
            });

            setStats({ total, published, drafts: draft, finished, interested });
            setRecentPocs(pocs);
            setTrackStats(computedTrackStats);
            setAllPocs(allTrackPocs);
        } catch {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [isViewer]);

    useEffect(() => {
        fetchDashboard();
        return () => {
            if (pipelineResetTimerRef.current) clearTimeout(pipelineResetTimerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [fetchDashboard]);

    useEffect(() => {
        const targetPublished = stats.total ? (stats.published / stats.total) * 100 : 0;
        const targetDraft = stats.total ? (stats.drafts / stats.total) * 100 : 0;
        const targetFinished = stats.total ? (stats.finished / stats.total) * 100 : 0;
        const targetInterested = stats.total ? (stats.interested / stats.total) * 100 : 0;
        const startPublished = animatedPublishedPct;
        const startDraft = animatedDraftPct;
        const startFinished = animatedFinishedPct;
        const startInterested = animatedInterestedPct;
        const duration = 1000;
        const start = performance.now();

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - (1 - progress) ** 3;
            setAnimatedPublishedPct(startPublished + (targetPublished - startPublished) * eased);
            setAnimatedDraftPct(startDraft + (targetDraft - startDraft) * eased);
            setAnimatedFinishedPct(startFinished + (targetFinished - startFinished) * eased);
            setAnimatedInterestedPct(startInterested + (targetInterested - startInterested) * eased);
            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(tick);
            }
        };

        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(tick);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [stats.total, stats.published, stats.drafts, stats.finished, stats.interested]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

    const publishRate = Math.round(animatedPublishedPct);
    const draftShare = stats.total ? Math.round((stats.drafts / stats.total) * 100) : 0;
    const activeCompletionRate = stats.published + stats.finished
        ? Math.round((stats.finished / (stats.published + stats.finished)) * 100)
        : 0;
    const liveShare = stats.total ? Math.round((stats.published / stats.total) * 100) : 0;
    const finishedShare = stats.total ? Math.round((stats.finished / stats.total) * 100) : 0;
    const interestedShare = stats.total ? Math.round((stats.interested / stats.total) * 100) : 0;
    const publishedDeg = Math.max(0, Math.min(360, animatedPublishedPct * 3.6));
    const draftDeg = isViewer ? 0 : Math.max(0, Math.min(360 - publishedDeg, animatedDraftPct * 3.6));
    const finishedStartDeg = publishedDeg + draftDeg;
    const viewerTrackSegments = [];
    let cumulativeTrackDeg = 0;
    if (isViewer) {
        TRACKS.forEach((track) => {
            const count = trackStats[track.key]?.total || 0;
            const degrees = stats.total ? (count / stats.total) * 360 : 0;
            const start = cumulativeTrackDeg;
            const end = start + degrees;
            viewerTrackSegments.push({
                key: track.key,
                label: track.label,
                color: track.ringColor,
                count,
                start,
                end,
            });
            cumulativeTrackDeg = end;
        });
    }
    const ringStyle = {
        background: isViewer
            ? `conic-gradient(${viewerTrackSegments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ') || '#e2e8f0 0deg 360deg'})`
            : `conic-gradient(var(--color-terracotta-500) 0deg ${publishedDeg}deg, var(--color-amber-500) ${publishedDeg}deg ${finishedStartDeg}deg, #16a34a ${finishedStartDeg}deg 360deg)`,
    };

    const activePipelineItems = pipelineFilter
        ? allPocs.filter((poc) => {
            const interestedMatch = pipelineFilter.interested ? poc.hasVoted : true;
            const statusMatch = pipelineFilter.status ? poc.status === pipelineFilter.status : true;
            const trackMatch = pipelineFilter.track ? poc.track === pipelineFilter.track : true;
            return interestedMatch && statusMatch && trackMatch;
        })
        : [];
    const activeTrackLabel = TRACKS.find((item) => item.key === pipelineFilter?.track)?.label;
    const activePipelineTitle = pipelineFilter
        ? `${pipelineFilter.interested ? 'Interested' : pipelineFilter.status ? (pipelineFilter.status === 'published' ? 'Live' : pipelineFilter.status === 'draft' ? 'Draft' : 'Finished') : ''}${activeTrackLabel ? `${pipelineFilter.status || pipelineFilter.interested ? ' · ' : ''}${activeTrackLabel}` : ''} Contributions`
        : 'Contribution Pipeline';

    const detectSegment = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        const angleFromTop = (Math.atan2(y, x) * 180) / Math.PI + 90;
        const normalized = (angleFromTop + 360) % 360;
        if (isViewer) {
            const clickedTrack = viewerTrackSegments.find((segment) => normalized <= segment.end)?.key;
            return clickedTrack || TRACKS[TRACKS.length - 1].key;
        }
        if (normalized <= publishedDeg) return 'published';
        if (!isViewer && normalized <= publishedDeg + draftDeg) return 'draft';
        return 'finished';
    };

    const schedulePipelineReset = (force = false) => {
        if (!force && !pipelineFilter) return;
        if (pipelineResetTimerRef.current) clearTimeout(pipelineResetTimerRef.current);
        pipelineResetTimerRef.current = setTimeout(() => {
            setPipelineFilter(null);
        }, 5000);
    };

    const handleRingClick = (event) => {
        const clickedSegment = detectSegment(event);
        if (isViewer) {
            setPipelineFilter({ track: clickedSegment });
        } else {
            setPipelineFilter({ status: clickedSegment });
        }
        schedulePipelineReset(true);
    };

    return (
        <div className="space-y-8">
            {!isViewer && (
            <div className="rounded-3xl bg-gradient-to-br from-terracotta-900 via-terracotta-700 to-coral-600 p-6 sm:p-8 text-white shadow-lg">
                <h1 className="text-2xl sm:text-3xl font-bold">Vibe Dashboard</h1>
                <p className="text-white/85 mt-1">
                    Hello {user?.name?.split(' ')[0] || 'there'}, here is your contribution pulse.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
                    <Link to="/pocs?status=all" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Total Contribution Briefs</p>
                        <p className="text-3xl font-bold mt-1">{stats.total}</p>
                    </Link>
                    <Link to="/pocs?status=published" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Live Contributions</p>
                        <p className="text-3xl font-bold mt-1">{stats.published}</p>
                    </Link>
                    <Link to="/pocs?status=draft" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Draft Contributions</p>
                        <p className="text-3xl font-bold mt-1">{stats.drafts}</p>
                    </Link>
                    <Link to="/pocs?status=finished" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Finished Contributions</p>
                        <p className="text-3xl font-bold mt-1">{stats.finished}</p>
                    </Link>
                </div>
            </div>
            )}

            <div>
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-charcoal-800">Track Overview</h2>
                    <p className="text-sm text-charcoal-500">
                        {isViewer ? 'Live and finished contribution counts by track.' : 'Live, draft, and finished contribution counts by track.'}
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    {TRACKS.map((track) => {
                        const statsForTrack = trackStats[track.key] || { published: 0, draft: 0, finished: 0, total: 0 };
                        const publishedPct = statsForTrack.total
                            ? Math.round((statsForTrack.published / statsForTrack.total) * 100)
                            : 0;
                        const draftPct = statsForTrack.total
                            ? Math.round((statsForTrack.draft / statsForTrack.total) * 100)
                            : 0;
                        const finishedPct = statsForTrack.total
                            ? Math.round((statsForTrack.finished / statsForTrack.total) * 100)
                            : 0;

                        return (
                            <Card key={track.key} hover={false} className="p-4 border-sand-200">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-base font-semibold text-charcoal-800">{track.label}</p>
                                    <div className="h-10 w-10 rounded-xl bg-terracotta-600 flex items-center justify-center shrink-0">
                                        <img
                                            src={track.icon}
                                            alt={`${track.label} icon`}
                                            className="h-6 w-6 object-contain brightness-0 invert"
                                        />
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-charcoal-500">{statsForTrack.total} total contributions</p>

                                    <div className="mt-4 space-y-3">
                                        <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPipelineFilter({ status: 'published', track: track.key });
                                                schedulePipelineReset(true);
                                            }}
                                            className="w-full flex items-center justify-between text-xs rounded-md px-1 py-0.5 hover:bg-sand-100 transition-colors"
                                            title={`Show live ${track.label} contributions in pipeline`}
                                        >
                                            <span className="text-charcoal-600">Live</span>
                                            <span className="font-medium text-charcoal-700">{statsForTrack.published}</span>
                                        </button>
                                        <div className="h-2 rounded-full bg-sand-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-terracotta-500 to-terracotta-700"
                                                style={{ width: `${publishedPct}%` }}
                                            />
                                        </div>
                                    </div>
                                    {!isViewer && (
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPipelineFilter({ status: 'draft', track: track.key });
                                                schedulePipelineReset(true);
                                            }}
                                            className="w-full flex items-center justify-between text-xs rounded-md px-1 py-0.5 hover:bg-sand-100 transition-colors"
                                            title={`Show draft ${track.label} contributions in pipeline`}
                                        >
                                            <span className="text-charcoal-600">Draft</span>
                                            <span className="font-medium text-charcoal-700">{statsForTrack.draft}</span>
                                        </button>
                                <div className="h-2 rounded-full bg-sand-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                                                style={{ width: `${draftPct}%` }}
                                            />
                                        </div>
                                    </div>
                                    )}
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPipelineFilter({ status: 'finished', track: track.key });
                                                schedulePipelineReset(true);
                                            }}
                                            className="w-full flex items-center justify-between text-xs rounded-md px-1 py-0.5 hover:bg-sand-100 transition-colors"
                                            title={`Show finished ${track.label} contributions in pipeline`}
                                        >
                                            <span className="text-charcoal-600">Finished</span>
                                            <span className="font-medium text-charcoal-700">{statsForTrack.finished}</span>
                                        </button>
                                        <div className="h-2 rounded-full bg-sand-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-green-600"
                                                style={{ width: `${finishedPct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <Card hover={false} className="p-5 lg:col-span-1">
                    <h2 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wide">{isViewer ? 'Track Ratio' : 'Go-Live Ratio'}</h2>
                    <div className="mt-5 relative flex items-center justify-center">
                        <div
                            className="w-36 h-36 rounded-full p-3 cursor-pointer"
                            style={ringStyle}
                            onClick={handleRingClick}
                            title={isViewer ? 'Click a track segment to filter pipeline' : 'Click segment to filter pipeline'}
                        >
                            <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center">
                                <p className="text-3xl font-bold text-charcoal-800">{isViewer ? stats.total : publishRate}{isViewer ? '' : '%'}</p>
                                <p className="text-xs text-charcoal-500">{isViewer ? 'Contributions' : 'Published'}</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-charcoal-500 mt-4 text-center">
                        {isViewer
                            ? `Track distribution across ${stats.total} contribution briefs.`
                            : `${stats.published} live out of ${stats.total} contribution briefs.`}
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                        {isViewer ? (
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                {TRACKS.map((track) => (
                                    <span key={track.key} className="inline-flex items-center gap-2 text-charcoal-600">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: track.ringColor }} />
                                        {track.label}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <>
                                <span className="inline-flex items-center gap-2 text-charcoal-600">
                                    <span className="w-2.5 h-2.5 rounded-full bg-terracotta-500" />
                                    Published
                                </span>
                                <span className="inline-flex items-center gap-2 text-charcoal-600">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                    Draft
                                </span>
                                <span className="inline-flex items-center gap-2 text-charcoal-600">
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
                                    Finished
                                </span>
                            </>
                        )}
                    </div>
                </Card>

                <Card
                    hover={false}
                    className="p-5 lg:col-span-2"
                    onMouseMove={schedulePipelineReset}
                    onMouseEnter={schedulePipelineReset}
                >
                    <h2 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wide">
                        {pipelineFilter ? activePipelineTitle : 'Contribution Pipeline'}
                    </h2>

                    {!pipelineFilter ? (
                        <div className="mt-5 space-y-4">
                            <div>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="text-charcoal-600">Live Contributions</span>
                                    <span className="font-semibold text-charcoal-800">{stats.published}</span>
                                </div>
                                <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-terracotta-500 to-terracotta-700"
                                        style={{ width: `${animatedPublishedPct}%` }}
                                    />
                                </div>
                            </div>
                            {!isViewer && (
                            <div>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="text-charcoal-600">Draft Contributions</span>
                                    <span className="font-semibold text-charcoal-800">{stats.drafts}</span>
                                </div>
                                <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                                        style={{ width: `${animatedDraftPct}%` }}
                                    />
                                </div>
                            </div>
                            )}
                            <div>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="text-charcoal-600">Finished Contributions</span>
                                    <span className="font-semibold text-charcoal-800">{stats.finished}</span>
                                </div>
                                <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-green-600"
                                        style={{ width: `${animatedFinishedPct}%` }}
                                    />
                                </div>
                            </div>
                            {isViewer && (
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPipelineFilter({ interested: true });
                                            schedulePipelineReset(true);
                                        }}
                                        className="w-full flex items-center justify-between text-sm mb-1 rounded-md px-1 py-0.5 hover:bg-sand-100 transition-colors"
                                        title="Show contributions you marked as interested"
                                    >
                                        <span className="text-charcoal-600">Interested Contributions</span>
                                        <span className="font-semibold text-charcoal-800">{stats.interested}</span>
                                    </button>
                                    <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-yellow-500"
                                            style={{ width: `${animatedInterestedPct}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="border-t border-sand-200 pt-3">
                                <div className={`grid gap-2.5 ${isViewer ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
                                    {!isViewer && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                                            <p className="text-[11px] uppercase tracking-wide text-amber-700">Draft Share</p>
                                            <p className="mt-1 text-lg font-semibold text-amber-700">{draftShare}%</p>
                                        </div>
                                    )}
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                                        <p className="text-[11px] uppercase tracking-wide text-blue-700">
                                            {isViewer ? 'Live Share' : 'Live Completion'}
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-blue-700">
                                            {isViewer ? `${liveShare}%` : `${activeCompletionRate}%`}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                                        <p className="text-[11px] uppercase tracking-wide text-green-700">
                                            {isViewer ? 'Finished Share' : 'Finished Throughput'}
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-green-700">
                                            {isViewer ? `${finishedShare}%` : stats.finished}
                                        </p>
                                    </div>
                                    {isViewer && (
                                        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5">
                                            <p className="text-[11px] uppercase tracking-wide text-yellow-700">Interested Share</p>
                                            <p className="mt-1 text-lg font-semibold text-yellow-700">{interestedShare}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : activePipelineItems.length === 0 ? (
                        <div className="mt-5">
                            <p className="text-sm text-charcoal-500">No items found.</p>
                        </div>
                    ) : (
                        <div className="mt-5 max-h-72 overflow-auto space-y-2.5 pr-1">
                            {activePipelineItems.map((item) => (
                                <Link
                                    key={item._id}
                                    to={`/pocs/${item._id}`}
                                    className="block rounded-xl border border-sand-200 bg-white px-3 py-2.5 hover:bg-sand-50 hover:border-sand-300 transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        {item.thumbnail ? (
                                            <img
                                                src={item.thumbnail}
                                                alt={item.title}
                                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getThumbnailGradient(item._id || item.title)} flex items-center justify-center flex-shrink-0`}>
                                                {getTrackIconSrc(item.track) ? (
                                                    <img
                                                        src={getTrackIconSrc(item.track)}
                                                        alt={`${item.track || 'Contribution'} icon`}
                                                        className="w-6 h-6 object-contain brightness-0 invert"
                                                    />
                                                ) : (
                                                    <svg className="w-5 h-5 text-white/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                    </svg>
                                                )}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-charcoal-800 truncate">{getTitleWithTrack(item)}</p>
                                                <Badge color={item.status === 'published' ? 'green' : item.status === 'finished' ? 'green' : 'amber'}>
                                                    {item.status}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-charcoal-500 mt-0.5 line-clamp-1">
                                                {item.description || 'No description provided'}
                                            </p>
                                            <div className="mt-1.5 text-[11px] text-charcoal-500">
                                                {(item.votesCount || 0)} interested
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-charcoal-800">Recent Contribution Briefs</h2>
                    <Link to="/pocs">
                        <Button variant="ghost" size="sm">View all</Button>
                    </Link>
                </div>

                {recentPocs.length === 0 ? (
                    <Card hover={false} className="p-8 text-center">
                        <p className="text-charcoal-500">No contribution briefs yet.</p>
                        {(user?.role === 'admin' || user?.role === 'developer') && (
                            <Link to="/pocs/new">
                                <Button variant="outline" size="sm" className="mt-3">Create your first Contribution Brief</Button>
                            </Link>
                        )}
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {recentPocs.map((poc) => (
                            <Link key={poc._id} to={`/pocs/${poc._id}`} className="block">
                                <Card className="p-4 flex items-center gap-4">
                                    {poc.thumbnail ? (
                                        <img
                                            src={poc.thumbnail}
                                            alt={poc.title}
                                            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getThumbnailGradient(poc._id || poc.title)} flex items-center justify-center flex-shrink-0`}>
                                            {getTrackIconSrc(poc.track) ? (
                                                <img
                                                    src={getTrackIconSrc(poc.track)}
                                                    alt={`${poc.track || 'Contribution'} icon`}
                                                    className="w-8 h-8 object-contain brightness-0 invert"
                                                />
                                            ) : (
                                                <svg className="w-6 h-6 text-white/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                </svg>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-charcoal-800 truncate">{getTitleWithTrack(poc)}</h3>
                                        <p className="text-sm text-charcoal-500 truncate">{poc.description}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <Badge color={poc.status === 'published' ? 'green' : poc.status === 'finished' ? 'green' : 'amber'}>
                                                {poc.status}
                                            </Badge>
                                            {poc.techStack?.slice(0, 3).map((t) => (
                                                <Badge key={t} color="sand">{t}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
