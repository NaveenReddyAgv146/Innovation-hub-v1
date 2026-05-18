export const SUPER_ADMIN_EMAIL = 'admin@agivant.com';

const LEGACY_TRACK_ADMIN_EMAILS = {
    'delivery.admin@agivant.com': 'Delivery',
    'sales.admin@agivant.com': 'GTM/Sales',
    'learning.admin@agivant.com': 'Learning',
    'solution.admin@agivant.com': 'Solutions',
    'solutionadmin@agivant.com': 'Solutions',
    'leadership.admin@agivant.com': 'Organizational Building & Thought Leadership',
};

export const isSuperAdmin = (user) =>
    String(user?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;

export const getAssignedAdminTrack = (user) => {
    if (user?.role !== 'admin') return '';
    if (user?.adminTrack) return user.adminTrack;
    const email = String(user?.email || '').trim().toLowerCase();
    return LEGACY_TRACK_ADMIN_EMAILS[email] || '';
};

// Global admin = super admin email OR role=admin with no track assignment
export const isGlobalAdmin = (user) =>
    isSuperAdmin(user) || (user?.role === 'admin' && !getAssignedAdminTrack(user));

export const hasTrackDashboardAccess = (user) => Boolean(getAssignedAdminTrack(user));
