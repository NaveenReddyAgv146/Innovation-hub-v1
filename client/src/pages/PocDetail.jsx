import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService } from '../services/endpoints';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Modal from '../components/ui/Modal';

const getAuthorName = (author = {}) =>
    [author.firstName, author.lastName].filter(Boolean).join(' ').trim() || author.name || 'Unknown';
const AVAILABILITY_UNITS = ['per day', 'per week'];

const getApiErrorMessage = (err, fallback) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    return fallback;
};

export default function PocDetail() {
    const { id } = useParams();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [poc, setPoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [markingDraft, setMarkingDraft] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [interestModalOpen, setInterestModalOpen] = useState(false);
    const [availabilityValue, setAvailabilityValue] = useState('');
    const [availabilityUnit, setAvailabilityUnit] = useState('weeks');
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
            setError('Failed to load contribution brief');
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
    const canFinish = user?.role === 'admin' && poc?.status === 'published';
    const canMoveToDraft = user?.role === 'admin' && poc?.status === 'published';
    const canViewVoters = user?.role === 'admin' || isOwner;
    const canVote = poc?.status === 'published' && user?.role !== 'admin' && !isOwner;
    const authorName = getAuthorName(poc?.author);
    const currentUserAvailability = voters.find(
        (voter) => (voter._id || voter.id) === (user?._id || user?.id)
    );

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
            setError('Failed to delete contribution brief');
            setDeleting(false);
        }
    };

    const closeDeleteModal = () => {
        if (!deleting) setDeleteModalOpen(false);
    };

    const handleToggleInterest = async () => {
        if (!canVote || !poc) return;
        setError('');
        setAvailabilityValue(currentUserAvailability?.availabilityValue?.toString() || '');
        setAvailabilityUnit(currentUserAvailability?.availabilityUnit || 'per week');
        setInterestModalOpen(true);
    };

    const confirmInterest = async () => {
        if (!poc?._id || !availabilityValue.trim()) {
            setError('Please enter how many hours you are free');
            return;
        }
        setVoting(true);
        try {
            const { data } = await pocService.upvote(poc._id, {
                availabilityValue,
                availabilityUnit,
            });
            setPoc((prev) => {
                const nextPoc = data.poc || {};
                const author =
                    nextPoc.author && typeof nextPoc.author === 'object'
                        ? nextPoc.author
                        : prev?.author;
                return { ...prev, ...nextPoc, author };
            });
            setInterestModalOpen(false);
            setAvailabilityValue('');
            setAvailabilityUnit('per week');
            if (canViewVoters) fetchVoters();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to update interest'));
        } finally {
            setVoting(false);
        }
    };

    const handleRemoveInterest = async () => {
        if (!poc?._id || !poc.hasVoted) return;
        setVoting(true);
        try {
            const { data } = await pocService.removeUpvote(poc._id);
            setPoc((prev) => {
                const nextPoc = data.poc || {};
                const author =
                    nextPoc.author && typeof nextPoc.author === 'object'
                        ? nextPoc.author
                        : prev?.author;
                return { ...prev, ...nextPoc, author };
            });
            setInterestModalOpen(false);
            setAvailabilityValue('');
            setAvailabilityUnit('per week');
            if (canViewVoters) fetchVoters();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to update interest'));
        } finally {
            setVoting(false);
        }
    };

    const handleMarkFinished = async () => {
        if (!poc?._id || !canFinish) return;
        setFinishing(true);
        try {
            const { data } = await pocService.finish(poc._id);
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to mark contribution as finished'));
        } finally {
            setFinishing(false);
        }
    };

    const handleMarkDraft = async () => {
        if (!poc?._id || !canMoveToDraft) return;
        setMarkingDraft(true);
        try {
            const { data } = await pocService.markDraft(poc._id);
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to move contribution to draft'));
        } finally {
            setMarkingDraft(false);
        }
    };

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchPoc} />;
    if (!poc) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Link to="/pocs" className="inline-flex items-center gap-1 text-sm text-charcoal-500 hover:text-terracotta-500 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Contributions
            </Link>

            {poc.thumbnail && (
                <div className="aspect-video rounded-2xl overflow-hidden bg-sand-100 shadow-sm">
                    <img src={poc.thumbnail} alt={poc.title} className="w-full h-full object-cover" />
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={poc.status === 'published' ? 'green' : poc.status === 'finished' ? 'green' : 'amber'}>
                            {poc.status}
                        </Badge>
                        {poc.impact && (
                            <Badge color={poc.impact === 'High' ? 'coral' : poc.impact === 'Medium' ? 'terracotta' : 'sand'}>
                                {poc.impact} impact
                            </Badge>
                        )}
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
                        {canFinish && (
                            <Button variant="secondary" size="sm" loading={finishing} onClick={handleMarkFinished}>
                                Mark as Finished
                            </Button>
                        )}
                        {canMoveToDraft && (
                            <Button variant="outline" size="sm" loading={markingDraft} onClick={handleMarkDraft}>
                                Mark as Draft
                            </Button>
                        )}
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

            <div className="bg-white rounded-2xl border border-sand-200 p-6">
                <h2 className="text-lg font-semibold text-charcoal-800 mb-3">About</h2>
                <p className="text-charcoal-600 whitespace-pre-line leading-relaxed">
                    {poc.description || poc.challenges || 'No details provided'}
                </p>
            </div>

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
                        <p className="text-sm text-charcoal-700">{poc.requestorName || authorName || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Status</p>
                        <p className="text-sm text-charcoal-700">{poc.status || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Track</p>
                        <p className="text-sm text-charcoal-700">{poc.track || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Impact</p>
                        <p className="text-sm text-charcoal-700">{poc.impact || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Estimated Completion Time</p>
                        <p className="text-sm text-charcoal-700">
                            {poc.estimatedDurationValue && poc.estimatedDurationUnit
                                ? `${poc.estimatedDurationValue} ${poc.estimatedDurationUnit}`
                                : '-'}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Point of Contact</p>
                        <p className="text-sm text-charcoal-700">{poc.pointOfContact || '-'}</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-charcoal-400">Current Challenges / Requirements</p>
                    <p className="text-sm text-charcoal-700 whitespace-pre-line">
                        {poc.challenges || poc.description || '-'}
                    </p>
                </div>
            </div>

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
                                    <div>
                                        <span className="block text-sm text-charcoal-700">{voter.name}</span>
                                        <span className="block text-xs text-charcoal-500">{voter.email}</span>
                                    </div>
                                    <span className="text-xs text-charcoal-500">
                                        {voter.availabilityValue && voter.availabilityUnit
                                            ? `${voter.availabilityValue} hours ${voter.availabilityUnit}`
                                            : 'Availability not shared'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={interestModalOpen} onClose={() => !voting && setInterestModalOpen(false)} title="Share Your Availability" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-charcoal-600">
                        Tell the team how many hours you are free to work on <span className="font-semibold text-charcoal-800">{poc.title}</span>.
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
                            {poc.hasVoted && (
                                <Button type="button" variant="outline" size="sm" disabled={voting} onClick={handleRemoveInterest}>
                                    Remove Interest
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={voting} onClick={() => setInterestModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" size="sm" loading={voting} onClick={confirmInterest}>
                            {poc.hasVoted ? 'Update Availability' : 'Mark Interested'}
                        </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={deleteModalOpen} onClose={closeDeleteModal} title="Delete Contribution Brief" size="sm">
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
