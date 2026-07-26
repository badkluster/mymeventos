import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing, typography } from '../../theme/tokens';

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ notifications: NotificationItem[]; unreadCount: number }>('/notifications');
      setItems(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar los avisos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function markRead(id: string) {
    setItems((current) => current.map((item) => item._id === id ? { ...item, readAt: new Date().toISOString() } : item));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // best-effort: a subsequent load() will reconcile
    }
  }

  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.patch('/notifications/read-all');
    } catch {
      // best-effort
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader
        title="Notificaciones"
        description={unreadCount ? `${unreadCount} sin leer` : 'Estás al día.'}
        action={unreadCount ? <AppButton title="Marcar todo" variant="secondary" fullWidth={false} onPress={() => void markAllRead()} /> : undefined}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => !item.readAt && void markRead(item._id)} style={[styles.item, !item.readAt && styles.itemUnread]}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.date}>{formatDateTime(item.createdAt)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState title="Sin notificaciones" description="Los avisos administrativos y recordatorios van a aparecer acá." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  list: { paddingBottom: spacing.xxl },
  item: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, gap: 4 },
  itemUnread: { borderColor: colors.text },
  title: { ...typography.bodyStrong, color: colors.text },
  message: { ...typography.small, color: colors.textMuted },
  date: { ...typography.caption, color: colors.textSubtle }
});
