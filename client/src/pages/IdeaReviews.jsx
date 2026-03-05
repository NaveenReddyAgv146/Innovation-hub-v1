import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { pocService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

export default function IdeaReviews() {
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [publishingId, setPublishingId] = useState('');

    const fetchIdeas = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await pocService.getAll({ page: 1, limit: 50, status: 'draft' });
            setIdeas(data.pocs || []);
        } catch {
            setError('Failed to load idea review queue');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchIdeas();
    }, [fetchIdeas]);

    const handlePublish = async (idea) => {
        setPublishingId(idea._id);
        setError('');
        try {
            await pocService.publish(idea._id);
            setIdeas((prev) => prev.filter((item) => item._id !== idea._id));
        } catch {
            setError('Failed to publish idea');
        } finally {
            setPublishingId('');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-charcoal-800">Idea Reviews</h1>
                    <p className="text-charcoal-500 text-sm mt-0.5">
                        Review submitted ideas and publish approved ones for all users.
                    </p>
                </div>
                <Button type="button" variant="ghost" onClick={fetchIdeas}>
                    Refresh Queue
                </Button>
            </div>

            {loading ? (
                <Spinner size="lg" className="mt-12" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchIdeas} />
            ) : ideas.length === 0 ? (
                <EmptyState
                    title="No ideas pending review"
                    message="When users submit ideas, they will appear here for admin review and publishing."
                    icon={
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    }
                />
            ) : (
                <div className="space-y-4">
                    {ideas.map((idea) => (
                        <Card key={idea._id} hover={false} className="p-5 sm:p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Badge color="amber">Pending</Badge>
                                        <span className="text-xs text-charcoal-500">{idea.votesCount || 0} interested</span>
                                        <span className="text-xs text-charcoal-500">
                                            Submitted {new Date(idea.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <h2 className="text-lg font-semibold text-charcoal-800">{idea.title}</h2>
                                    <p className="text-sm text-charcoal-600 whitespace-pre-line line-clamp-3">
                                        {idea.description || idea.challenges || 'No summary provided yet.'}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-charcoal-500">
                                        <span>By {idea.author?.name || idea.requestorName || 'Unknown'}</span>
                                        {idea.customer && (
                                            <>
                                                <span>·</span>
                                                <span>{idea.customer}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 sm:ml-4">
                                    <Link to={`/pocs/${idea._id}`}>
                                        <Button type="button" variant="outline" size="sm">View</Button>
                                    </Link>
                                    <Button
                                        type="button"
                                        size="sm"
                                        loading={publishingId === idea._id}
                                        onClick={() => handlePublish(idea)}
                                    >
                                        Publish
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
