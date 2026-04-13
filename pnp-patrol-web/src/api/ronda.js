/**
 * R.O.N.D.A. — API calls for dashboard.
 */
import api from './client';

export const auth = {
  login: (username, password) =>
    api.post('/auth/token/', { username, password }).then((r) => r.data),
};

export const branches = {
  list: () => api.get('/branches/').then((r) => r.data),
  get: (id) => api.get(`/branches/${id}/`).then((r) => r.data),
  create: (payload) => api.post('/branches/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/branches/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/branches/${id}/`).then((r) => r.data),
};

export const users = {
  list: () => api.get('/users/').then((r) => r.data),
  create: (payload) => api.post('/users/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/users/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}/`).then((r) => r.data),
};

export const vehicles = {
  list: () => api.get('/vehicles/').then((r) => r.data),
  create: (payload) => api.post('/vehicles/', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/vehicles/${id}/`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/vehicles/${id}/`).then((r) => r.data),
};

export const sessions = {
  list: (params) => api.get('/sessions/', { params }).then((r) => r.data),
  get: (id) => api.get(`/sessions/${id}/`).then((r) => r.data),
  live: () => api.get('/sessions/live/').then((r) => r.data),
  matchedRoute: (id, params) => api.get(`/sessions/${id}/matched-route/`, { params }).then((r) => r.data),
  remove: (id) => api.delete(`/sessions/${id}/`).then((r) => r.data),
};

export const gpsLogs = {
  list: (params) => api.get('/gps-logs/', { params }).then((r) => r.data),
  sessionRoute: (sessionId) => api.get(`/gps-logs/session-route/?session_id=${sessionId}`).then((r) => r.data),
};

export const ping = {
  send: (driverId) => api.post('/ping/send/', { driver_id: driverId }).then((r) => r.data),
  respond: (pingId, response, latitude, longitude) => 
    api.post('/ping/respond/', { ping_id: pingId, response, latitude, longitude }).then((r) => r.data),
  active: () => api.get('/ping/active/').then((r) => r.data),
};
