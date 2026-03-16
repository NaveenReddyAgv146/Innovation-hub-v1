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
    finish: (id) => api.post(`/pocs/${id}/finish`),
    markDraft: (id) => api.post(`/pocs/${id}/mark-draft`),
    upvote: (id) => api.post(`/pocs/${id}/upvote`),
    removeUpvote: (id) => api.delete(`/pocs/${id}/upvote`),
    getVoters: (id) => api.get(`/pocs/${id}/voters`),
};

export const userService = {
    getAll: (params) => api.get('/users', { params }),
    getInterests: (params) => api.get('/users/interests', { params }),
    getById: (id) => api.get(`/users/${id}`),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};
