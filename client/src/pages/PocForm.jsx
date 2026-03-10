import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { pocService } from '../services/endpoints';
import useAuthStore from '../store/authStore';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

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

const formSectionClasses = 'p-5 sm:p-6 border border-sand-200 shadow-none';

function FormSection({ title, description, children, className = '' }) {
    return (
        <Card hover={false} className={`${formSectionClasses} ${className}`}>
            <div className="mb-5">
                <h2 className="text-lg font-semibold text-charcoal-800">{title}</h2>
                {description && <p className="mt-1 text-sm text-charcoal-500">{description}</p>}
            </div>
            <div className="space-y-5">{children}</div>
        </Card>
    );
}

function StatusOption({ label, value, checked, onChange, accent, description }) {
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
        customerClassification: 'Existing',
        challenges: '',
        requestorName: '',
        techStack: [],
        demoLink: '',
        repositoryLink: '',
        status: 'draft',
    });
    const [tagInput, setTagInput] = useState('');
    const [thumbnail, setThumbnail] = useState(null);
    const [preview, setPreview] = useState('');
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(isEdit);

    const fetchPoc = useCallback(async () => {
        try {
            const { data } = await pocService.getById(id);
            const poc = data.poc;
            setForm({
                title: poc.title || '',
                customer: poc.customer || '',
                customerClassification: poc.customerClassification || 'Existing',
                challenges: poc.challenges || '',
                requestorName: poc.requestorName || '',
                techStack: poc.techStack || [],
                demoLink: poc.demoLink || '',
                repositoryLink: poc.repositoryLink || poc.repoLink || '',
                status: poc.status || 'draft',
            });
            if (poc.thumbnail) setPreview(poc.thumbnail);
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

    const validate = () => {
        const errs = {};
        if (!form.title.trim()) errs.title = 'Title is required';
        if (!form.customer.trim()) errs.customer = 'Customer is required';
        /* if (!form.description.trim()) errs.description = 'Description is required'; */
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleAddTag = (e) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const tag = tagInput.trim();
            if (!form.techStack.includes(tag)) {
                setForm({ ...form, techStack: [...form.techStack, tag] });
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag) => {
        setForm({ ...form, techStack: form.techStack.filter((t) => t !== tag) });
    };

    const handleThumbnail = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setThumbnail(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setError('');
        setLoading(true);

        try {
            const payload = {
                title: form.title,
                customer: form.customer,
                customerClassification: form.customerClassification,
                challenges: form.challenges,
                description: form.challenges,
                requestorName: isAdmin ? undefined : (form.requestorName || user?.name || ''),
                techStack: form.techStack,
                demoLink: form.demoLink,
                repositoryLink: form.repositoryLink,
                repoLink: form.repositoryLink,
                status: isViewer ? 'draft' : form.status,
            };
            if (thumbnail) payload.thumbnail = thumbnail;

            if (isEdit) {
                await pocService.update(id, payload);
            } else {
                await pocService.create(payload);
            }
            navigate('/pocs');
        } catch (err) {
            setError(getApiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} POC`));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <Spinner size="lg" className="mt-24" />;

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 rounded-[28px] border border-sand-200 bg-linear-to-br from-white via-sand-50 to-terracotta-50 p-6 sm:p-8 justify-content text-center">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-charcoal-500">Innovation workspace</p>
                <h1 className="mt-2 text-3xl font-bold text-charcoal-800">
                    {isEdit ? 'Edit POC' : 'Submit New Idea!!'}
                </h1>
                
            </div>

            <Card hover={false} className="border-sand-200 bg-sand-50/60 p-4 sm:p-5">
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-coral-50 border border-coral-200 text-sm text-coral-600">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormSection title="Core Details" description="Capture the idea, who needs it, and who requested it.">
                        <div className="grid gap-5 md:grid-cols-2">
                            <Input
                                label="Title"
                                placeholder="My Awesome Feature Idea"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                error={errors.title}
                                required
                                className="md:col-span-2"
                            />

                            <Input
                                label="Who is it for? Which Customer(s) is this feature for?"
                                placeholder="Customer name(s)"
                                value={form.customer}
                                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                                error={errors.customer}
                                required
                                className="md:col-span-2"
                            />

                            {!isAdmin && (
                                <Input
                                    label="Requestor Name"
                                    placeholder="Requestor name"
                                    value={form.requestorName}
                                    onChange={(e) => setForm({ ...form, requestorName: e.target.value })}
                                    readOnly={isViewer}
                                    className="md:col-span-2"
                                />
                            )}
                        </div>
                    </FormSection>

                    <FormSection
                        title="Problem And Build"
                        description="Describe the need, then add the technical context and supporting links."
                    >
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-charcoal-700">
                                Current Challenges / Requirements
                            </label>
                            <textarea
                                className="w-full rounded-xl border border-sand-300 hover:border-sand-400 bg-white px-4 py-3 text-sm text-charcoal-800 placeholder:text-charcoal-400 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200 resize-none"
                                rows={6}
                                placeholder="Describe the current challenges or requirements..."
                                value={form.challenges}
                                onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                            />
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
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm text-charcoal-400">Add tags like React, FastAPI, MongoDB</span>
                                )}
                            </div>
                            <Input
                                placeholder="Type a tag and press Enter"
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
                                label="Repository Link"
                                type="url"
                                placeholder="https://github.com/org/repo"
                                value={form.repositoryLink}
                                onChange={(e) => setForm({ ...form, repositoryLink: e.target.value })}
                            />
                        </div>
                    </FormSection>

                    {!isViewer && (
                        <FormSection
                            title="Publishing Status"
                            description="Choose whether this stays internal as a draft or becomes visible as a published POC."
                        >
                            <div className="grid gap-3 md:grid-cols-2">
                                <StatusOption
                                    label="Draft"
                                    value="draft"
                                    checked={form.status === 'draft'}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    accent="draft"
                                    description="Keep iterating before sharing it broadly."
                                />
                                <StatusOption
                                    label="Published"
                                    value="published"
                                    checked={form.status === 'published'}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    accent="published"
                                    description="Mark it ready for broader visibility and review."
                                />
                            </div>
                        </FormSection>
                    )}

                    {/* Thumbnail */}
                    {/* <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-charcoal-700">Thumbnail</label>
                        {preview && (
                            <img src={preview} alt="Preview" className="w-full h-40 object-cover rounded-xl mb-2" />
                        )}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleThumbnail}
                            className="text-sm text-charcoal-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-terracotta-50 file:text-terracotta-600 hover:file:bg-terracotta-100 file:cursor-pointer file:transition-colors"
                        />
                    </div> */}

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        <Button type="submit" loading={loading}>
                            {isEdit ? 'Update POC' : 'Submit POC'}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => navigate('/pocs')}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
