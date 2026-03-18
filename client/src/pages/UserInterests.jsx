import { Fragment, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { userService } from '../services/endpoints';
import useAuthStore from '../store/authStore';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import { getAssignedAdminTrack } from '../utils/access';

const getProjectTitleWithTrack = (project = {}) =>
    project.track ? `${project.title} · ${project.track}` : project.title;
const formatDate = (value) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function UserInterests() {
    const user = useAuthStore((s) => s.user);
    const assignedAdminTrack = getAssignedAdminTrack(user);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedUserId, setExpandedUserId] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (search.trim()) params.search = search.trim();
            const { data } = await userService.getInterests(params);
            setRows(data.users || []);
        } catch {
            setError('Failed to load user interests');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const debounce = setTimeout(() => fetchData(), 300);
        return () => clearTimeout(debounce);
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-charcoal-800">User Interests</h1>
                <p className="text-charcoal-500 text-sm mt-0.5">
                    {assignedAdminTrack
                        ? `Track which users are interested in ${assignedAdminTrack} contributions.`
                        : 'Track which projects each user marked as interested.'}
                </p>
            </div>

            <Input
                placeholder="Search by user name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                }
            />

            {loading ? (
                <Spinner size="lg" className="mt-12" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchData} />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No user interests found"
                    message="No users have marked interest in projects yet."
                    icon={
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.965a1 1 0 00.95.69h4.17c.969 0 1.372 1.24.588 1.81l-3.373 2.45a1 1 0 00-.364 1.118l1.289 3.965c.3.922-.755 1.688-1.54 1.118l-3.373-2.45a1 1 0 00-1.176 0l-3.373 2.45c-.784.57-1.838-.196-1.539-1.118l1.288-3.965a1 1 0 00-.363-1.118l-3.374-2.45c-.784-.57-.38-1.81.588-1.81h4.17a1 1 0 00.951-.69l1.285-3.965z" />
                        </svg>
                    }
                />
            ) : (
                <Card hover={false} className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-sand-50 border-b border-sand-200">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">User</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Role</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Interested Count</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Projects</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-sand-100">
                                {rows.map((row) => {
                                    const isExpanded = expandedUserId === row.user._id;
                                    return (
                                        <Fragment key={row.user._id}>
                                            <tr className="hover:bg-sand-50/50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-terracotta-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                                            {(row.user.name || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-charcoal-800">{row.user.name || 'Unknown'}</p>
                                                            <p className="text-xs text-charcoal-500">{row.user.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <Badge color={row.user.role === 'admin' ? 'coral' : row.user.role === 'developer' ? 'terracotta' : 'sand'}>
                                                        {row.user.role}
                                                    </Badge>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1">
                                                        {row.interestedCount} projects
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedUserId(isExpanded ? '' : row.user._id)}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                            isExpanded
                                                                ? 'text-coral-700 bg-coral-50 hover:bg-coral-100'
                                                                : 'text-terracotta-700 hover:bg-terracotta-50'
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={2}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                        {isExpanded ? 'Hide Projects' : 'View Projects'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr key={`${row.user._id}-projects`} className="bg-sand-50/50">
                                                    <td colSpan={4} className="px-5 py-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">
                                                                Interested Projects
                                                            </p>
                                                            <span className="text-xs text-charcoal-500">
                                                                {row.interestedCount} total
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                                            {(row.projects || []).map((project) => (
                                                                <Link
                                                                    key={`${row.user._id}-${project._id}`}
                                                                    to={`/pocs/${project._id}`}
                                                                    className="block rounded-xl border border-sand-200 bg-white px-3.5 py-3 hover:bg-sand-50 hover:border-sand-300 transition-colors"
                                                                >
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <p className="text-sm font-medium text-charcoal-800 truncate">
                                                                            {getProjectTitleWithTrack(project)}
                                                                        </p>
                                                                        <Badge color={project.status === 'draft' ? 'amber' : 'green'}>
                                                                            {project.status}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="mt-2 flex items-center justify-between text-[11px] text-charcoal-500">
                                                                        <span>
                                                                            {project.availabilityValue && project.availabilityUnit
                                                                                ? `${project.availabilityValue} hours ${project.availabilityUnit} available`
                                                                                : project.track || 'No track'}
                                                                        </span>
                                                                        <span>Updated {formatDate(project.updatedAt)}</span>
                                                                    </div>
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
