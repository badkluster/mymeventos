export type BackofficeNotification = {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  readAt?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsResponse = {
  notifications: BackofficeNotification[];
  unreadCount: number;
};
