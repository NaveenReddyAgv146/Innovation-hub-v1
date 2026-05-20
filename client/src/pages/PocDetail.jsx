import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService, userService } from '../services/endpoints';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Modal from '../components/ui/Modal';
import { getAssignedAdminTrack, isSuperAdmin } from '../utils/access';

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

const formatIstDateTime = (value) => {
    if (!value) return '-';
    const raw = String(value);
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(raw);
    const dt = new Date(hasZone ? raw : `${raw}Z`);
    if (Number.isNaN(dt.getTime())) return '-';
    const datePart = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    }).format(dt);
    const timePart = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
    }).format(dt);
    return `${datePart}, ${timePart} IST`;
};

const formatSpentHours = (elapsedSeconds) => {
    const seconds = Number(elapsedSeconds || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return '0h';
    const totalHours = seconds / 3600;
    if (totalHours >= 100) return `${Math.round(totalHours)}h`;
    if (totalHours >= 10) return `${totalHours.toFixed(1)}h`;
    return `${totalHours.toFixed(2)}h`;
};

const harmonicMean = (a, b) => {
    const x = Number(a || 0);
    const y = Number(b || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return 0;
    return (2 * x * y) / (x + y);
};
const PERFORMANCE_CATEGORIES = ['Exceeds', 'Meets', 'Does Not Meet'];

export default function PocDetail() {
    const { id } = useParams();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [poc, setPoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [finishing, setFinishing] = useState(false);
    const [startingLive, setStartingLive] = useState(false);
    const [markingDraft, setMarkingDraft] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [editCancelModalOpen, setEditCancelModalOpen] = useState(false);
    const [editingCancelReason, setEditingCancelReason] = useState(false);
    const [editCancelReason, setEditCancelReason] = useState('');
    const [editCancelError, setEditCancelError] = useState('');
    const [interestModalOpen, setInterestModalOpen] = useState(false);
    const [availabilityValue, setAvailabilityValue] = useState('');
    const [availabilityUnit, setAvailabilityUnit] = useState('weeks');
    const [voting, setVoting] = useState(false);
    const [voters, setVoters] = useState([]);
    const [votersLoading, setVotersLoading] = useState(false);
    const [votersError, setVotersError] = useState('');
    const [approvalUserId, setApprovalUserId] = useState('');
    const [usersPanelTab, setUsersPanelTab] = useState('interested');
    const [showDirectAdd, setShowDirectAdd] = useState(false);
    const [directAddSearch, setDirectAddSearch] = useState('');
    const [directAddUsers, setDirectAddUsers] = useState([]);
    const [directAddLoading, setDirectAddLoading] = useState(false);
    const [directAddingId, setDirectAddingId] = useState('');
    const [directAddError, setDirectAddError] = useState('');
    const [selectedFeedbackUserId, setSelectedFeedbackUserId] = useState('');
    const [adminFeedbackText, setAdminFeedbackText] = useState('');
    const [adminFeedbackCategory, setAdminFeedbackCategory] = useState('');
    const [userFeedbackText, setUserFeedbackText] = useState('');
    const [savingAdminFeedback, setSavingAdminFeedback] = useState(false);
    const [savingUserFeedback, setSavingUserFeedback] = useState(false);
    const [feedbackListTab, setFeedbackListTab] = useState('admin');
    const [myHoursData, setMyHoursData] = useState(null);
    const [slotStart, setSlotStart] = useState('');
    const [slotEnd, setSlotEnd] = useState('');
    const [editingSlotId, setEditingSlotId] = useState('');
    const [loggingHours, setLoggingHours] = useState(false);
    const [hoursError, setHoursError] = useState('');
    const [hoursSummary, setHoursSummary] = useState(null);
    const [hoursSummaryLoading, setHoursSummaryLoading] = useState(false);
    const [approvingUserId, setApprovingUserId] = useState('');

    const fetchPoc = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await pocService.getById(id);
            setPoc(data.poc);
        } catch {
            setError('Failed to load VIBE');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchPoc();
    }, [fetchPoc]);

    const authorId = poc?.author?._id || poc?.author?.id || poc?.author;
    const isOwner = authorId === user?._id || authorId === user?.id;
    const adminTrack = getAssignedAdminTrack(user);
    const canAdminManageTrack =
        user?.role === 'admin' &&
        (isSuperAdmin(user) || !adminTrack || poc?.track === adminTrack);
    const currentUserId = user?._id || user?.id;
    const currentUserEmail = String(user?.email || '').trim().toLowerCase();
    const currentUserName = String(user?.name || '').trim().toLowerCase();
    const pointOfContactValue = String(poc?.pointOfContact || '').trim().toLowerCase();
    const isPocContactUser = Boolean(
        pointOfContactValue &&
        ((currentUserEmail && pointOfContactValue === currentUserEmail) || (currentUserName && pointOfContactValue === currentUserName))
    );
    // POC contact users get the same management rights as an admin for their contribution
    const canManage = canAdminManageTrack || isPocContactUser;
    const canEdit = canManage || (user?.role === 'developer' && isOwner);
    const cancelledById =
        typeof poc?.cancelledBy === 'object'
            ? (poc?.cancelledBy?._id || poc?.cancelledBy?.id)
            : poc?.cancelledBy;
    const canEditContribution = canEdit && poc?.status !== 'cancelled';
    const canFinish = canManage && poc?.status === 'live';
    const canStartLive = canManage && poc?.status === 'published';
    const canMoveToDraft = canManage && (poc?.status === 'published' || poc?.status === 'live');
    const canCancel = canManage && ['draft', 'published', 'live'].includes(poc?.status);
    const canEditCancelReason = canManage && poc?.status === 'cancelled';
    const currentUserIsApproved =
        (poc?.approvedUsers || []).some((approvedId) => String(approvedId) === String(currentUserId)) ||
        (poc?.creditsAwardedUserIds || []).some((approvedId) => String(approvedId) === String(currentUserId));
    const canVote = poc?.status === 'published' && user?.role !== 'admin' && !isOwner && !isPocContactUser;
    const canViewApprovedTeammates = user?.role === 'viewer' && currentUserIsApproved;
    const canViewVoters = user?.role === 'admin' || isOwner || canViewApprovedTeammates || isPocContactUser;
    const isTeammateViewer = canViewApprovedTeammates && !isOwner && !isPocContactUser;
    const canManageApprovals = canManage;
    const canDirectAdd = canManage && (poc?.status === 'published' || poc?.status === 'live');
    const authorName = getAuthorName(poc?.author);
    const interestedUsers = voters.filter((voter) => !voter.isApproved);
    const approvedUsers = voters.filter((voter) => voter.isApproved);
    const currentUserAvailability = voters.find(
        (voter) => (voter._id || voter.id) === (user?._id || user?.id)
    );
    const adminFeedbacks = Array.isArray(poc?.adminFeedbacks) ? poc.adminFeedbacks : [];
    const userFeedbacks = Array.isArray(poc?.userFeedbacks) ? poc.userFeedbacks : [];
    const participantMap = new Map();
    approvedUsers.forEach((voter) => {
        const voterId = String(voter._id || voter.id || '');
        if (!voterId) return;
        participantMap.set(voterId, { id: voterId, name: voter.name || 'User', email: voter.email || '' });
    });
    adminFeedbacks.forEach((item) => {
        const userId = String(item?.userId || '');
        if (!userId || participantMap.has(userId)) return;
        participantMap.set(userId, { id: userId, name: item?.userName || 'User', email: item?.userEmail || '' });
    });
    userFeedbacks.forEach((item) => {
        const userId = String(item?.userId || '');
        if (!userId || participantMap.has(userId)) return;
        participantMap.set(userId, { id: userId, name: item?.userName || 'User', email: item?.userEmail || '' });
    });
    const participantOptions = Array.from(participantMap.values());
    const canGiveAdminFeedback = canManage && poc?.status === 'finished';
    const canGiveUserFeedback = currentUserIsApproved && poc?.status === 'finished' && user?.role !== 'admin';
    const myExistingUserFeedback = userFeedbacks.find((item) => String(item?.userId) === String(currentUserId));
    const selectedFeedbackUser = participantOptions.find(
        (voter) => String(voter.id) === String(selectedFeedbackUserId)
    );
    const myExistingAdminFeedback = adminFeedbacks.find(
        (item) =>
            String(item?.userId || '') === String(selectedFeedbackUserId || '') &&
            String(item?.givenById || '') === String(currentUserId || '')
    );
    const participation = poc?.currentUserParticipation || null;
    const myElapsedSeconds = Number(participation?.elapsedSeconds || 0);
    const myHoursSpent = myElapsedSeconds > 0 ? myElapsedSeconds / 3600 : 0;
    const myCreditsForProject = Number(poc?.currentUserProjectCredits || 0);
    const myHarmonicScore = harmonicMean(myCreditsForProject, myHoursSpent);
    const showMyContributionMetrics = Boolean(currentUserIsApproved && (myElapsedSeconds > 0 || (poc?.status === 'finished' && myCreditsForProject > 0)));

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

    const canLogHours = poc?.status === 'live' && currentUserIsApproved && user?.role !== 'admin';
    const canViewHoursSummary = (poc?.status === 'live' || poc?.status === 'finished') && (user?.role === 'admin' || isOwner || isPocContactUser);

    const fetchMyHours = useCallback(async () => {
        if (!id || !currentUserIsApproved) return;
        try {
            const { data } = await pocService.getMyHours(id);
            setMyHoursData(data);
        } catch {
            // silently ignore — not critical
        }
    }, [id, currentUserIsApproved]);

    useEffect(() => {
        if (currentUserIsApproved) fetchMyHours();
    }, [currentUserIsApproved, fetchMyHours]);

    const fetchHoursSummary = useCallback(async () => {
        if (!id || !canViewHoursSummary) return;
        setHoursSummaryLoading(true);
        try {
            const { data } = await pocService.getHoursSummary(id);
            setHoursSummary(data.contributors || []);
        } catch {
            setHoursSummary([]);
        } finally {
            setHoursSummaryLoading(false);
        }
    }, [id, canViewHoursSummary]);

    useEffect(() => {
        if (canViewHoursSummary) fetchHoursSummary();
    }, [canViewHoursSummary, fetchHoursSummary]);

    const handleAddSlot = async () => {
        setHoursError('');
        if (!slotStart || !slotEnd) { setHoursError('Select both start and end time'); return; }
        if (slotStart >= slotEnd) { setHoursError('End time must be after start time'); return; }
        setLoggingHours(true);
        try {
            const { data } = await pocService.logHours(id, { startTime: slotStart, endTime: slotEnd });
            setMyHoursData(data);
            setSlotStart('');
            setSlotEnd('');
        } catch (err) {
            setHoursError(getApiErrorMessage(err, 'Failed to log hours'));
        } finally {
            setLoggingHours(false);
        }
    };

    const handleStartEditSlot = (slot) => {
        setEditingSlotId(slot.id);
        setSlotStart(slot.startTime);
        setSlotEnd(slot.endTime);
        setHoursError('');
    };

    const handleUpdateSlot = async () => {
        setHoursError('');
        if (!slotStart || !slotEnd) { setHoursError('Select both start and end time'); return; }
        if (slotStart >= slotEnd) { setHoursError('End time must be after start time'); return; }
        setLoggingHours(true);
        try {
            const { data } = await pocService.updateHourSlot(id, editingSlotId, { startTime: slotStart, endTime: slotEnd });
            setMyHoursData(data);
            setEditingSlotId('');
            setSlotStart('');
            setSlotEnd('');
        } catch (err) {
            setHoursError(getApiErrorMessage(err, 'Failed to update slot'));
        } finally {
            setLoggingHours(false);
        }
    };

    const handleCancelSlotEdit = () => {
        setEditingSlotId('');
        setSlotStart('');
        setSlotEnd('');
        setHoursError('');
    };

    const handleApproveHours = async (userId) => {
        setApprovingUserId(userId);
        try {
            await pocService.approveContributorHours(id, userId);
            setHoursSummary((prev) => prev.map((c) => c.userId === userId ? { ...c, hoursApproved: true } : c));
        } catch (err) {
            setHoursError(getApiErrorMessage(err, 'Failed to approve hours'));
        } finally {
            setApprovingUserId('');
        }
    };

    useEffect(() => {
        if (isTeammateViewer) setUsersPanelTab('approved');
    }, [isTeammateViewer]);

    useEffect(() => {
        if (!selectedFeedbackUserId && participantOptions.length > 0) {
            setSelectedFeedbackUserId(String(participantOptions[0].id || ''));
        }
    }, [participantOptions, selectedFeedbackUserId]);

    useEffect(() => {
        setUserFeedbackText(myExistingUserFeedback?.feedback || '');
    }, [myExistingUserFeedback?.feedback]);

    useEffect(() => {
        if (!selectedFeedbackUserId) {
            setAdminFeedbackText('');
            setAdminFeedbackCategory('');
            return;
        }
        setAdminFeedbackText(myExistingAdminFeedback?.feedback || '');
        const savedCategory = myExistingAdminFeedback?.performanceCategory || '';
        setAdminFeedbackCategory(PERFORMANCE_CATEGORIES.includes(savedCategory) ? savedCategory : '');
    }, [selectedFeedbackUserId, myExistingAdminFeedback?.feedback, myExistingAdminFeedback?.performanceCategory]);

    const handleCancelIdea = () => {
        setCancelReason('');
        setError('');
        setCancelModalOpen(true);
    };

    const closeCancelModal = () => {
        if (!cancelling) setCancelModalOpen(false);
    };

    const confirmCancelIdea = async () => {
        if (!poc?._id || !canCancel) return;
        if (!cancelReason.trim()) {
            setError('Please provide a reason to cancel this VIBE');
            return;
        }
        setCancelling(true);
        try {
            const { data } = await pocService.cancel(poc._id, cancelReason.trim());
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
            setCancelModalOpen(false);
            setCancelReason('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to cancel VIBE'));
        } finally {
            setCancelling(false);
        }
    };

    const openEditCancelReasonModal = () => {
        if (!canEditCancelReason) return;
        setEditCancelReason(poc?.cancelReason || '');
        setEditCancelError('');
        setEditCancelModalOpen(true);
    };

    const closeEditCancelReasonModal = () => {
        if (!editingCancelReason) {
            setEditCancelModalOpen(false);
            setEditCancelError('');
        }
    };

    const confirmEditCancelReason = async () => {
        if (!poc?._id || !canEditCancelReason) return;
        if (!editCancelReason.trim()) {
            setEditCancelError('Please provide a cancellation reason');
            return;
        }

        setEditingCancelReason(true);
        setEditCancelError('');
        try {
            const { data } = await pocService.updateCancelReason(poc._id, editCancelReason.trim());
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
            setEditCancelModalOpen(false);
        } catch (err) {
            setEditCancelError(getApiErrorMessage(err, 'Failed to update cancellation reason'));
        } finally {
            setEditingCancelReason(false);
        }
    };

    const handleToggleInterest = async () => {
        if (!canVote || !poc || currentUserIsApproved) return;
        setError('');
        setAvailabilityValue(currentUserAvailability?.availabilityValue?.toString() || '');
        setAvailabilityUnit(currentUserAvailability?.availabilityUnit || 'per week');
        setInterestModalOpen(true);
    };

    const confirmInterest = async () => {
        if (currentUserIsApproved) {
            setError('You are already approved for this VIBE and cannot edit availability');
            return;
        }
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

    const handleApproveUser = async (targetUserId) => {
        if (!canManageApprovals || !poc?._id || !targetUserId) return;
        setApprovalUserId(targetUserId);
        setVotersError('');
        try {
            await pocService.approveUser(poc._id, targetUserId);
            await fetchVoters();
        } catch (err) {
            setVotersError(getApiErrorMessage(err, 'Failed to approve user'));
        } finally {
            setApprovalUserId('');
        }
    };

    const handleUnapproveUser = async (targetUserId) => {
        if (!canManageApprovals || !poc?._id || !targetUserId) return;
        setApprovalUserId(targetUserId);
        setVotersError('');
        try {
            await pocService.unapproveUser(poc._id, targetUserId);
            await fetchVoters();
        } catch (err) {
            setVotersError(getApiErrorMessage(err, 'Failed to update approved users'));
        } finally {
            setApprovalUserId('');
        }
    };

    const handleOpenDirectAdd = () => {
        if (showDirectAdd) {
            setShowDirectAdd(false);
            setDirectAddSearch('');
            setDirectAddUsers([]);
            setDirectAddError('');
        } else {
            setShowDirectAdd(true);
        }
    };

    const handleDirectAddSearch = async (value) => {
        setDirectAddSearch(value);
        setDirectAddError('');
        if (!value.trim()) { setDirectAddUsers([]); return; }
        setDirectAddLoading(true);
        try {
            const { data } = await userService.getDirectory({ search: value, limit: 25 });
            setDirectAddUsers(data.users || []);
        } catch {
            setDirectAddError('Failed to search users');
        } finally {
            setDirectAddLoading(false);
        }
    };

    const handleDirectAdd = async (targetUserId) => {
        if (!poc?._id || !targetUserId) return;
        setDirectAddingId(targetUserId);
        setDirectAddError('');
        try {
            await pocService.addContributor(poc._id, targetUserId);
            await fetchVoters();
            setDirectAddSearch('');
        } catch (err) {
            setDirectAddError(getApiErrorMessage(err, 'Failed to add contributor'));
        } finally {
            setDirectAddingId('');
        }
    };

    const handleMarkFinished = async () => {
        if (!poc?._id || !canFinish) return;
        setFinishing(true);
        try {
            const { data } = await pocService.finish(poc._id);
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to mark VIBE as finished'));
        } finally {
            setFinishing(false);
        }
    };

    const handleStartLive = async () => {
        if (!poc?._id || !canStartLive) return;
        setStartingLive(true);
        try {
            const { data } = await pocService.goLive(poc._id);
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to start VIBE as live'));
        } finally {
            setStartingLive(false);
        }
    };

    const handleMarkDraft = async () => {
        if (!poc?._id || !canMoveToDraft) return;
        setMarkingDraft(true);
        try {
            const { data } = await pocService.markDraft(poc._id);
            setPoc((prev) => ({ ...prev, ...(data.poc || {}) }));
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to move VIBE to draft'));
        } finally {
            setMarkingDraft(false);
        }
    };

    const handleSaveAdminFeedback = async () => {
        if (!poc?._id || !canGiveAdminFeedback) return;
        if (!selectedFeedbackUserId) {
            setError('Please select an approved user');
            return;
        }
        if (!adminFeedbackText.trim()) {
            setError('Please enter performance feedback');
            return;
        }
        if (!adminFeedbackCategory) {
            setError('Please select a performance category');
            return;
        }
        setSavingAdminFeedback(true);
        setError('');
        try {
            await pocService.addAdminFeedback(poc._id, selectedFeedbackUserId, adminFeedbackText.trim(), adminFeedbackCategory);
            setAdminFeedbackText('');
            setAdminFeedbackCategory('');
            await fetchPoc();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save admin feedback'));
        } finally {
            setSavingAdminFeedback(false);
        }
    };

    const handleSaveUserFeedback = async () => {
        if (!poc?._id || !canGiveUserFeedback) return;
        if (!userFeedbackText.trim()) {
            setError('Please enter your feedback');
            return;
        }
        setSavingUserFeedback(true);
        setError('');
        try {
            await pocService.addUserFeedback(poc._id, userFeedbackText.trim());
            await fetchPoc();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save your feedback'));
        } finally {
            setSavingUserFeedback(false);
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
                Back to VIBEs
            </Link>

            {poc.thumbnail && (
                <div className="aspect-video rounded-2xl overflow-hidden bg-sand-100 shadow-sm">
                    <img src={poc.thumbnail} alt={poc.title} className="w-full h-full object-cover" />
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={poc.status === 'published' || poc.status === 'live' || poc.status === 'finished' ? 'green' : 'amber'}>
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

                {(canEditContribution || canEditCancelReason) && (
                    <div className="flex gap-2">
                        {canCancel && (
                            <Button variant="danger" size="sm" loading={cancelling} onClick={handleCancelIdea}>
                                Cancel VIBE
                            </Button>
                        )}
                        {canFinish && (
                            <Button variant="secondary" size="sm" loading={finishing} onClick={handleMarkFinished}>
                                Mark as Finished
                            </Button>
                        )}
                        {canStartLive && (
                            <Button variant="secondary" size="sm" loading={startingLive} onClick={handleStartLive}>
                                Make Live
                            </Button>
                        )}
                        {canMoveToDraft && (
                            <Button variant="outline" size="sm" loading={markingDraft} onClick={handleMarkDraft}>
                                Mark as Draft
                            </Button>
                        )}
                        {canEditContribution && (
                            <Link to={`/pocs/${poc._id}/edit`}>
                                <Button variant="outline" size="sm">Edit</Button>
                            </Link>
                        )}
                        {canEditCancelReason && (
                            <Button variant="outline" size="sm" onClick={openEditCancelReasonModal}>
                                Edit Cancel Reason
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {canVote && (
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant={currentUserIsApproved ? 'secondary' : (poc.hasVoted ? 'secondary' : 'primary')}
                        size="sm"
                        loading={voting}
                        disabled={currentUserIsApproved}
                        onClick={handleToggleInterest}
                    >
                        {currentUserIsApproved ? 'Approved' : (poc.hasVoted ? 'Interested' : 'Mark Interested')}
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
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">Complexity</p>
                        <p className="text-sm text-charcoal-700">{poc.complexity || '-'}</p>
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
                        <p className="text-xs uppercase tracking-wide text-charcoal-400">VIBE Start Date</p>
                        <p className="text-sm text-charcoal-700">
                            {formatIstDateTime(poc.liveAt)}
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

                {poc.status === 'cancelled' && (
                    <div className="space-y-1 rounded-xl border border-red-200 bg-red-50/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-wide text-red-600">Cancellation Reason</p>
                            {canEditCancelReason && (
                                <Button type="button" size="sm" variant="ghost" onClick={openEditCancelReasonModal}>
                                    Edit
                                </Button>
                            )}
                        </div>
                        <p className="text-sm text-charcoal-700 whitespace-pre-line">{poc.cancelReason || '-'}</p>
                    </div>
                )}

                {/* {showMyContributionMetrics && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-indigo-700">My Contribution Metrics</p>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                <p className="text-xs uppercase tracking-wide text-charcoal-500">Hours Spent</p>
                                <p className="text-lg font-semibold text-charcoal-800">{formatSpentHours(myElapsedSeconds)}</p>
                            </div>
                            <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                <p className="text-xs uppercase tracking-wide text-charcoal-500">Credits Gained</p>
                                <p className="text-lg font-semibold text-charcoal-800">
                                    {poc?.status === 'finished' ? myHarmonicScore.toFixed(2) : '0.00'}
                                </p>
                            </div>
                        </div>
                    </div>
                )} */}
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

            {canLogHours && (() => {
                const sh = slotStart ? parseInt(slotStart.split(':')[0]) * 60 + parseInt(slotStart.split(':')[1]) : 0;
                const eh = slotEnd ? parseInt(slotEnd.split(':')[0]) * 60 + parseInt(slotEnd.split(':')[1]) : 0;
                const durationMins = slotStart && slotEnd && eh > sh ? eh - sh : 0;
                const durationLabel = durationMins > 0
                    ? `${Math.floor(durationMins / 60)}h ${durationMins % 60 > 0 ? `${durationMins % 60}m` : ''}`.trim()
                    : '';
                return (
                <div className="bg-white rounded-2xl border border-sand-200 p-6 space-y-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold text-charcoal-800">Log Your Hours</h2>
                        {myHoursData?.lastUpdatedAt && (
                            <span className="text-xs text-charcoal-400">
                                Last updated: {formatIstDateTime(myHoursData.lastUpdatedAt)}
                            </span>
                        )}
                    </div>

                    {myHoursData && (
                        <div className="flex items-center gap-6 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-charcoal-400">Total Hours</p>
                                <p className="text-xl font-bold text-charcoal-800">{myHoursData.totalHours.toFixed(1)}h</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-charcoal-400">Today</p>
                                <p className="text-xl font-bold text-indigo-600">{(myHoursData.todayHours || 0).toFixed(1)}h</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-charcoal-700">
                            {editingSlotId ? 'Edit time slot' : 'Add time worked'}
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1">
                                <label className="block text-xs text-charcoal-500">Start</label>
                                <input
                                    type="time"
                                    value={slotStart}
                                    onChange={(e) => { setSlotStart(e.target.value); setHoursError(''); }}
                                    className="rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs text-charcoal-500">End</label>
                                <input
                                    type="time"
                                    value={slotEnd}
                                    onChange={(e) => { setSlotEnd(e.target.value); setHoursError(''); }}
                                    className="rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                                />
                            </div>
                            {durationLabel && (
                                <span className="text-sm font-semibold text-indigo-600 pb-2.5">{durationLabel}</span>
                            )}
                            <div className="flex gap-2 pb-0.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    loading={loggingHours}
                                    onClick={editingSlotId ? handleUpdateSlot : handleAddSlot}
                                >
                                    {editingSlotId ? 'Update' : 'Add Slot'}
                                </Button>
                                {editingSlotId && (
                                    <Button type="button" size="sm" variant="ghost" onClick={handleCancelSlotEdit}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>
                        {hoursError && <p className="text-xs text-coral-600">{hoursError}</p>}
                    </div>

                    {myHoursData?.todaySlots?.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-charcoal-400">Today&apos;s entries</p>
                            <div className="space-y-1.5">
                                {myHoursData.todaySlots.map((slot) => (
                                    <div
                                        key={slot.id}
                                        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                            editingSlotId === slot.id
                                                ? 'border-terracotta-300 bg-terracotta-50/40'
                                                : 'border-sand-200 bg-sand-50/40'
                                        }`}
                                    >
                                        <span className="text-sm text-charcoal-800">
                                            {slot.startTime} → {slot.endTime}
                                            <span className="ml-2 text-xs text-charcoal-500">({slot.hours.toFixed(1)}h)</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleStartEditSlot(slot)}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                );
            })()}

            {canViewHoursSummary && (
                <div className="bg-white rounded-2xl border border-sand-200 p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold text-charcoal-800">VIBE Hours</h2>
                        {poc.status === 'finished' && (
                            <span className="text-xs text-charcoal-500">Approve hours for finished contributors</span>
                        )}
                    </div>
                    {hoursSummaryLoading ? (
                        <div className="flex justify-center py-4"><Spinner /></div>
                    ) : !hoursSummary || hoursSummary.length === 0 ? (
                        <p className="text-sm text-charcoal-500 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-3 py-4">
                            No hours logged by contributors yet.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {hoursSummary.map((contributor) => (
                                <div
                                    key={contributor.userId}
                                    className="flex items-center justify-between rounded-xl border border-sand-200 bg-sand-50/40 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <span className="block text-sm font-medium text-charcoal-800 truncate">{contributor.name}</span>
                                        <span className="block text-xs text-charcoal-500 truncate">{contributor.email}</span>
                                        <span className="block text-xs text-charcoal-400 mt-0.5">
                                            {contributor.totalHours.toFixed(1)}h total
                                            {contributor.lastUpdatedAt ? ` · last updated ${formatIstDateTime(contributor.lastUpdatedAt)}` : ''}
                                        </span>
                                    </div>
                                    <div className="shrink-0 ml-3">
                                        {contributor.hoursApproved ? (
                                            <Badge color="green">Approved</Badge>
                                        ) : poc.status === 'finished' ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                                                loading={approvingUserId === contributor.userId}
                                                onClick={() => handleApproveHours(contributor.userId)}
                                            >
                                                Approve
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-charcoal-400">Pending</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-charcoal-800">
                            {isTeammateViewer ? 'Approved Users' : 'Interested Users'}
                        </h2>
                        <div className="flex gap-2">
                            {canDirectAdd && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={showDirectAdd ? 'ghost' : 'outline'}
                                    onClick={handleOpenDirectAdd}
                                >
                                    {showDirectAdd ? 'Cancel' : '+ Add Directly'}
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="ghost" onClick={fetchVoters}>
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {canDirectAdd && showDirectAdd && (
                        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                            <p className="text-sm font-medium text-charcoal-700">Add contributor directly</p>
                            <input
                                type="text"
                                placeholder="Type a name or email to search…"
                                value={directAddSearch}
                                onChange={(e) => handleDirectAddSearch(e.target.value)}
                                className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                            />
                            {directAddError && <p className="text-xs text-coral-600">{directAddError}</p>}
                            {directAddLoading ? (
                                <div className="flex justify-center py-2"><Spinner size="sm" /></div>
                            ) : directAddSearch && directAddUsers.length === 0 ? (
                                <p className="text-xs text-charcoal-500">No matching users found.</p>
                            ) : (() => {
                                const approvedIds = new Set(approvedUsers.map((v) => String(v._id || v.id)));
                                const visible = directAddUsers.filter((u) => u.role !== 'admin' && !approvedIds.has(String(u._id || u.id)));
                                if (!visible.length) return null;
                                return (
                                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                                        {visible.map((u) => {
                                            const uid = String(u._id || u.id);
                                            return (
                                                <div key={uid} className="flex items-center justify-between rounded-lg border border-sand-200 bg-white px-3 py-2">
                                                    <div className="min-w-0">
                                                        <span className="block text-sm font-medium text-charcoal-800 truncate">{u.name}</span>
                                                        <span className="block text-xs text-charcoal-500 truncate">{u.email}</span>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-indigo-400 text-indigo-700 hover:bg-indigo-50 whitespace-nowrap ml-3"
                                                        loading={directAddingId === uid}
                                                        onClick={() => handleDirectAdd(uid)}
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {votersLoading ? (
                        <Spinner size="sm" />
                    ) : votersError ? (
                        <p className="text-sm text-coral-500">{votersError}</p>
                    ) : voters.length === 0 ? (
                        <p className="text-sm text-charcoal-500">
                            {isTeammateViewer ? 'No approved users found yet.' : 'No users have marked interest yet.'}
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {!isTeammateViewer && (
                            <div className="inline-flex rounded-xl bg-sand-100 p-1">
                                <button
                                    type="button"
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                        usersPanelTab === 'interested'
                                            ? 'bg-white text-charcoal-800 shadow-sm'
                                            : 'text-charcoal-600 hover:text-charcoal-800'
                                    }`}
                                    onClick={() => setUsersPanelTab('interested')}
                                >
                                    Interested ({interestedUsers.length})
                                </button>
                                <button
                                    type="button"
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                        usersPanelTab === 'approved'
                                            ? 'bg-white text-charcoal-800 shadow-sm'
                                            : 'text-charcoal-600 hover:text-charcoal-800'
                                    }`}
                                    onClick={() => setUsersPanelTab('approved')}
                                >
                                    Approved ({approvedUsers.length})
                                </button>
                            </div>
                            )}

                            <div className="rounded-2xl border border-sand-200 bg-sand-50/40 p-4">
                                <div className="space-y-3 h-64 overflow-y-scroll pr-1">
                                {!isTeammateViewer && usersPanelTab === 'interested' ? (
                                    interestedUsers.length === 0 ? (
                                        <p className="text-sm text-charcoal-500 rounded-xl border border-dashed border-sand-300 bg-white px-3 py-4">
                                            No pending interested users.
                                        </p>
                                    ) : interestedUsers.map((voter) => (
                                        <div
                                            key={voter._id || voter.id}
                                            className="flex items-center justify-between rounded-xl border border-sand-200 bg-white px-4 py-3"
                                        >
                                            <div className="min-w-0 pr-3">
                                                <span className="block text-lg leading-5 font-medium text-charcoal-800 truncate">{voter.name}</span>
                                                <span className="block text-sm text-charcoal-500 truncate">{voter.email}</span>
                                                <span className="block text-sm text-charcoal-600 mt-1">
                                                    {voter.availabilityValue && voter.availabilityUnit
                                                        ? `${voter.availabilityValue} hours ${voter.availabilityUnit}`
                                                        : 'Availability not shared'}
                                                </span>
                                            </div>
                                            {canManageApprovals ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-blue-500 text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                                                    loading={approvalUserId === (voter._id || voter.id)}
                                                    onClick={() => handleApproveUser(voter._id || voter.id)}
                                                >
                                                    Approve
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-charcoal-500">Pending</span>
                                            )}
                                        </div>
                                    ))
                                ) : approvedUsers.length === 0 ? (
                                    <p className="text-sm text-charcoal-500 rounded-xl border border-dashed border-sand-300 bg-white px-3 py-4">
                                        No users approved yet.
                                    </p>
                                ) : (
                                    approvedUsers.map((voter) => (
                                        <div
                                            key={`approved-${voter._id || voter.id}`}
                                            className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50/60 px-4 py-3"
                                        >
                                            <div className="min-w-0 pr-3">
                                                <span className="block text-lg leading-5 font-medium text-charcoal-800 truncate">{voter.name}</span>
                                                <span className="block text-sm text-charcoal-500 truncate">{voter.email}</span>
                                            </div>
                                            {canManageApprovals ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-charcoal-700 hover:bg-emerald-100 whitespace-nowrap"
                                                    loading={approvalUserId === (voter._id || voter.id)}
                                                    onClick={() => handleUnapproveUser(voter._id || voter.id)}
                                                >
                                                    Remove
                                                </Button>
                                            ) : (
                                                <Badge color="green">Approved</Badge>
                                            )}
                                        </div>
                                    ))
                                )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {poc.status === 'finished' && (
                <div className="rounded-2xl border border-sand-200 bg-gradient-to-b from-white to-sand-50/40 p-6 space-y-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold text-charcoal-800">VIBE Feedback</h2>
                        <Badge color="green">Finished Collaboration Notes</Badge>
                    </div>

                    {(canGiveAdminFeedback || canGiveUserFeedback) && (
                        <div className={`grid grid-cols-1 gap-4 ${canGiveAdminFeedback && canGiveUserFeedback ? 'xl:grid-cols-2' : ''}`}>
                            {canGiveAdminFeedback && (
                                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                                    <p className="text-sm font-semibold text-blue-800">Admin Feedback on User Performance</p>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wide text-charcoal-500">Select Participant</label>
                                        <select
                                            value={selectedFeedbackUserId}
                                            onChange={(e) => setSelectedFeedbackUserId(e.target.value)}
                                            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all duration-200"
                                        >
                                            <option value="">Select participant</option>
                                            {participantOptions.map((participant) => (
                                                <option key={participant.id} value={participant.id}>
                                                    {participant.name}{participant.email ? ` (${participant.email})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedFeedbackUser && (
                                        <p className="text-xs text-charcoal-600">
                                            Writing feedback for <span className="font-semibold text-charcoal-800">{selectedFeedbackUser.name}</span>
                                        </p>
                                    )}
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wide text-charcoal-500">Performance Category</label>
                                        <select
                                            value={adminFeedbackCategory}
                                            onChange={(e) => setAdminFeedbackCategory(e.target.value)}
                                            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all duration-200"
                                        >
                                            <option value="">Select category</option>
                                            {PERFORMANCE_CATEGORIES.map((cat) => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <textarea
                                        value={adminFeedbackText}
                                        onChange={(e) => setAdminFeedbackText(e.target.value)}
                                        rows={3}
                                        placeholder="Share performance feedback for this user..."
                                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all duration-200"
                                    />
                                    <div className="flex justify-end">
                                        <Button type="button" size="sm" loading={savingAdminFeedback} onClick={handleSaveAdminFeedback}>
                                            Save Admin Feedback
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {canGiveUserFeedback && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                                    <p className="text-sm font-semibold text-emerald-800">Your Project Experience</p>
                                    <textarea
                                        value={userFeedbackText}
                                        onChange={(e) => setUserFeedbackText(e.target.value)}
                                        rows={3}
                                        placeholder="What did you learn? How was your experience?"
                                        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-charcoal-800 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition-all duration-200"
                                    />
                                    <div className="flex justify-end">
                                        <Button type="button" size="sm" loading={savingUserFeedback} onClick={handleSaveUserFeedback}>
                                            Save My Feedback
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-xl border border-sand-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <p className="text-sm font-semibold text-charcoal-800">Feedback Timeline</p>
                            <div className="inline-flex rounded-xl bg-sand-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setFeedbackListTab('admin')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                        feedbackListTab === 'admin'
                                            ? 'bg-white text-charcoal-800 shadow-sm'
                                            : 'text-charcoal-600 hover:text-charcoal-800'
                                    }`}
                                >
                                    Admin Feedback ({adminFeedbacks.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFeedbackListTab('user')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                        feedbackListTab === 'user'
                                            ? 'bg-white text-charcoal-800 shadow-sm'
                                            : 'text-charcoal-600 hover:text-charcoal-800'
                                    }`}
                                >
                                    User Feedback ({userFeedbacks.length})
                                </button>
                            </div>
                        </div>
                        {feedbackListTab === 'admin' ? (
                            adminFeedbacks.length === 0 ? (
                                <p className="text-sm text-charcoal-500">No admin feedback added yet.</p>
                            ) : (
                                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                    {adminFeedbacks.map((item, index) => (
                                        <div key={`admin-feedback-${index}`} className="rounded-xl border border-sand-200 bg-sand-50/50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-charcoal-800 truncate">{item.userName || item.userEmail || 'User'}</p>
                                                    <p className="text-xs text-charcoal-500 truncate">By {item.givenByName || item.givenByEmail || 'Admin'}</p>
                                                    {item.performanceCategory && (
                                                        <span className={`mt-1 inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                                            item.performanceCategory === 'Exceeds'
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : item.performanceCategory === 'Meets'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}>{item.performanceCategory}</span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-charcoal-400 whitespace-nowrap">
                                                    {formatIstDateTime(item.updatedAt || item.createdAt)}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-charcoal-700 whitespace-pre-line leading-relaxed">{item.feedback || '-'}</p>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            userFeedbacks.length === 0 ? (
                                <p className="text-sm text-charcoal-500">No user feedback added yet.</p>
                            ) : (
                                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                    {userFeedbacks.map((item, index) => (
                                        <div key={`user-feedback-${index}`} className="rounded-xl border border-sand-200 bg-sand-50/50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm font-semibold text-charcoal-800 truncate">{item.userName || item.userEmail || 'User'}</p>
                                                <span className="text-[11px] text-charcoal-400 whitespace-nowrap">
                                                    {formatIstDateTime(item.updatedAt || item.createdAt)}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-charcoal-700 whitespace-pre-line leading-relaxed">{item.feedback || '-'}</p>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}

            <Modal isOpen={interestModalOpen} onClose={() => !voting && setInterestModalOpen(false)} title="Share Your Availability" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-charcoal-600">
                        Let the team know how much time you can contribute to <span className="font-semibold text-charcoal-800">{poc.title}</span>.
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

            <Modal isOpen={cancelModalOpen} onClose={closeCancelModal} title="Cancel VIBE" size="sm">
                <div className="space-y-3">
                    <p className="text-sm text-charcoal-600">
                        Please provide a reason for cancelling <span className="font-semibold text-charcoal-800">{poc.title}</span>.
                    </p>
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-charcoal-700">Cancellation Reason</label>
                        <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={4}
                            placeholder="Enter the reason for cancellation..."
                            className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={cancelling} onClick={closeCancelModal}>
                            Close
                        </Button>
                        <Button type="button" variant="danger" size="sm" loading={cancelling} onClick={confirmCancelIdea}>
                            Confirm Cancel
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={editCancelModalOpen} onClose={closeEditCancelReasonModal} title="Edit Cancellation Reason" size="sm">
                <div className="space-y-3">
                    <p className="text-sm text-charcoal-600">
                        Update the cancellation reason for <span className="font-semibold text-charcoal-800">{poc.title}</span>.
                    </p>
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-charcoal-700">Cancellation Reason</label>
                        <textarea
                            value={editCancelReason}
                            onChange={(e) => setEditCancelReason(e.target.value)}
                            rows={4}
                            placeholder="Enter the updated reason..."
                            className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                        />
                        {editCancelError && <p className="text-xs text-coral-600">{editCancelError}</p>}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={editingCancelReason} onClick={closeEditCancelReasonModal}>
                            Close
                        </Button>
                        <Button type="button" variant="primary" size="sm" loading={editingCancelReason} onClick={confirmEditCancelReason}>
                            Save Reason
                        </Button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
