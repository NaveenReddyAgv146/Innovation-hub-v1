export const SUBADMIN_TRACK_BY_EMAIL = {
    'delivery.admin@agivant.com': 'Delivery',
    'sales.admin@agivant.com': 'GTM/Sales',
    'learning.admin@agivant.com': 'Learning',
    'solutionadmin@agivant.com': 'Solutions',
};

export const getSubadminTrack = (email = '') => {
    if (!email) return '';
    return SUBADMIN_TRACK_BY_EMAIL[email.trim().toLowerCase()] || '';
};
