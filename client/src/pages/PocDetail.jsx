import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService } from '../services/endpoints';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Modal from '../components/ui/Modal';

const getAuthorName = (author = {}) =>
    [author.firstName, author.lastName].filter(Boolean).join(' ').trim() || author.name || 'Unknown';

export default function PocDetail() {
    const { id } = useParams();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [poc, setPoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [voting, setVoting] = useState(false);
    const [voters, setVoters] = useState([]);
    const [votersLoading, setVotersLoading] = useState(false);
    const [votersError, setVotersError] = useState('');

    const fetchPoc = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await pocService.getById(id);
            setPoc(data.poc);
        } catch {
            setError('Failed to load innovation brief');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchPoc();
    }, [fetchPoc]);

    const authorId = poc?.author?._id || poc?.author?.id || poc?.author;
    const isOwner = authorId === user?._id || authorId === user?.id;
    const canEdit = user?.role === 'admin' || (user?.role === 'developer' && isOwner);
    const canViewVoters = user?.role === 'admin' || isOwner;
    const canVote = poc?.status === 'published' && user?.role !== 'admin' && !isOwner;
    const authorName = getAuthorName(poc?.author);

    const fetchVoters = useCallback(async () => {
        if (!canViewVoters || !id) return;
        setVotersLoading(true);
        setVotersError('');
        try {
            const { data } = await pocService.getVoters(id);
            setVoters(data.voters || []);
        } catch {
            setVotersError('Failed to load interested users');
        } finally {
            setVotersLoading(false);
        }
    }, [canViewVoters, id]);

    useEffect(() => {
        if (canViewVoters) fetchVoters();
    }, [canViewVoters, fetchVoters]);

    const handleDelete = () => {
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        setDeleting(true);
        try {
            await pocService.delete(id);
            setDeleteModalOpen(false);
            navigate('/pocs');
        } catch {
            setError('Failed to delete innovation brief');
            setDeleting(false);
        }
    };

    const closeDeleteModal = () => {
        if (!deleting) setDeleteModalOpen(false);
    };

    const handleToggleInterest = async () => {
        if (!canVote || !poc) return;
        setVoting(true);
        try {
            const { data } = poc.hasVoted
                ? await pocService.removeUpvote(poc._id)
                : await pocService.upvote(poc._id);
            setPoc((prev) => {
                const nextPoc = data.poc || {};
                const author =
                    nextPoc.author && typeof nextPoc.author === 'object'
                        ? nextPoc.author
                        : prev?.author;
                return { ...prev, ...nextPoc, author };
            });
            if (canViewVoters) fetchVoters();
        } catch {
            setError('Failed to update interest');
        } finally {
            setVoting(false);
        }
    };

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchPoc} />;
    if (!poc) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Back */}
            <Link to="/pocs" className="inline-flex items-center gap-1 text-sm text-charcoal-500 hover:text-terracotta-500 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Innovations
            </Link>

            {/* Thumbnail */}
            {poc.thumbnail && (
                <div className="aspect-video rounded-2xl overflow-hidden bg-sand-100 shadow-sm">
                    <img src={poc.thumbnail} alt={poc.title} className="w-full h-full object-cover" />
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge color={poc.status === 'published' ? 'green' : 'amber'}>
                            {poc.status}
                        </Badge>
                        <span className="text-sm text-charcoal-500">
                            {(poc.votesCount || 0)} interested
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-charcoal-800">{poc.title}</h1>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-terracotta-400 flex items-center justify-center text-white text-xs font-semibold">
                            {authorName.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="text-sm text-charcoal-600">{authorName}</span>
                        <span className="text-charcoal-400">·</span>
                        <span className="text-sm text-charcoal-400">
                            {new Date(poc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                {canEdit && (
                    <div className="flex gap-2">
                        <Link to={`/pocs/${poc._id}/edit`}>
                            <Button variant="outline" size="sm">Edit</Button>
                        </Link>
                        <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {canVote && (
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant={poc.hasVoted ? 'secondary' : 'primary'}
                        size="sm"
                        loading={voting}
                        onClick={handleToggleInterest}
                    >
                        {poc.hasVoted ? 'Interested' : 'Mark Interested'}
                    </Button>
                    <span className="text-sm text-charcoal-500">
                        {(poc.votesCount || 0)} users interested
                    </span>
                </div>
            )}

            {/* Description */}
            <div className="bg-white rounded-2xl border border-sand-200 p-6">
                <h2 className="text-lg font-semibold text-charcoal-800 mb-3">About</h2>
                <p className="text-charcoal-600 whitespace-pre-line leading-relaxed">
                    {poc.description || poc.challenges || 'No details provided'}
                </p>
            </div>

            {/* Idea Details */}
            <div className="bg-white rounded-2xl border border-sand-200 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-charcoal-800">Idea Submission Details</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Customer</p>
                        <p className="text-sm text-charcoal-700">{poc.customer || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Customer Classification</p>
                        <p className="text-sm text-charcoal-700">{poc.customerClassification || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Requestor Name</p>
                        <p className="text-sm text-charcoal-700">
                            {poc.requestorName || authorName || '-'}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Status</p>
                        <p className="text-sm text-charcoal-700">{poc.status || '-'}</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-charcoal-400">
                        Current Challenges / Requirements
                    </p>
                    <p className="text-sm text-charcoal-700 whitespace-pre-line">
                        {poc.challenges || poc.description || '-'}
                    </p>
                </div>
            </div>

            {/* Tech Stack */}
            {poc.techStack?.length > 0 && (
                <div className="bg-white rounded-2xl border border-sand-200 p-6">
                    <h2 className="text-lg font-semibold text-charcoal-800 mb-3">Tech Stack</h2>
                    <div className="flex flex-wrap gap-2">
                        {poc.techStack.map((t) => (
                            <Badge key={t} color="terracotta">{t}</Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Links */}
            {(poc.demoLink || poc.repositoryLink || poc.repoLink) && (
                <div className="bg-white rounded-2xl border border-sand-200 p-6">
                    <h2 className="text-lg font-semibold text-charcoal-800 mb-3">Links</h2>
                    <div className="flex flex-wrap gap-3">
                        {poc.demoLink && (
                            <a
                                href={poc.demoLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-terracotta-50 text-terracotta-600 font-medium text-sm hover:bg-terracotta-100 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Live Demo
                            </a>
                        )}
                        {(poc.repositoryLink || poc.repoLink) && (
                            <a
                                href={poc.repositoryLink || poc.repoLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sand-100 text-charcoal-700 font-medium text-sm hover:bg-sand-200 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                Repository
                            </a>
                        )}
                    </div>
                </div>
            )}

            {canViewVoters && (
                <div className="bg-white rounded-2xl border border-sand-200 p-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-charcoal-800">Interested Users</h2>
                        <Button type="button" size="sm" variant="ghost" onClick={fetchVoters}>
                            Refresh
                        </Button>
                    </div>
                    {votersLoading ? (
                        <Spinner size="sm" />
                    ) : votersError ? (
                        <p className="text-sm text-coral-500">{votersError}</p>
                    ) : voters.length === 0 ? (
                        <p className="text-sm text-charcoal-500">No users have marked interest yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {voters.map((voter) => (
                                <div
                                    key={voter._id || voter.id}
                                    className="flex items-center justify-between rounded-xl border border-sand-200 px-3 py-2"
                                >
                                    <span className="text-sm text-charcoal-700">{voter.name}</span>
                                    <span className="text-xs text-charcoal-500">{voter.email}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={deleteModalOpen} onClose={closeDeleteModal} title="Delete Innovation Brief" size="sm">
                <p className="text-sm text-charcoal-600">
                    Are you sure you want to delete <span className="font-semibold text-charcoal-800">{poc.title}</span>?
                    This action cannot be undone.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={closeDeleteModal}>
                        Cancel
                    </Button>
                    <Button type="button" variant="danger" size="sm" loading={deleting} onClick={confirmDelete}>
                        Delete
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
