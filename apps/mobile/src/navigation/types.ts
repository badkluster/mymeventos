import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string; username?: string } | undefined;
};

export type HomeStackParamList = {
  Home: undefined;
};

export type HistoryStackParamList = {
  History: undefined;
  WorkSessionDetail: { sessionId: string };
  Incidents: undefined;
  NewIncident: { workSessionId?: string } | undefined;
  Adjustments: undefined;
  NewAdjustment: { workSessionId: string };
};

export type ScheduleStackParamList = {
  Schedule: undefined;
};

export type NotificationsStackParamList = {
  Notifications: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  BiometricSettings: undefined;
  ActiveSessions: undefined;
};

export type AppTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  HistoryTab: NavigatorScreenParams<HistoryStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};
