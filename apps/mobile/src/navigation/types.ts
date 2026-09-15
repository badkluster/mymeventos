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
  NewAdjustment: { workSessionId: string; currentStartedAt?: string; currentEndedAt?: string };
};

export type ScheduleStackParamList = {
  Schedule: undefined;
};

export type NotificationsStackParamList = {
  Notifications: undefined;
};

export type ScannerStackParamList = {
  TicketPublications: undefined;
  TicketScanner: {
    publication: {
      _id: string;
      title: string;
      status: string;
      startsAt?: string;
      endsAt?: string;
      venueName?: string;
      qrConfig?: { validFrom?: string; validUntil?: string };
    };
  };
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
  ScannerTab: NavigatorScreenParams<ScannerStackParamList>;
  HistoryTab: NavigatorScreenParams<HistoryStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};
