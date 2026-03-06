import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

const STATUS_OPTIONS = ['all', 'published', 'draft'];
const getAuthorName = (author = {}) =>
    [author.firstName, author.lastName].filter(Boolean).join(' ').trim() || author.name || 'Unknown';

export default function PocList() {
    const user = useAuthStore((s) => s.user);
    const [pocs, setPocs] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [votingId, setVotingId] = useState('');

    const fetchPocs = useCallback(async (page = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = { page, limit: 9 };
            if (search) params.search = search;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (tagFilter) params.tag = tagFilter;

            const { data } = await pocService.getAll(params);
            setPocs(data.pocs);
            setPagination(data.pagination);
        } catch {
            setError('Failed to load POCs');
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, tagFilter]);

    useEffect(() => {
        const debounce = setTimeout(() => fetchPocs(1), 300);
        return () => clearTimeout(debounce);
    }, [fetchPocs]);

    const canVoteOnPoc = (poc) => {
        if (user?.role === 'admin') return false;
        if (poc.status !== 'published') return false;
        const authorId = poc.author?._id || poc.author?.id || poc.author;
        return authorId !== user?._id && authorId !== user?.id;
    };

    const handleToggleInterest = async (e, poc) => {
        e.preventDefault();
        e.stopPropagation();
        setVotingId(poc._id);
        try {
            const { data } = poc.hasVoted
                ? await pocService.removeUpvote(poc._id)
                : await pocService.upvote(poc._id);
            setPocs((prev) =>
                prev.map((item) => {
                    if (item._id !== poc._id) return item;
                    const nextPoc = data.poc || {};
                    const author =
                        nextPoc.author && typeof nextPoc.author === 'object'
                            ? nextPoc.author
                            : item.author;
                    return { ...item, ...nextPoc, author };
                })
            );
        } catch {
            setError('Failed to update interest');
        } finally {
            setVotingId('');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-charcoal-800">Proof of Concepts</h1>
                    <p className="text-charcoal-500 text-sm mt-0.5">
                        {pagination.total} POC{pagination.total !== 1 ? 's' : ''} total
                    </p>
                </div>
                {(user?.role === 'admin' || user?.role === 'developer' || user?.role === 'viewer') && (
                    <Link to="/pocs/new">
                        <Button>+ Submit POC</Button>
                    </Link>
                )}
            </div>

            {/* Filters */}
            <Card hover={false} className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <Input
                            placeholder="Search by title or description..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            icon={
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            }
                        />
                    </div>
                    <div className="flex gap-2 items-end">
                        {STATUS_OPTIONS.map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                  ${statusFilter === s
                                        ? 'bg-terracotta-500 text-white shadow-sm'
                                        : 'bg-sand-100 text-charcoal-600 hover:bg-sand-200'
                                    }`}
                            >
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                    <Input
                        placeholder="Filter by tag"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        className="sm:w-44"
                    />
                </div>
            </Card>

            {/* POC Grid */}
            {loading ? (
                <Spinner size="lg" className="mt-12" />
            ) : error ? (
                <ErrorState message={error} onRetry={() => fetchPocs(1)} />
            ) : pocs.length === 0 ? (
                <EmptyState
                    title="No POCs found"
                    message="Try adjusting your search or filters, or submit a new POC."
                    icon={
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {pocs.map((poc) => {
                        const authorName = getAuthorName(poc.author);
                        return (
                        <Link key={poc._id} to={`/pocs/${poc._id}`}>
                            <Card className="overflow-hidden h-full flex flex-col">
                                {/* Thumbnail */}
                                <div className="aspect-video bg-gradient-to-br from-sand-100 to-sand-200 relative overflow-hidden">
                                    {poc.thumbnail ? (
                                        <img src={poc.thumbnail} alt={poc.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <svg className="w-10 h-10 text-sand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3">
                                        <Badge color={poc.status === 'published' ? 'green' : 'amber'}>
                                            {poc.status}
                                        </Badge>
                                    </div>
                                </div>
                                {/* Content */}
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="font-semibold text-charcoal-800 mb-1 line-clamp-1">{poc.title}</h3>
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
                                        {poc.status === 'published' && (
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

            <Pagination
                page={pagination.page}
                pages={pagination.pages}
                onPageChange={(p) => fetchPocs(p)}
            />
        </div>
    );
}
