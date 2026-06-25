import { Role } from '@mym/shared';
import { User } from '../users/user.model';
import { Notification } from './notification.model';
import { sendEmail } from '../email/email.service';

type NotificationInput = { type: string; title: string; message: string; actionUrl?: string; metadata?: unknown; recipientUserIds?: string[] };
export async function createNotifications(input: NotificationInput): Promise<void> {
  const recipients = input.recipientUserIds?.length ? await User.find({ _id: { $in: input.recipientUserIds }, active: true, deletedAt: null }).select('_id email firstName').lean() : await User.find({ roles: Role.ADMIN, active: true, deletedAt: null }).select('_id email firstName').lean();
  if (!recipients.length) return;
  await Notification.insertMany(recipients.map((user: any) => ({ userId: user._id, type: input.type, title: input.title, message: input.message, actionUrl: input.actionUrl, metadata: input.metadata })));
  await Promise.allSettled(recipients.filter((user: any) => user.email).map((user: any) => sendEmail({ to: user.email, subject: input.title, text: `${input.message}\n\nM&M Eventos` })));
}
