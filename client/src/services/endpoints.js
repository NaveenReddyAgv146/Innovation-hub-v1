import api from './api';

export const authService = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    refresh: (data) => api.post('/auth/refresh', data),
    logout: () => api.post('/auth/logout'),
    getMe: () => api.get('/auth/me'),
};

export const pocService = {
    getAll: (params) => api.get('/pocs', { params }),
    getById: (id) => api.get(`/pocs/${id}`),
    create: (data) => {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (key === 'techStack') {
                formData.append(key, JSON.stringify(value));
            } else if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        });
        return api.post('/pocs', formData);
    },
    update: (id, data) => {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (key === 'techStack') {
                formData.append(key, JSON.stringify(value));
            } else if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        });
        return api.put(`/pocs/${id}`, formData);
    },
    delete: (id) => api.delete(`/pocs/${id}`),
    publish: (id) => api.post(`/pocs/${id}/publish`),
    goLive: (id) => api.post(`/pocs/${id}/go-live`),
    finish: (id) => api.post(`/pocs/${id}/finish`),
    markDraft: (id) => api.post(`/pocs/${id}/mark-draft`),
    cancel: (id, reason) => {
        const formData = new FormData();
        formData.append('reason', reason);
        return api.post(`/pocs/${id}/cancel`, formData);
    },
    updateCancelReason: (id, reason) => {
        const formData = new FormData();
        formData.append('reason', reason);
        return api.post(`/pocs/${id}/cancel-reason`, formData);
    },
    upvote: (id, data) => {
        const formData = new FormData();
        Object.entries(data || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                formData.append(key, value);
            }
        });
        return api.post(`/pocs/${id}/upvote`, formData);
    },
    removeUpvote: (id) => api.delete(`/pocs/${id}/upvote`),
    getVoters: (id) => api.get(`/pocs/${id}/voters`),
    approveUser: (id, userId) => {
        const formData = new FormData();
        formData.append('userId', userId);
        return api.post(`/pocs/${id}/approve-user`, formData);
    },
    unapproveUser: (id, userId) => {
        const formData = new FormData();
        formData.append('userId', userId);
        return api.post(`/pocs/${id}/unapprove-user`, formData);
    },
    addAdminFeedback: (id, userId, feedback) => {
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('feedback', feedback);
        return api.post(`/pocs/${id}/admin-feedback`, formData);
    },
    addUserFeedback: (id, feedback) => {
        const formData = new FormData();
        formData.append('feedback', feedback);
        return api.post(`/pocs/${id}/user-feedback`, formData);
    },
};

export const userService = {
    getAll: (params) => api.get('/users', { params }),
    getDirectory: (params) => api.get('/users/directory', { params }),
    getInterests: (params) => api.get('/users/interests', { params }),
    getLeaderboard: (params) => api.get('/users/leaderboard', { params }),
    getMyCredits: () => api.get('/users/my-credits'),
    getById: (id) => api.get(`/users/${id}`),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};
