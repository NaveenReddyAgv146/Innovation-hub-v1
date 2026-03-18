import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Pagination from '../components/ui/Pagination';
import Modal from '../components/ui/Modal';
import { getThumbnailGradient } from '../utils/thumbnailGradient';
import { getTrackIconSrc } from '../utils/trackIcons';

const STATUS_OPTIONS = ['all', 'published', 'draft', 'finished'];
const VIEWER_STATUS_OPTIONS = ['published', 'finished'];
const IMPACT_OPTIONS = ['all', 'High', 'Medium', 'Low'];
const AVAILABILITY_UNITS = ['per day', 'per week'];
const TRACK_OPTIONS = [
    { value: 'all', label: 'All Tracks' },
    { value: 'Solutions', label: 'Solutions' },
    { value: 'Delivery', label: 'Delivery' },
    { value: 'Learning', label: 'Learning' },
    { value: 'GTM/Sales', label: 'GTM/Sales' },
    { value: 'Organizational Building & Thought Leadership', label: 'Thought Leadership' },
];

const getAuthorName = (author = {}) =>
    [author.firstName, author.lastName].filter(Boolean).join(' ').trim() || author.name || 'Unknown';
const getTitleWithTrack = (poc = {}) => (poc.track ? `${poc.title} · ${poc.track}` : poc.title);

export default function PocList() {
    const user = useAuthStore((s) => s.user);
    const canUseStatusFilters = user?.role === 'admin' || user?.role === 'developer';
    const [searchParams, setSearchParams] = useSearchParams();

    const statusFromUrl = (searchParams.get('status') || '').toLowerCase();
    const interestedFromUrl = searchParams.get('interested') === 'true';
    const trackFromUrl = searchParams.get('track') || 'all';
    const impactFromUrl = searchParams.get('impact') || 'all';

    const initialStatus = canUseStatusFilters
        ? (STATUS_OPTIONS.includes(statusFromUrl) ? statusFromUrl : 'all')
        : (VIEWER_STATUS_OPTIONS.includes(statusFromUrl) ? statusFromUrl : 'published');
    const initialTrack = TRACK_OPTIONS.some((t) => t.value === trackFromUrl) ? trackFromUrl : 'all';
    const initialImpact = IMPACT_OPTIONS.includes(impactFromUrl) ? impactFromUrl : 'all';

    const [pocs, setPocs] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    const [trackFilter, setTrackFilter] = useState(initialTrack);
    const [impactFilter, setImpactFilter] = useState(initialImpact);
    const [interestedOnly, setInterestedOnly] = useState(interestedFromUrl);
    const [tagFilter, setTagFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [votingId, setVotingId] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [interestModalOpen, setInterestModalOpen] = useState(false);
    const [selectedInterestPoc, setSelectedInterestPoc] = useState(null);
    const [availabilityValue, setAvailabilityValue] = useState('');
    const [availabilityUnit, setAvailabilityUnit] = useState('per week');

    const syncParams = useCallback((nextState) => {
        const nextStatus = nextState.status ?? statusFilter;
        const nextTrack = nextState.track ?? trackFilter;
        const nextImpact = nextState.impact ?? impactFilter;
        const nextInterested = nextState.interested ?? interestedOnly;

        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (nextStatus) next.set('status', nextStatus);
            else next.delete('status');
            if (nextTrack !== 'all') next.set('track', nextTrack);
            else next.delete('track');
            if (nextImpact !== 'all') next.set('impact', nextImpact);
            else next.delete('impact');
            if (nextInterested) next.set('interested', 'true');
            else next.delete('interested');
            return next;
        });
    }, [impactFilter, interestedOnly, setSearchParams, statusFilter, trackFilter]);

    const fetchPocs = useCallback(async (page = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = { page, limit: 9 };
            if (search) params.search = search;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (trackFilter !== 'all') params.track = trackFilter;
            if (impactFilter !== 'all') params.impact = impactFilter;
            if (interestedOnly) params.interested = true;
            if (tagFilter) params.tag = tagFilter;

            const { data } = await pocService.getAll(params);
            setPocs(data.pocs);
            setPagination(data.pagination);
        } catch {
            setError('Failed to load contribution briefs');
        } finally {
            setLoading(false);
        }
    }, [impactFilter, interestedOnly, search, statusFilter, tagFilter, trackFilter]);

    useEffect(() => {
        const debounce = setTimeout(() => fetchPocs(1), 300);
        return () => clearTimeout(debounce);
    }, [fetchPocs]);

    useEffect(() => {
        if (statusFilter !== initialStatus) setStatusFilter(initialStatus);
    }, [initialStatus, statusFilter]);

    useEffect(() => {
        if (trackFilter !== initialTrack) setTrackFilter(initialTrack);
    }, [initialTrack, trackFilter]);

    useEffect(() => {
        if (impactFilter !== initialImpact) setImpactFilter(initialImpact);
    }, [impactFilter, initialImpact]);

    useEffect(() => {
        if (interestedOnly !== interestedFromUrl) setInterestedOnly(interestedFromUrl);
    }, [interestedFromUrl, interestedOnly]);

    const canVoteOnPoc = (poc) => {
        if (user?.role === 'admin') return false;
        if (poc.status !== 'published') return false;
        const authorId = poc.author?._id || poc.author?.id || poc.author;
        return authorId !== user?._id && authorId !== user?.id;
    };

    const handleToggleInterest = async (e, poc) => {
        e.preventDefault();
        e.stopPropagation();
        setError('');
        setSelectedInterestPoc(poc);
        setAvailabilityValue('');
        setAvailabilityUnit('per week');
        setInterestModalOpen(true);
    };

    const applyInterestUpdate = (pocId, data) => {
        setPocs((prev) =>
            prev.map((item) => {
                if (item._id !== pocId) return item;
                const nextPoc = data.poc || {};
                const author =
                    nextPoc.author && typeof nextPoc.author === 'object'
                        ? nextPoc.author
                        : item.author;
                return { ...item, ...nextPoc, author };
            })
        );
    };

    const confirmInterest = async () => {
        if (!selectedInterestPoc?._id) return;
        if (!availabilityValue.trim()) {
            setError('Please enter how many hours you are free');
            return;
        }
        setVotingId(selectedInterestPoc._id);
        try {
            const { data } = await pocService.upvote(selectedInterestPoc._id, {
                availabilityValue,
                availabilityUnit,
            });
            applyInterestUpdate(selectedInterestPoc._id, data);
            setInterestModalOpen(false);
            setSelectedInterestPoc(null);
            setAvailabilityValue('');
            setAvailabilityUnit('per week');
        } catch (err) {
            setError(err?.response?.data?.detail || 'Failed to update interest');
        } finally {
            setVotingId('');
        }
    };

    const handleRemoveInterest = async () => {
        if (!selectedInterestPoc?._id) return;
        setVotingId(selectedInterestPoc._id);
        try {
            const { data } = await pocService.removeUpvote(selectedInterestPoc._id);
            applyInterestUpdate(selectedInterestPoc._id, data);
            setInterestModalOpen(false);
            setSelectedInterestPoc(null);
            setAvailabilityValue('');
            setAvailabilityUnit('per week');
        } catch (err) {
            setError(err?.response?.data?.detail || 'Failed to update interest');
        } finally {
            setVotingId('');
        }
    };

    const activeFilterCount =
        (trackFilter !== 'all' ? 1 : 0) +
        (impactFilter !== 'all' ? 1 : 0) +
        (statusFilter !== (canUseStatusFilters ? 'all' : 'published') ? 1 : 0) +
        (interestedOnly ? 1 : 0);

    const resetFilters = () => {
        const nextStatus = canUseStatusFilters ? 'all' : 'published';
        setStatusFilter(nextStatus);
        setTrackFilter('all');
        setImpactFilter('all');
        setInterestedOnly(false);
        syncParams({
            status: nextStatus,
            track: 'all',
            impact: 'all',
            interested: false,
        });
    };

    const FilterChip = ({ active, children, onClick }) => (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                    ? 'bg-terracotta-500 text-white shadow-sm'
                    : 'bg-sand-100 text-charcoal-600 hover:bg-sand-200'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-charcoal-800">Contribution Briefs</h1>
                    <p className="text-charcoal-500 text-sm mt-0.5">
                        {pagination.total} contribution brief{pagination.total !== 1 ? 's' : ''} total
                    </p>
                </div>
                {(user?.role === 'admin' || user?.role === 'developer') && (
                    <Link to="/pocs/new">
                        <Button>+ New Contribution Brief</Button>
                    </Link>
                )}
            </div>

            <Card hover={false} className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <Input
                        className="flex-1"
                        placeholder="Search by title or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        icon={(
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        )}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="sm:self-stretch"
                        onClick={() => setFiltersOpen(true)}
                    >
                        <span className="inline-flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
                            </svg>
                            Filters
                            {activeFilterCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-terracotta-500 px-1.5 text-[11px] font-bold text-white">
                                    {activeFilterCount}
                                </span>
                            )}
                        </span>
                    </Button>
                </div>
            </Card>

            <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter Contributions" size="lg">
                <div className="space-y-6">
                    {user?.role === 'viewer' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">Interest</h3>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: false, label: 'All Visible' },
                                    { value: true, label: 'My Interested' },
                                ].map((option) => (
                                    <FilterChip
                                        key={option.label}
                                        active={interestedOnly === option.value}
                                        onClick={() => {
                                            setInterestedOnly(option.value);
                                            syncParams({ interested: option.value });
                                        }}
                                    >
                                        {option.label}
                                    </FilterChip>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">Track</h3>
                        <div className="flex flex-wrap gap-2">
                            {TRACK_OPTIONS.map((track) => (
                                <FilterChip
                                    key={track.value}
                                    active={trackFilter === track.value}
                                    onClick={() => {
                                        setTrackFilter(track.value);
                                        syncParams({ track: track.value });
                                    }}
                                >
                                    {track.label}
                                </FilterChip>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">Impact</h3>
                        <div className="flex flex-wrap gap-2">
                            {IMPACT_OPTIONS.map((impact) => (
                                <FilterChip
                                    key={impact}
                                    active={impactFilter === impact}
                                    onClick={() => {
                                        setImpactFilter(impact);
                                        syncParams({ impact });
                                    }}
                                >
                                    {impact === 'all' ? 'All Impact' : impact}
                                </FilterChip>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">Status</h3>
                        <div className="flex flex-wrap gap-2">
                            {(canUseStatusFilters ? STATUS_OPTIONS : VIEWER_STATUS_OPTIONS).map((status) => (
                                <FilterChip
                                    key={status}
                                    active={statusFilter === status}
                                    onClick={() => {
                                        setStatusFilter(status);
                                        syncParams({ status });
                                    }}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </FilterChip>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={resetFilters}>
                            Reset
                        </Button>
                        <Button type="button" onClick={() => setFiltersOpen(false)}>
                            Apply
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={interestModalOpen}
                onClose={() => {
                    if (!votingId) {
                        setInterestModalOpen(false);
                        setSelectedInterestPoc(null);
                    }
                }}
                title="Share Your Availability"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-charcoal-600">
                        Tell the team how many hours you are free to work on{' '}
                        <span className="font-semibold text-charcoal-800">{selectedInterestPoc?.title}</span>.
                    </p>
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-charcoal-700">How many hours are you free?</label>
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
                                className="w-36 rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                            >
                                {AVAILABILITY_UNITS.map((unit) => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>
                        <p className="text-xs text-charcoal-500">Example: 8 hours per week</p>
                    </div>
                    <div className="flex justify-between gap-2">
                        <div>
                            {selectedInterestPoc?.hasVoted && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!!votingId}
                                    onClick={handleRemoveInterest}
                                >
                                    Remove Interest
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!!votingId}
                                onClick={() => {
                                    setInterestModalOpen(false);
                                    setSelectedInterestPoc(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="button" size="sm" loading={!!votingId} onClick={confirmInterest}>
                                {selectedInterestPoc?.hasVoted ? 'Update Availability' : 'Mark Interested'}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {loading ? (
                <Spinner size="lg" className="mt-12" />
            ) : error ? (
                <ErrorState message={error} onRetry={() => fetchPocs(1)} />
            ) : pocs.length === 0 ? (
                <EmptyState
                    title="No contribution briefs found"
                    message="Try adjusting your search or filters, or create a new contribution brief."
                    icon={(
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    )}
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {pocs.map((poc) => {
                        const authorName = getAuthorName(poc.author);
                        const thumbnailGradient = getThumbnailGradient(poc._id || poc.title);
                        const trackIcon = getTrackIconSrc(poc.track);
                        return (
                            <Link key={poc._id} to={`/pocs/${poc._id}`}>
                                <Card className="overflow-hidden h-full flex flex-col">
                                    <div className={`aspect-video bg-gradient-to-br ${thumbnailGradient} relative overflow-hidden`}>
                                        {poc.thumbnail ? (
                                            <img src={poc.thumbnail} alt={poc.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                {trackIcon ? (
                                                    <img
                                                        src={trackIcon}
                                                        alt={`${poc.track || 'Contribution'} icon`}
                                                        className="w-10 h-10 object-contain brightness-0 invert"
                                                    />
                                                ) : (
                                                    <svg className="w-10 h-10 text-white/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                    </svg>
                                                )}
                                            </div>
                                        )}
                                        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                                            <Badge color={poc.status === 'published' ? 'green' : poc.status === 'finished' ? 'green' : 'amber'}>
                                                {poc.status}
                                            </Badge>
                                            {poc.impact && (
                                                <Badge color={poc.impact === 'High' ? 'coral' : poc.impact === 'Medium' ? 'terracotta' : 'sand'}>
                                                    {poc.impact} impact
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 flex-1 flex flex-col">
                                        <h3 className="font-semibold text-charcoal-800 mb-1 line-clamp-1">{getTitleWithTrack(poc)}</h3>
                                        <p className="text-sm text-charcoal-500 line-clamp-2 mb-3 flex-1">{poc.description}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {poc.techStack?.slice(0, 4).map((t) => (
                                                <Badge key={t} color="sand">{t}</Badge>
                                            ))}
                                            {poc.techStack?.length > 4 && (
                                                <Badge color="sand">+{poc.techStack.length - 4}</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-sand-100">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-terracotta-400 flex items-center justify-center text-white text-xs font-semibold">
                                                {authorName.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <span className="text-xs text-charcoal-500">{authorName}</span>
                                            {(poc.status === 'published' || poc.status === 'finished') && (
                                                <>
                                                    <span className="text-charcoal-300">•</span>
                                                    <span className="text-xs text-charcoal-500">{poc.votesCount || 0} interested</span>
                                                </>
                                            )}
                                        </div>
                                        {canVoteOnPoc(poc) && (
                                            <div className="mt-3">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={poc.hasVoted ? 'secondary' : 'outline'}
                                                    loading={votingId === poc._id}
                                                    onClick={(e) => handleToggleInterest(e, poc)}
                                                >
                                                    {poc.hasVoted ? 'Interested' : 'Mark Interested'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}

            <Pagination page={pagination.page} pages={pagination.pages} onPageChange={(page) => fetchPocs(page)} />
        </div>
    );
}
