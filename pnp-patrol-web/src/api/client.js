/**
 * R.O.N.D.A. — Axios client with JWT attachment and refresh.
 */
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.101.82:8000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshPromise = null;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.url.includes('/auth/token/')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (!original) return Promise.reject(err);

    if (err.response?.status === 401 && !original._retry && !String(original.url || '').includes('/auth/token/')) {
      original._retry = true;

      const refresh = localStorage.getItem('refreshToken');
      if (!refresh) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(err);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = axios
          .post(`${BASE_URL}/auth/token/refresh/`, { refresh })
          .then(({ data }) => {
            localStorage.setItem('accessToken', data.access);
            onRefreshed(data.access);
            return data.access;
          })
          .catch((e) => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            throw e;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          try {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          } catch (e) {
            reject(e);
          }
        });

        if (refreshPromise) {
          refreshPromise.catch(reject);
        }
      });
    }

    return Promise.reject(err);
  }
);

export default api;
