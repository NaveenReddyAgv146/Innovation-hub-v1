import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { pocService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Button from '../components/ui/Button';
import { getThumbnailGradient } from '../utils/thumbnailGradient';

export default function Dashboard() {
    const user = useAuthStore((s) => s.user);
    const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0 });
    const [recentPocs, setRecentPocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const allRes = await pocService.getAll({ page: 1, limit: 5 });
            const pocs = allRes.data.pocs;
            const total = allRes.data.pagination.total;

            const publishedRes = await pocService.getAll({ page: 1, limit: 1, status: 'published' });
            const published = publishedRes.data.pagination.total;

            setStats({ total, published, drafts: total - published });
            setRecentPocs(pocs);
        } catch {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading) return <Spinner size="lg" className="mt-24" />;
    if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

    const publishRate = stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0;
    const ringStyle = {
        background: `conic-gradient(var(--color-terracotta-500) ${publishRate * 3.6}deg, var(--color-sand-200) 0deg)`,
    };

    return (
        <div className="space-y-8">
            <div className="rounded-3xl bg-gradient-to-br from-terracotta-900 via-terracotta-700 to-coral-600 p-6 sm:p-8 text-white shadow-lg">
                <h1 className="text-2xl sm:text-3xl font-bold">Innovation Control Center</h1>
                <p className="text-white/85 mt-1">
                    Hello {user?.name?.split(' ')[0] || 'there'}, here is your innovation pulse.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                    <Link to="/pocs?status=all" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Total Innovation Briefs</p>
                        <p className="text-3xl font-bold mt-1">{stats.total}</p>
                    </Link>
                    <Link to="/pocs?status=published" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Live Innovations</p>
                        <p className="text-3xl font-bold mt-1">{stats.published}</p>
                    </Link>
                    <Link to="/pocs?status=draft" className="rounded-2xl bg-white/12 border border-white/20 p-4 backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <p className="text-xs uppercase tracking-wide text-white/75">Draft Innovations</p>
                        <p className="text-3xl font-bold mt-1">{stats.drafts}</p>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <Card hover={false} className="p-5 lg:col-span-1">
                    <h2 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wide">Go-Live Ratio</h2>
                    <div className="mt-5 flex items-center justify-center">
                        <div className="w-36 h-36 rounded-full p-3" style={ringStyle}>
                            <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center">
                                <p className="text-3xl font-bold text-charcoal-800">{publishRate}%</p>
                                <p className="text-xs text-charcoal-500">Published</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-charcoal-500 mt-4 text-center">
                        {stats.published} live out of {stats.total} innovation briefs.
                    </p>
                </Card>

                <Card hover={false} className="p-5 lg:col-span-2">
                    <h2 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wide">Innovation Pipeline</h2>
                    <div className="mt-5 space-y-4">
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-charcoal-600">Live Innovations</span>
                                <span className="font-semibold text-charcoal-800">{stats.published}</span>
                            </div>
                            <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-terracotta-500 to-terracotta-700"
                                    style={{ width: `${stats.total ? (stats.published / stats.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-charcoal-600">Draft Innovations</span>
                                <span className="font-semibold text-charcoal-800">{stats.drafts}</span>
                            </div>
                            <div className="h-3 rounded-full bg-sand-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-coral-400 to-coral-600"
                                    style={{ width: `${stats.total ? (stats.drafts / stats.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-charcoal-800">Recent Innovation Briefs</h2>
                    <Link to="/pocs">
                        <Button variant="ghost" size="sm">View all</Button>
                    </Link>
                </div>

                {recentPocs.length === 0 ? (
                    <Card hover={false} className="p-8 text-center">
                        <p className="text-charcoal-500">No innovation briefs yet.</p>
                        {(user?.role === 'admin' || user?.role === 'developer') && (
                            <Link to="/pocs/new">
                                <Button variant="outline" size="sm" className="mt-3">Create your first Innovation Brief</Button>
                            </Link>
                        )}
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {recentPocs.map((poc) => (
                            <Link key={poc._id} to={`/pocs/${poc._id}`}>
                                <Card className="p-4 flex items-center gap-4">
                                    {poc.thumbnail ? (
                                        <img
                                            src={poc.thumbnail}
                                            alt={poc.title}
                                            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getThumbnailGradient(poc._id || poc.title)} flex items-center justify-center flex-shrink-0`}>
                                            <svg className="w-6 h-6 text-white/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-charcoal-800 truncate">{poc.title}</h3>
                                        <p className="text-sm text-charcoal-500 truncate">{poc.description}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <Badge color={poc.status === 'published' ? 'green' : 'amber'}>
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
