import { api } from './api';
export type SessionUser = { _id?: string; id?: string; username: string; email?: string; phone?: string; documentType?: string; documentNumber?: string; avatarUrl?: string; firstName: string; lastName: string; fullName?: string; roles: string[]; permissionOverrides: string[]; permissionDeniedOverrides?: string[]; salonIds: string[]; managedSalonIds?: string[] };
export const login = (username: string, password: string) => api.post<{ user: SessionUser }>('/auth/login', { username, password });
export const logout = () => api.post<{ loggedOut: boolean }>('/auth/logout');
export const getCurrentUser = async () => (await api.get<{ user: SessionUser }>('/auth/me')).user;
export const updateProfile = (body: Pick<SessionUser, 'firstName' | 'lastName' | 'email' | 'phone' | 'documentType' | 'documentNumber' | 'avatarUrl'>) => api.patch<{ user: SessionUser }>('/auth/profile', body);
export const changePassword = (body: { currentPassword: string; newPassword: string }) => api.patch<{ changed: boolean }>('/auth/password', body);
