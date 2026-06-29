import { api } from './api';
export type SessionUser = { _id?: string; id?: string; username: string; firstName: string; lastName: string; roles: string[]; permissionOverrides: string[]; permissionDeniedOverrides?: string[]; salonIds: string[]; managedSalonIds?: string[] };
export const login = (username: string, password: string) => api.post<{ user: SessionUser }>('/auth/login', { username, password });
export const logout = () => api.post<{ loggedOut: boolean }>('/auth/logout');
export const getCurrentUser = async () => (await api.get<{ user: SessionUser }>('/auth/me')).user;
