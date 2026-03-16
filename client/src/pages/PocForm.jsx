import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { pocService } from '../services/endpoints';
import useAuthStore from '../store/authStore';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

const TRACK_OPTIONS = [
    'Solutions',
    'Delivery',
    'Learning',
    'GTM/Sales',
    'Organizational Building & Thought Leadership',
];

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

function StepChip({ label, active, done, onClick, icon }) {
    return (
        <div className="relative z-10 flex flex-col items-center gap-2">
            <button
                type="button"
                onClick={onClick}
                className={`h-14 w-14 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                    active
                        ? 'border-terracotta-400 bg-terracotta-500 text-white shadow-md ring-4 ring-terracotta-100'
                        : done
                            ? 'border-terracotta-300 bg-terracotta-100 text-terracotta-600'
                            : 'border-sand-200 bg-sand-100 text-charcoal-400 hover:border-sand-300'
                }`}
                aria-label={label}
            >
                {icon}
            </button>
            <span className={`text-xs font-semibold ${active ? 'text-terracotta-600' : 'text-charcoal-500'}`}>{label}</span>
        </div>
    );
}

function StatusOption({ label, value, checked, onChange, description, accent = 'draft' }) {
    const selectedClasses = {
        draft: 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100',
        published: 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100',
    };

    const dotClasses = {
        draft: 'border-orange-300 bg-orange-500',
        published: 'border-emerald-300 bg-emerald-500',
    };

    return (
        <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-all duration-200 ${
                checked
                    ? selectedClasses[accent]
                    : 'border-sand-200 bg-white text-charcoal-600 hover:border-sand-300'
            }`}
        >
            <input type="radio" name="status" value={value} checked={checked} onChange={onChange} className="sr-only" />
            <span
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    checked ? dotClasses[accent] : 'border-sand-300 bg-white'
                }`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${checked ? 'bg-white' : 'bg-transparent'}`} />
            </span>
            <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block text-sm opacity-80">{description}</span>
            </span>
        </label>
    );
}

function TrackOption({ label, checked, onChange }) {
    return (
        <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 ${
                checked
                    ? 'border-terracotta-300 bg-terracotta-50 text-terracotta-700 ring-2 ring-terracotta-100'
                    : 'border-sand-200 bg-white text-charcoal-600 hover:border-sand-300'
            }`}
        >
            <input type="radio" name="track" value={label} checked={checked} onChange={onChange} className="sr-only" />
            <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    checked ? 'border-terracotta-300 bg-terracotta-500' : 'border-sand-300 bg-white'
                }`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${checked ? 'bg-white' : 'bg-transparent'}`} />
            </span>
            <span className="text-sm font-medium">{label}</span>
        </label>
    );
}

export default function PocForm() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin';
    const isViewer = user?.role === 'viewer';

    const [form, setForm] = useState({
        title: '',
        customer: '',
        track: '',
        pointOfContact: '',
        customerClassification: 'Existing',
        challenges: '',
        requestorName: '',
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
    const [step, setStep] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);

    const steps = useMemo(
        () => (isViewer ? ['Core Details', 'Problem & Build'] : ['Core Details', 'Problem & Build', 'Status']),
        [isViewer]
    );
    const lastStep = steps.length - 1;

    const fetchPoc = useCallback(async () => {
        try {
            const { data } = await pocService.getById(id);
            const poc = data.poc;
            setForm({
                title: poc.title || '',
                customer: poc.customer || '',
                track: poc.track || '',
                pointOfContact: poc.pointOfContact || '',
                customerClassification: poc.customerClassification || 'Existing',
                challenges: poc.challenges || '',
                requestorName: poc.requestorName || '',
                techStack: poc.techStack || [],
                demoLink: poc.demoLink || '',
                repositoryLink: poc.repositoryLink || poc.repoLink || '',
                status: poc.status || '',
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

    const validateStep = (currentStep) => {
        const nextErrors = {};
        if (currentStep === 0) {
            if (!form.title.trim()) nextErrors.title = 'Project title is required';
            if (!form.customer.trim()) nextErrors.customer = 'Target audience/customer is required';
            if (!form.track) nextErrors.track = 'Please select one innovation track';
        }
        if (currentStep === 1 && !form.challenges.trim()) {
            nextErrors.challenges = 'Challenges & requirements are required';
        }
        if (!isViewer && currentStep === 2 && !form.status) {
            nextErrors.status = 'Please select draft or published';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleAddTag = (e) => {
        if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
            e.preventDefault();
            const tag = tagInput.trim().replace(/,$/, '');
            if (tag && !form.techStack.includes(tag)) {
                setForm((prev) => ({ ...prev, techStack: [...prev.techStack, tag] }));
            }
            setTagInput('');
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

    const handleSubmit = async (e) => {
        e.preventDefault();
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
                techStack: form.techStack,
                demoLink: form.demoLink,
                repositoryLink: form.repositoryLink,
                repoLink: form.repositoryLink,
                status: isViewer ? 'draft' : form.status,
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

    if (isSuccess && !isEdit) {
        return (
            <div className="mx-auto max-w-3xl">
                <Card hover={false} className="p-8 sm:p-10 text-center border-sand-200">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-charcoal-500">Submit New Idea</p>
                    <h1 className="mt-3 text-3xl font-bold text-charcoal-800">Great Success!</h1>
                    <p className="mt-3 text-charcoal-600">Your innovation brief has been submitted. The team will review it shortly.</p>
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

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 rounded-[28px] border border-sand-200 bg-linear-to-br from-white via-sand-50 to-terracotta-50 p-6 sm:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-charcoal-500">Innovation Workspace</p>
                <h1 className="mt-2 text-3xl font-bold text-charcoal-800">{isEdit ? 'Edit Idea' : 'Submit New Idea'}</h1>
                <p className="mt-1 text-charcoal-500">Transform your concept into a tangible Proof of Concept.</p>
                <div className="mt-7 flex items-start justify-between relative">
                    <div className="absolute left-0 right-0 top-7 h-0.5 bg-sand-200" />
                    {steps.map((stepName, idx) => (
                        <StepChip
                            key={stepName}
                            label={stepName}
                            active={idx === step}
                            done={idx < step}
                            onClick={() => handleStepTabClick(idx)}
                            icon={idx === 0 ? <CoreIcon /> : idx === 1 ? <CodeIcon /> : <StatusIcon />}
                        />
                    ))}
                </div>
            </div>

            <Card hover={false} className="border-sand-200 bg-sand-50/60 p-4 sm:p-5">
                {error && (
                    <div className="mb-4 rounded-xl border border-coral-200 bg-coral-50 p-3 text-sm text-coral-600">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {step === 0 && (
                        <Card hover={false} className="p-5 sm:p-6 border border-sand-200 shadow-none">
                            <div className="mb-5">
                                <h2 className="text-lg font-semibold text-charcoal-800">Core Details</h2>
                                <p className="mt-1 text-sm text-charcoal-500">Capture the core vision of your idea.</p>
                            </div>
                            <div className="grid gap-5 md:grid-cols-2">
                                <Input
                                    label="Project Title"
                                    placeholder="e.g., AI-Driven Resource Optimizer"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    error={errors.title}
                                    required
                                    className="md:col-span-2"
                                />

                                <Input
                                    label="Target Audience / Customer"
                                    placeholder="Who is this feature for?"
                                    value={form.customer}
                                    onChange={(e) => setForm({ ...form, customer: e.target.value })}
                                    error={errors.customer}
                                    required
                                    className="md:col-span-2"
                                />

                                <div className="space-y-2 md:col-span-2">
                                    <label className="block text-sm font-medium text-charcoal-700">Innovation Track</label>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {TRACK_OPTIONS.map((track) => (
                                            <TrackOption
                                                key={track}
                                                label={track}
                                                checked={form.track === track}
                                                onChange={(e) => setForm({ ...form, track: e.target.value })}
                                            />
                                        ))}
                                    </div>
                                    {errors.track && <p className="text-xs text-coral-500">{errors.track}</p>}
                                </div>

                                <Input
                                    label="Point of Contact (Optional)"
                                    placeholder="Name or email"
                                    value={form.pointOfContact}
                                    onChange={(e) => setForm({ ...form, pointOfContact: e.target.value })}
                                    className="md:col-span-2"
                                />
                            </div>
                        </Card>
                    )}

                    {step === 1 && (
                        <Card hover={false} className="p-5 sm:p-6 border border-sand-200 shadow-none">
                            <div className="mb-5">
                                <h2 className="text-lg font-semibold text-charcoal-800">Problem &amp; Build</h2>
                                <p className="mt-1 text-sm text-charcoal-500">Define the technical landscape and requirements.</p>
                            </div>

                            <div className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">
                                        Challenges &amp; Requirements
                                    </label>
                                    <textarea
                                        className="w-full rounded-xl border border-sand-300 bg-white px-4 py-3 text-sm text-charcoal-800 placeholder:text-charcoal-400 transition-all duration-200 resize-none hover:border-sand-400 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none"
                                        rows={6}
                                        placeholder="Describe the current pain points..."
                                        value={form.challenges}
                                        onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                                    />
                                    {errors.challenges && <p className="text-xs text-coral-500">{errors.challenges}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-charcoal-700">Tech Stack</label>
                                    <div className="mb-2 flex min-h-12 flex-wrap gap-2 rounded-2xl border border-dashed border-sand-300 bg-white p-3">
                                        {form.techStack.length > 0 ? (
                                            form.techStack.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 rounded-full bg-terracotta-100 px-2.5 py-1 text-xs font-medium text-terracotta-700"
                                                >
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveTag(tag)}
                                                        className="hover:text-terracotta-900 transition-colors"
                                                        aria-label={`Remove ${tag}`}
                                                    >
                                                        x
                                                    </button>
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-sm text-charcoal-400">React, FastAPI, MongoDB</span>
                                        )}
                                    </div>
                                    <Input
                                        placeholder="Type a tech and press Enter"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={handleAddTag}
                                    />
                                </div>

                                <div className="grid gap-5 md:grid-cols-2">
                                    <Input
                                        label="Demo Link"
                                        type="url"
                                        placeholder="https://demo.example.com"
                                        value={form.demoLink}
                                        onChange={(e) => setForm({ ...form, demoLink: e.target.value })}
                                    />

                                    <Input
                                        label="Repository"
                                        type="url"
                                        placeholder="https://github.com/org/repo"
                                        value={form.repositoryLink}
                                        onChange={(e) => setForm({ ...form, repositoryLink: e.target.value })}
                                    />
                                </div>
                            </div>
                        </Card>
                    )}

                    {step === 2 && !isViewer && (
                        <Card hover={false} className="p-5 sm:p-6 border border-sand-200 shadow-none">
                            <div className="mb-5">
                                <h2 className="text-lg font-semibold text-charcoal-800">Publishing Status</h2>
                                <p className="mt-1 text-sm text-charcoal-500">
                                    Determine how you want to share this idea with the team.
                                </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <StatusOption
                                    label="Save as Draft"
                                    value="draft"
                                    checked={form.status === 'draft'}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    description="Keep iterating internally before sharing broadly."
                                    accent="draft"
                                />
                                <StatusOption
                                    label="Publish"
                                    value="published"
                                    checked={form.status === 'published'}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    description="Share this idea with the full team now."
                                    accent="published"
                                />
                            </div>
                            {errors.status && <p className="mt-3 text-xs text-coral-500">{errors.status}</p>}
                        </Card>
                    )}

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                        {step > 0 && (
                            <Button type="button" variant="ghost" onClick={handleBack}>
                                Back
                            </Button>
                        )}

                        {step < lastStep ? (
                            <Button type="button" onClick={handleNext}>
                                Next Steps
                            </Button>
                        ) : (
                            <Button type="submit" loading={loading}>
                                {isEdit ? 'Update POC' : 'Submit POC'}
                            </Button>
                        )}

                        <Button type="button" variant="ghost" onClick={() => navigate('/pocs')}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}

function CoreIcon() {
    return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5M22 12a10 10 0 11-20 0 10 10 0 0120 0z" />
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

function StatusIcon() {
    return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m7-9h2M3 12h2m11.95 6.95l1.414 1.414M4.636 4.636 6.05 6.05m11.314 0 1.414-1.414M4.636 19.364 6.05 17.95" />
        </svg>
    );
}
