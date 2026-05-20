import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { pocService, userService } from '../services/endpoints';
import useAuthStore from '../store/authStore';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import { getAssignedAdminTrack } from '../utils/access';
import { getTrackIconSrc } from '../utils/trackIcons';

const TRACK_OPTIONS = [
    'Solutions',
    'Delivery',
    'Learning',
    'GTM/Sales',
    'Organizational Building & Thought Leadership',
];
const IMPACT_OPTIONS = ['Low', 'Medium', 'High'];
const COMPLEXITY_OPTIONS = ['High', 'Medium', 'Low'];
const ESTIMATED_DURATION_UNITS = ['days', 'weeks', 'months', 'years'];

const TRACK_COLORS = {
    Solutions: '#314797',
    Delivery: '#0070c0',
    'GTM/Sales': '#9706a2',
    'Organizational Building & Thought Leadership': '#6da353',
    Learning: '#eb7b1e',
};

const getApiErrorMessage = (err, fallback) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0];
        if (typeof first?.msg === 'string' && first.msg.trim()) return first.msg;
    }
    return fallback;
};

/* ─── Step chip ─────────────────────────────────────────────────── */
function StepChip({ label, active, done, onClick, icon }) {
    return (
        <div className="relative z-10 flex flex-col items-center gap-2">
            <button
                type="button"
                onClick={onClick}
                className={`h-14 w-14 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                    active
                        ? 'border-sky-300 bg-sky-100 text-sky-700 shadow-md ring-4 ring-sky-50'
                        : done
                            ? 'border-blue-700 bg-blue-700 text-white shadow-md'
                            : 'border-sand-200 bg-sand-100 text-charcoal-400 hover:border-sand-300'
                }`}
                aria-label={label}
            >
                {icon}
            </button>
            <span
                className={`text-xs font-semibold ${
                    done ? 'text-blue-700' : active ? 'text-sky-700' : 'text-charcoal-500'
                }`}
            >
                {label}
            </span>
        </div>
    );
}

/* ─── Track card ────────────────────────────────────────────────── */
function TrackCard({ label, checked, onChange }) {
    const bgColor = TRACK_COLORS[label] || '#314797';
    const iconSrc = getTrackIconSrc(label);

    return (
        <label
            className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200 ${
                checked
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                    : 'border-sand-200 bg-white hover:border-sand-300'
            }`}
        >
            <input
                type="radio"
                name="track"
                value={label}
                checked={checked}
                onChange={onChange}
                className="sr-only"
            />
            {/* Radio dot top-left */}
            <span
                className={`absolute left-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                    checked ? 'border-blue-500 bg-blue-500' : 'border-sand-300 bg-white'
                }`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${checked ? 'bg-white' : 'bg-transparent'}`} />
            </span>
            {/* Icon square */}
            <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: bgColor }}
            >
                {iconSrc && (
                    <img
                        src={iconSrc}
                        alt={label}
                        className="h-6 w-6 object-contain"
                        style={{ mixBlendMode: 'screen' }}
                    />
                )}
            </span>
            <span className="text-center text-xs font-semibold leading-tight text-charcoal-700">{label}</span>
        </label>
    );
}

/* ─── Impact card ───────────────────────────────────────────────── */
function ImpactCard({ label, checked, onChange, name = 'impact' }) {
    const barHeights = { Low: [4, 8, 4], Medium: [4, 12, 8], High: [8, 14, 12] };
    const heights = barHeights[label] || [4, 8, 4];

    return (
        <label
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-200 ${
                checked
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-sand-200 bg-white hover:border-sand-300'
            }`}
        >
            <input
                type="radio"
                name={name}
                value={label}
                checked={checked}
                onChange={onChange}
                className="sr-only"
            />
            {/* Bar-chart SVG */}
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y={20 - heights[0]} width="6" height={heights[0]} rx="1" fill={checked ? '#3b82f6' : '#cbd5e1'} />
                <rect x="11" y={20 - heights[1]} width="6" height={heights[1]} rx="1" fill={checked ? '#3b82f6' : '#94a3b8'} />
                <rect x="20" y={20 - heights[2]} width="6" height={heights[2]} rx="1" fill={checked ? '#3b82f6' : '#64748b'} />
            </svg>
            <span className={`text-xs font-semibold ${checked ? 'text-blue-700' : 'text-charcoal-600'}`}>{label}</span>
        </label>
    );
}

/* ─── Main component ────────────────────────────────────────────── */
export default function PocForm() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin';
    const isViewer = user?.role === 'viewer';
    const assignedAdminTrack = getAssignedAdminTrack(user);
    const availableTrackOptions = assignedAdminTrack ? [assignedAdminTrack] : TRACK_OPTIONS;

    const [form, setForm] = useState({
        title: '',
        customer: '',
        track: '',
        pointOfContact: '',
        customerClassification: 'Existing',
        challenges: '',
        requestorName: '',
        impact: 'Medium',
        complexity: 'Medium',
        estimatedDurationValue: '',
        estimatedDurationUnit: 'weeks',
        liveAt: '',
        techStack: [],
        demoLink: '',
        repositoryLink: '',
        status: '',
    });
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(isEdit);
    const [contactSuggestions, setContactSuggestions] = useState([]);
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [step, setStep] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);
    const [originalStatus, setOriginalStatus] = useState('');

    const steps = useMemo(
        () => (isViewer ? ['Core Details', 'Problem & Build'] : ['Core Details', 'Problem & Build', 'Status']),
        [isViewer]
    );
    const lastStep = steps.length - 1;

    const fetchPoc = useCallback(async () => {
        try {
            const { data } = await pocService.getById(id);
            const poc = data.poc;
            const fetchedStatus = poc.status || '';
            const editableStatus = fetchedStatus === 'draft' ? 'draft' : 'published';
            setOriginalStatus(fetchedStatus);
            setForm({
                title: poc.title || '',
                customer: poc.customer || '',
                track: poc.track || '',
                pointOfContact: poc.pointOfContact || '',
                customerClassification: poc.customerClassification || 'Existing',
                challenges: poc.challenges || '',
                requestorName: poc.requestorName || '',
                impact: poc.impact || 'Medium',
                complexity: poc.complexity || 'Medium',
                estimatedDurationValue: poc.estimatedDurationValue ? String(poc.estimatedDurationValue) : '',
                estimatedDurationUnit: poc.estimatedDurationUnit || 'weeks',
                liveAt: poc.liveAt ? String(poc.liveAt).slice(0, 16) : '',
                techStack: poc.techStack || [],
                demoLink: poc.demoLink || '',
                repositoryLink: poc.repositoryLink || poc.repoLink || '',
                status: editableStatus,
            });
        } catch {
            setError('Failed to load POC');
        } finally {
            setFetching(false);
        }
    }, [id]);

    useEffect(() => {
        if (isEdit) fetchPoc();
    }, [isEdit, fetchPoc]);

    useEffect(() => {
        if (!isAdmin && user?.name && !form.requestorName) {
            setForm((prev) => ({ ...prev, requestorName: user.name }));
        }
    }, [isAdmin, user?.name, form.requestorName]);

    useEffect(() => {
        if (assignedAdminTrack && form.track !== assignedAdminTrack) {
            setForm((prev) => ({ ...prev, track: assignedAdminTrack }));
        }
    }, [assignedAdminTrack, form.track]);

    useEffect(() => {
        const canSuggestContacts = user?.role === 'admin' || user?.role === 'developer';
        const query = form.pointOfContact.trim();
        if (!canSuggestContacts || query.length < 1) {
            setContactSuggestions([]);
            setShowContactSuggestions(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const { data } = await userService.getDirectory({ search: query, limit: 8 });
                const users = data?.users || [];
                setContactSuggestions(users);
                setShowContactSuggestions(users.length > 0);
            } catch {
                setContactSuggestions([]);
                setShowContactSuggestions(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [form.pointOfContact, user?.role]);

    const validateStep = (currentStep) => {
        const nextErrors = {};
        if (currentStep === 0) {
            if (!form.title.trim()) nextErrors.title = 'Project title is required';
            if (!form.customer.trim()) nextErrors.customer = 'Target audience/customer is required';
            if (!form.track) nextErrors.track = 'Please select one VIBE track';
        }
        if (currentStep === 1 && !form.challenges.trim()) {
            nextErrors.challenges = 'Challenges & requirements are required';
        }
        if (currentStep === 1 && !form.estimatedDurationValue.trim()) {
            nextErrors.estimatedDurationValue = 'Estimated completion time is required';
        } else if (currentStep === 1 && (!/^\d+$/.test(form.estimatedDurationValue) || Number(form.estimatedDurationValue) <= 0)) {
            nextErrors.estimatedDurationValue = 'Estimated completion time must be greater than zero';
        }
        if (!isViewer && currentStep === 2 && !form.status) {
            nextErrors.status = 'Please select draft or published';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const addTag = () => {
        const tag = tagInput.trim().replace(/,$/, '');
        if (!tag || form.techStack.includes(tag)) return;
        setForm((prev) => ({ ...prev, techStack: [...prev.techStack, tag] }));
        setTagInput('');
    };

    const handleAddTag = (e) => {
        if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
            e.preventDefault();
            addTag();
        }
    };

    const handleRemoveTag = (tag) => {
        setForm((prev) => ({ ...prev, techStack: prev.techStack.filter((t) => t !== tag) }));
    };

    const handleNext = () => {
        if (!validateStep(step)) return;
        setStep((prev) => Math.min(prev + 1, lastStep));
    };

    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    const handleStepTabClick = (targetStep) => {
        if (targetStep <= step) {
            setStep(targetStep);
            return;
        }
        if (validateStep(step)) setStep(targetStep);
    };

    const resetForAnother = () => {
        setForm({
            title: '',
            customer: '',
            track: '',
            pointOfContact: '',
            customerClassification: 'Existing',
            challenges: '',
            requestorName: user?.name || '',
            impact: 'Medium',
            complexity: 'Medium',
            estimatedDurationValue: '',
            estimatedDurationUnit: 'weeks',
            liveAt: '',
            techStack: [],
            demoLink: '',
            repositoryLink: '',
            status: '',
        });
        setTagInput('');
        setErrors({});
        setError('');
        setStep(0);
        setIsSuccess(false);
    };

    const handleSubmit = async (overrideStatus) => {
        const statusToUse = overrideStatus || form.status;
        if (!validateStep(step)) return;
        setError('');
        setLoading(true);

        try {
            const payload = {
                title: form.title.trim(),
                customer: form.customer.trim(),
                track: form.track,
                pointOfContact: form.pointOfContact.trim(),
                customerClassification: form.customerClassification,
                challenges: form.challenges.trim(),
                description: form.challenges.trim(),
                requestorName: isAdmin ? undefined : (form.requestorName || user?.name || ''),
                impact: form.impact,
                complexity: form.complexity,
                estimatedDurationValue: form.estimatedDurationValue,
                estimatedDurationUnit: form.estimatedDurationUnit,
                liveAt: undefined,
                techStack: form.techStack,
                demoLink: form.demoLink,
                repositoryLink: form.repositoryLink,
                repoLink: form.repositoryLink,
                status: isViewer ? 'draft' : statusToUse,
            };

            if (isEdit) {
                await pocService.update(id, payload);
                navigate('/pocs');
            } else {
                await pocService.create(payload);
                setIsSuccess(true);
            }
        } catch (err) {
            setError(getApiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} POC`));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <Spinner size="lg" className="mt-24" />;

    /* ── Success screen ─────────────────────────────────────────── */
    if (isSuccess && !isEdit) {
        return (
            <div className="mx-auto max-w-3xl">
                <Card hover={false} className="p-8 sm:p-10 text-center border-sand-200">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-charcoal-500">Submit New Idea</p>
                    <h1 className="mt-3 text-3xl font-bold text-charcoal-800">Great Success!</h1>
                    <p className="mt-3 text-charcoal-600">Your VIBE has been submitted. The team will review it shortly.</p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                        <Button type="button" onClick={resetForAnother}>Create Another Brief</Button>
                        <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
                            Go to Dashboard
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    /* ── Stepper icons ──────────────────────────────────────────── */
    const stepIcons = [<LightbulbIcon />, <CodeIcon />, <PaperPlaneIcon />];

    /* ── Track grid helpers ─────────────────────────────────────── */
    // Last track option spans full width when total is odd
    const mainTracks = availableTrackOptions.slice(0, availableTrackOptions.length - 1);
    const lastTrack = availableTrackOptions[availableTrackOptions.length - 1];
    const lastTrackSpansFull = availableTrackOptions.length % 2 === 1;

    return (
        <div className="w-full">
            {/* Stepper header — simple, no banner */}
            <div className="mb-6">
                <div className="flex items-start justify-between relative">
                    <div className="absolute left-0 right-0 top-7 h-0.5 bg-sand-200" />
                    {steps.map((stepName, idx) => (
                        <StepChip
                            key={stepName}
                            label={stepName}
                            active={idx === step}
                            done={idx < step}
                            onClick={() => handleStepTabClick(idx)}
                            icon={stepIcons[idx]}
                        />
                    ))}
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                </div>
            )}

            <form onSubmit={(e) => e.preventDefault()}>
                {/* ══════════════════════════════════════════════════
                    STEP 0 — Core Details
                ══════════════════════════════════════════════════ */}
                {step === 0 && (
                    <Card hover={false} className="overflow-hidden border border-sand-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-sand-200">
                            {/* Left — Core Details */}
                            <div className="p-6 pr-6 space-y-5">
                                {/* Heading */}
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                                        <LightbulbIcon />
                                    </span>
                                    <div>
                                        <h2 className="text-base font-semibold text-charcoal-800">Core Details</h2>
                                        <p className="text-xs text-charcoal-500 mt-0.5">Capture the core vision of your idea.</p>
                                    </div>
                                </div>

                                {/* Project Title */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Project Title <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none ${errors.title ? 'border-red-400' : 'border-sand-300'}`}
                                        placeholder="e.g., AI-Driven Resource Optimizer"
                                        value={form.title}
                                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    />
                                    {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
                                </div>

                                {/* Target Audience */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Target Audience / Customer <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none ${errors.customer ? 'border-red-400' : 'border-sand-300'}`}
                                        placeholder="Who is this feature for?"
                                        value={form.customer}
                                        onChange={(e) => setForm({ ...form, customer: e.target.value })}
                                    />
                                    {errors.customer && <p className="text-xs text-red-500">{errors.customer}</p>}
                                </div>

                                {/* Point of Contact */}
                                <div className="space-y-1.5 relative">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Point of Contact <span className="text-charcoal-400 font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                                        placeholder="Type name or email (e.g., ys for Yash)"
                                        value={form.pointOfContact}
                                        onChange={(e) => setForm({ ...form, pointOfContact: e.target.value })}
                                        onFocus={() => {
                                            if (contactSuggestions.length > 0) setShowContactSuggestions(true);
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => setShowContactSuggestions(false), 120);
                                        }}
                                    />
                                    {showContactSuggestions && contactSuggestions.length > 0 && (
                                        <div className="absolute z-20 top-[72px] w-full rounded-xl border border-sand-200 bg-white shadow-lg overflow-hidden">
                                            {contactSuggestions.map((item) => (
                                                <button
                                                    key={item._id || item.id || item.email}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => {
                                                        setForm((prev) => ({ ...prev, pointOfContact: item.email || item.name || '' }));
                                                        setShowContactSuggestions(false);
                                                    }}
                                                    className="w-full px-4 py-2.5 text-left hover:bg-sand-50 border-b border-sand-100 last:border-b-0"
                                                >
                                                    <p className="text-sm font-medium text-charcoal-800 truncate">{item.name || '-'}</p>
                                                    <p className="text-xs text-charcoal-500 truncate">
                                                        {item.email || '-'}{item.role === 'admin' && item.adminTrack ? ` · ${item.adminTrack} admin` : ''}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right — VIBE Track */}
                            <div className="p-6 pl-6 space-y-4">
                                <div>
                                    <h2 className="text-base font-semibold text-charcoal-800">VIBE Track</h2>
                                    <p className="text-xs text-charcoal-500 mt-0.5">Select the category that best fits your idea.</p>
                                </div>

                                {/* Track grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {mainTracks.map((track) => (
                                        <TrackCard
                                            key={track}
                                            label={track}
                                            checked={form.track === track}
                                            onChange={(e) => setForm({ ...form, track: e.target.value })}
                                        />
                                    ))}
                                    {/* Last track — full width if odd count */}
                                    <div className={lastTrackSpansFull ? 'col-span-2' : ''}>
                                        <TrackCard
                                            label={lastTrack}
                                            checked={form.track === lastTrack}
                                            onChange={(e) => setForm({ ...form, track: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {assignedAdminTrack && (
                                    <p className="text-xs text-charcoal-500">
                                        Your admin access is limited to the {assignedAdminTrack} track.
                                    </p>
                                )}
                                {errors.track && <p className="text-xs text-red-500">{errors.track}</p>}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-sand-200 bg-sand-50/60 px-6 py-4">
                            <Button type="button" variant="ghost" onClick={() => navigate('/pocs')}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleNext}>
                                Next Step →
                            </Button>
                        </div>
                    </Card>
                )}

                {/* ══════════════════════════════════════════════════
                    STEP 1 — Problem & Build
                ══════════════════════════════════════════════════ */}
                {step === 1 && (
                    <Card hover={false} className="overflow-hidden border border-sand-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-sand-200">
                            {/* Left — Problem & Build */}
                            <div className="p-6 pr-6 space-y-5">
                                {/* Heading */}
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                        <CodeIcon />
                                    </span>
                                    <div>
                                        <h2 className="text-base font-semibold text-charcoal-800">Problem &amp; Build</h2>
                                        <p className="text-xs text-charcoal-500 mt-0.5">Define the technical landscape and requirements.</p>
                                    </div>
                                </div>

                                {/* Challenges */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Challenges &amp; Requirements <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 resize-none hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none ${errors.challenges ? 'border-red-400' : 'border-sand-300'}`}
                                        rows={5}
                                        placeholder="Describe the current pain points..."
                                        value={form.challenges}
                                        onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                                    />
                                    {errors.challenges && <p className="text-xs text-red-500">{errors.challenges}</p>}
                                </div>

                                {/* Tech Stack */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">Tech Stack</label>
                                    <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed border-sand-300 bg-white p-3">
                                        {form.techStack.length > 0 ? (
                                            form.techStack.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
                                                >
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveTag(tag)}
                                                        className="ml-0.5 hover:text-blue-900 transition-colors"
                                                        aria-label={`Remove ${tag}`}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-sm text-charcoal-400">React, FastAPI, MongoDB…</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            className="flex-1 rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                                            placeholder="Type a tech and press Enter"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={handleAddTag}
                                        />
                                        <button
                                            type="button"
                                            onClick={addTag}
                                            disabled={!tagInput.trim()}
                                            className="rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                                        >
                                            Add Tech
                                        </button>
                                    </div>
                                </div>

                                {/* Demo Link */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">Demo Link</label>
                                    <input
                                        type="url"
                                        className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                                        placeholder="https://demo.example.com"
                                        value={form.demoLink}
                                        onChange={(e) => setForm({ ...form, demoLink: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Right — Impact + Duration + Repo */}
                            <div className="p-6 pl-6 space-y-6">
                                {/* Impact */}
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-charcoal-700">Impact</h3>
                                        <p className="text-xs text-charcoal-400 mt-0.5">Estimated business or user impact.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {IMPACT_OPTIONS.map((opt) => (
                                            <ImpactCard
                                                key={opt}
                                                label={opt}
                                                checked={form.impact === opt}
                                                onChange={(e) => setForm({ ...form, impact: e.target.value })}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Complexity */}
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-charcoal-700">Complexity</h3>
                                        <p className="text-xs text-charcoal-400 mt-0.5">Technical difficulty of implementation.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {COMPLEXITY_OPTIONS.map((opt) => (
                                            <ImpactCard
                                                key={opt}
                                                name="complexity"
                                                label={opt}
                                                checked={form.complexity === opt}
                                                onChange={(e) => setForm({ ...form, complexity: e.target.value })}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Estimated Completion Time */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Estimated Completion Time <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex gap-3">
                                        <input
                                            type="number"
                                            min="1"
                                            className={`w-28 rounded-xl border bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none ${errors.estimatedDurationValue ? 'border-red-400' : 'border-sand-300'}`}
                                            placeholder="2"
                                            value={form.estimatedDurationValue}
                                            onChange={(e) => setForm({ ...form, estimatedDurationValue: e.target.value })}
                                        />
                                        <select
                                            value={form.estimatedDurationUnit}
                                            onChange={(e) => setForm({ ...form, estimatedDurationUnit: e.target.value })}
                                            className="flex-1 rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all duration-200"
                                        >
                                            {ESTIMATED_DURATION_UNITS.map((unit) => (
                                                <option key={unit} value={unit}>{unit}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {errors.estimatedDurationValue
                                        ? <p className="text-xs text-red-500">{errors.estimatedDurationValue}</p>
                                        : <p className="text-xs text-charcoal-500">Example: 2 weeks or 6 months</p>
                                    }
                                </div>

                                {/* Repository */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">Repository</label>
                                    <input
                                        type="url"
                                        className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 hover:border-sand-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                                        placeholder="https://github.com/org/repo"
                                        value={form.repositoryLink}
                                        onChange={(e) => setForm({ ...form, repositoryLink: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-sand-200 bg-sand-50/60 px-6 py-4">
                            <Button type="button" variant="ghost" onClick={handleBack}>
                                ← Back
                            </Button>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setForm((prev) => ({ ...prev, status: 'draft' }));
                                        handleNext();
                                    }}
                                >
                                    Save Draft
                                </Button>
                                <Button type="button" onClick={handleNext}>
                                    Next Step →
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* ══════════════════════════════════════════════════
                    STEP 2 — Publishing Status
                ══════════════════════════════════════════════════ */}
                {step === 2 && !isViewer && (
                    <Card hover={false} className="overflow-hidden border border-sand-200 shadow-sm">
                        {/* Compact header */}
                        <div className="flex items-center gap-3 border-b border-sand-200 px-6 py-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <PaperPlaneIcon />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-charcoal-800">Publishing Status</h2>
                                <p className="text-xs text-charcoal-500 mt-0.5">Determine how you want to share this idea with the team.</p>
                            </div>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Two large status cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Draft card */}
                                <label
                                    className={`relative flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 p-6 transition-all duration-200 ${
                                        form.status === 'draft'
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-sand-200 bg-white hover:border-sand-300'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="status"
                                        value="draft"
                                        checked={form.status === 'draft'}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="sr-only"
                                    />
                                    {/* Radio dot top-left */}
                                    <span
                                        className={`absolute left-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                                            form.status === 'draft' ? 'border-blue-600 bg-blue-600' : 'border-sand-300 bg-white'
                                        }`}
                                    >
                                        <span className={`h-1.5 w-1.5 rounded-full ${form.status === 'draft' ? 'bg-white' : 'bg-transparent'}`} />
                                    </span>
                                    {/* Document icon */}
                                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-500">
                                        <DocumentIcon />
                                    </span>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-charcoal-800">Save as Draft</p>
                                        <p className="mt-1 text-xs text-charcoal-500">Keep iterating internally before sharing broadly.</p>
                                    </div>
                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 border border-indigo-100">
                                        Visible only to you
                                    </span>
                                </label>

                                {/* Publish card */}
                                <label
                                    className={`relative flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 p-6 transition-all duration-200 ${
                                        form.status === 'published'
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-sand-200 bg-white hover:border-sand-300'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="status"
                                        value="published"
                                        checked={form.status === 'published'}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="sr-only"
                                    />
                                    {/* Radio dot top-left */}
                                    <span
                                        className={`absolute left-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                                            form.status === 'published' ? 'border-blue-600 bg-blue-600' : 'border-sand-300 bg-white'
                                        }`}
                                    >
                                        <span className={`h-1.5 w-1.5 rounded-full ${form.status === 'published' ? 'bg-white' : 'bg-transparent'}`} />
                                    </span>
                                    {/* Rocket icon */}
                                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                                        <RocketIcon />
                                    </span>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-charcoal-800">Publish Now</p>
                                        <p className="mt-1 text-xs text-charcoal-500">Share this idea. Then use Make Live action when work actually starts.</p>
                                    </div>
                                    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 border border-green-100">
                                        Visible to all after submission
                                    </span>
                                </label>
                            </div>

                            {/* How it works info box */}
                            <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                                <span className="text-blue-500 text-base mt-0.5">ℹ️</span>
                                <p className="text-xs text-blue-700">
                                    <span className="font-semibold">How it works:</span> Published ideas appear in Discover VIBEs for the whole team to view and collaborate on. Draft ideas remain private until you choose to publish them.
                                </p>
                            </div>

                            {isEdit && originalStatus && (
                                <p className="text-xs text-charcoal-500">
                                    Current status: <span className="font-semibold capitalize">{originalStatus}</span>
                                </p>
                            )}
                            {errors.status && <p className="text-xs text-red-500">{errors.status}</p>}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-sand-200 bg-sand-50/60 px-6 py-4">
                            <Button type="button" variant="ghost" onClick={handleBack}>
                                ← Back
                            </Button>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    loading={loading && form.status === 'draft'}
                                    onClick={() => {
                                        setForm((prev) => ({ ...prev, status: 'draft' }));
                                        setTimeout(() => handleSubmit('draft'), 0);
                                    }}
                                >
                                    Save as Draft
                                </Button>
                                <Button
                                    type="button"
                                    loading={loading && form.status === 'published'}
                                    onClick={() => {
                                        setForm((prev) => ({ ...prev, status: 'published' }));
                                        setTimeout(() => handleSubmit('published'), 0);
                                    }}
                                >
                                    {isEdit ? 'Update POC' : 'Publish Idea'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Viewer last step — no status selection, just submit */}
                {step === lastStep && isViewer && (
                    <div className="flex items-center justify-between pt-2">
                        <Button type="button" variant="ghost" onClick={handleBack}>
                            ← Back
                        </Button>
                        <Button type="button" loading={loading} onClick={() => handleSubmit('draft')}>
                            {isEdit ? 'Update VIBE' : 'Submit VIBE'}
                        </Button>
                    </div>
                )}
            </form>
        </div>
    );
}

/* ─── Icon components ───────────────────────────────────────────── */
function LightbulbIcon() {
    return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3a6 6 0 00-3.75 10.688c.427.36.75.904.75 1.562v.5h6v-.5c0-.658.323-1.202.75-1.562A6 6 0 0012 3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 21h5" />
        </svg>
    );
}

function CodeIcon() {
    return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 7l-2 10" />
        </svg>
    );
}

function PaperPlaneIcon() {
    return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
    );
}

function DocumentIcon() {
    return (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    );
}

function RocketIcon() {
    return (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.82m2.56-5.84a14.927 14.927 0 00-2.58 5.841m0 0a6 6 0 006.382 6.382" />
        </svg>
    );
}
