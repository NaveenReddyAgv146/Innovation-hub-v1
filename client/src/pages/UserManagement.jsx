import { useState, useEffect, useCallback } from 'react';
import { userService } from '../services/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';

const ROLE_COLORS = { admin: 'coral', developer: 'terracotta', viewer: 'sand' };
const getFullName = (user = {}) =>
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.name || 'Unknown';
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

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'viewer', employeeId: '' });
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleteUser, setDeleteUser] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const fetchUsers = useCallback(async (page = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = { page, limit: 10 };
            if (search) params.search = search;
            const { data } = await userService.getAll(params);
            setUsers(data.users);
            setPagination(data.pagination);
        } catch {
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const debounce = setTimeout(() => fetchUsers(1), 300);
        return () => clearTimeout(debounce);
    }, [fetchUsers]);

    const openCreateModal = () => {
        setEditUser(null);
        setFormData({ firstName: '', lastName: '', email: '', password: '', role: 'viewer', employeeId: '' });
        setFormError('');
        setModalOpen(true);
    };

    const openEditModal = (user) => {
        const fullName = (user.name || '').trim();
        const nameParts = fullName ? fullName.split(' ', 2) : [];
        setEditUser(user);
        setFormData({
            firstName: user.firstName || nameParts[0] || '',
            lastName: user.lastName || nameParts.slice(1).join(' ') || '',
            email: user.email,
            password: '',
            role: user.role,
            employeeId: user.employeeId || '',
        });
        setFormError('');
        setModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setFormError('');
        if (formData.role === 'viewer' && !formData.employeeId.trim()) {
            setFormError('Employee ID is required for viewer users');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...formData,
                employeeId: formData.employeeId.trim(),
            };
            if (!payload.employeeId) delete payload.employeeId;
            if (editUser) {
                if (!payload.password) delete payload.password;
                await userService.update(editUser._id, payload);
            } else {
                await userService.create(payload);
            }
            setModalOpen(false);
            fetchUsers(pagination.page);
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Operation failed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setDeleting(true);
        try {
            await userService.delete(deleteUser._id);
            setDeleteUser(null);
            fetchUsers(pagination.page);
        } catch {
            setError('Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-charcoal-800">User Management</h1>
                    <p className="text-charcoal-500 text-sm mt-0.5">{pagination.total} user{pagination.total !== 1 ? 's' : ''}</p>
                </div>
                <Button onClick={openCreateModal}>+ New User</Button>
            </div>

            {/* Search */}
            <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                }
            />

            {/* Table */}
            {loading ? (
                <Spinner size="lg" className="mt-12" />
            ) : error ? (
                <ErrorState message={error} onRetry={() => fetchUsers(1)} />
            ) : users.length === 0 ? (
                <EmptyState
                    title="No users found"
                    message="Try adjusting your search."
                    icon={
                        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
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
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Joined</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-sand-100">
                                {users.map((u) => (
                                    <tr key={u._id} className="hover:bg-sand-50/50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-terracotta-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                                    {getFullName(u)?.charAt(0)?.toUpperCase() || 'U'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-charcoal-800">{getFullName(u)}</p>
                                                    <p className="text-xs text-charcoal-500">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <Badge color={ROLE_COLORS[u.role]}>{u.role}</Badge>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-charcoal-500">
                                            {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(u)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-charcoal-600 hover:bg-sand-100 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => setDeleteUser(u)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-coral-600 hover:bg-coral-50 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Pagination page={pagination.page} pages={pagination.pages} onPageChange={(p) => fetchUsers(p)} />

            {/* Create / Edit Modal */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? 'Edit User' : 'Create User'}>
                {formError && (
                    <div className="mb-4 p-3 rounded-xl bg-coral-50 border border-coral-200 text-sm text-coral-600">
                        {formError}
                    </div>
                )}
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="First Name"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        required
                    />
                    <Input
                        label="Last Name"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        required
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                    />
                    <Input
                        label={editUser ? 'Password (leave blank to keep)' : 'Password'}
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!editUser}
                    />
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-charcoal-700">Role</label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full rounded-xl border border-sand-300 bg-white px-4 py-2.5 text-sm text-charcoal-800 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none transition-all duration-200"
                        >
                            <option value="viewer">Viewer</option>
                            <option value="developer">Developer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    {formData.role === 'viewer' && (
                        <Input
                            label="Employee ID"
                            value={formData.employeeId}
                            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                            required
                        />
                    )}
                    <div className="flex gap-3 pt-2">
                        <Button type="submit" loading={saving}>
                            {editUser ? 'Update' : 'Create'}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={Boolean(deleteUser)}
                onClose={() => !deleting && setDeleteUser(null)}
                title="Delete User"
                size="sm"
            >
                <p className="text-sm text-charcoal-600">
                    Are you sure you want to delete{' '}
                    <span className="font-semibold text-charcoal-800">{deleteUser ? getFullName(deleteUser) : ''}</span>?
                    This action cannot be undone.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => setDeleteUser(null)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
                        Delete
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
