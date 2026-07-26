export interface SessionUser {
  _id: string;
  username: string;
  email?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
  avatarUrl?: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  roles: string[];
  active?: boolean;
  salonIds?: string[];
  primarySalonId?: string;
  staffProfile?: { staffCode?: string; staffSubroles?: string[]; employmentStatus?: string };
  attendanceConfig?: { enabled?: boolean; canUseMobileApp?: boolean; requiresGeolocation?: boolean };
}

export interface MobileDevice {
  _id: string;
  installationId: string;
  platform: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  isActive: boolean;
  isTrusted?: boolean;
  lastLoginAt?: string;
  lastUsedAt?: string;
}
