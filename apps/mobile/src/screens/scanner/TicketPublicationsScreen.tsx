import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { api, ApiClientError } from '../../lib/api';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
import type { ScannerStackParamList } from '../../navigation/types';
import type { TicketPublicationOption } from '../../types/tickets';

type Props = NativeStackScreenProps<ScannerStackParamList, 'TicketPublications'>;

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  active: 'Activa',
  paused: 'Pausada',
  sold_out: 'Agotada',
  closed: 'Cerrada',
  cancelled: 'Cancelada'
};

function statusTone(status: string): StatusTone {
  if (status === 'active') return 'ok';
  if (status === 'scheduled') return 'info';
  if (status === 'paused' || status === 'sold_out') return 'warn';
  if (status === 'cancelled') return 'bad';
  return 'neutral';
}

function formatDate(value?: string): string {
  if (!value) return 'Fecha a confirmar';
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ARGENTINA_TIME_ZONE
  }).format(new Date(value));
}

export function TicketPublicationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [publications, setPublications] = useState<TicketPublicationOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await api.get<{ publications: TicketPublicationOption[] }>('/tickets/publications/check-in-options');
      setPublications(response.publications ?? []);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'No se pudieron cargar los eventos con entradas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visiblePublications = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-AR');
    const now = Date.now();
    return publications
      .filter((publication) => !term
        || publication.title.toLocaleLowerCase('es-AR').includes(term)
        || (publication.venueName ?? '').toLocaleLowerCase('es-AR').includes(term))
      .sort((first, second) => {
        const firstDistance = first.startsAt ? Math.abs(new Date(first.startsAt).getTime() - now) : Number.POSITIVE_INFINITY;
        const secondDistance = second.startsAt ? Math.abs(new Date(second.startsAt).getTime() - now) : Number.POSITIVE_INFINITY;
        return firstDistance - secondDistance;
      });
  }, [publications, search]);

  return (
    <View style={styles.screen}>
      <AmbientBackdrop />
      <FlatList
        data={visiblePublications}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={(
          <>
            <AnimatedEntrance distance={22}>
              <View style={styles.hero}>
                <View style={styles.heroGlow} />
                <Text style={styles.eyebrow}>CONTROL DE ACCESO</Text>
                <Text style={styles.title}>Escanear{`\n`}entradas</Text>
                <Text style={styles.subtitle}>Elegí el evento antes de leer el QR. Cada ingreso se valida en tiempo real contra el servidor.</Text>
                <View style={styles.onlinePill}><View style={styles.onlineDot} /><Text style={styles.onlineText}>VALIDACIÓN ONLINE</Text></View>
              </View>
            </AnimatedEntrance>
            <AnimatedEntrance delay={80} distance={12}>
              <View style={styles.searchBox}>
                <View style={styles.searchIcon}><View style={styles.searchCircle} /><View style={styles.searchHandle} /></View>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar por evento o lugar"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  returnKeyType="search"
                  accessibilityLabel="Buscar evento"
                />
              </View>
            </AnimatedEntrance>
            <Text style={styles.sectionLabel}>EVENTOS DISPONIBLES</Text>
          </>
        )}
        ListEmptyComponent={loading
          ? <LoadingState label="Cargando eventos…" />
          : error
            ? <ErrorState message={error} onRetry={() => void load()} />
            : <EmptyState title="No hay eventos para escanear" description={search ? 'Probá con otro nombre o lugar.' : 'Cuando haya una publicación habilitada, aparecerá acá.'} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item, index }) => (
          <AnimatedEntrance delay={Math.min(120 + index * 35, 300)} distance={10}>
            <Pressable
              onPress={() => navigation.navigate('TicketScanner', { publication: item })}
              accessibilityRole="button"
              accessibilityLabel={`Escanear entradas para ${item.title}`}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                <View style={styles.ticketMark}><View style={styles.ticketCutTop} /><View style={styles.ticketCutBottom} /><Text style={styles.ticketMarkText}>QR</Text></View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDate}>{formatDate(item.startsAt)}</Text>
                  {item.venueName ? <Text style={styles.cardVenue}>{item.venueName}</Text> : null}
                </View>
                <StatusBadge label={statusLabels[item.status] ?? item.status} tone={statusTone(item.status)} />
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAction}>Abrir escáner</Text>
                <Text style={styles.cardArrow}>›</Text>
              </View>
            </Pressable>
          </AnimatedEntrance>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },
  hero: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm, marginBottom: spacing.lg, ...shadow.card },
  heroGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 110, backgroundColor: 'rgba(34,211,238,0.18)', right: -65, top: -80 },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typography.display, color: colors.primaryText, lineHeight: 38 },
  subtitle: { ...typography.small, color: '#B6C7DD', lineHeight: 19, maxWidth: 300 },
  onlinePill: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#55E9A7' },
  onlineText: { ...typography.caption, color: colors.primaryText, fontWeight: '800', letterSpacing: 0.65 },
  searchBox: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, marginBottom: spacing.lg, ...shadow.card },
  searchIcon: { width: 20, height: 20 },
  searchCircle: { position: 'absolute', left: 1, top: 1, width: 13, height: 13, borderWidth: 2, borderColor: colors.textMuted, borderRadius: 8 },
  searchHandle: { position: 'absolute', width: 8, height: 2, backgroundColor: colors.textMuted, right: 0, bottom: 3, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  searchInput: { flex: 1, minHeight: 52, color: colors.text, fontSize: 15 },
  sectionLabel: { ...typography.caption, color: colors.textSubtle, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm },
  card: { overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6EDF7', borderRadius: radii.xl, ...shadow.card },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  ticketMark: { width: 46, height: 54, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ticketCutTop: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface, left: -5, top: 11 },
  ticketCutBottom: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface, left: -5, bottom: 11 },
  ticketMarkText: { ...typography.bodyStrong, color: colors.primarySoft, letterSpacing: 0.5 },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { ...typography.bodyStrong, color: colors.text, fontSize: 16 },
  cardDate: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  cardVenue: { ...typography.caption, color: colors.textSubtle },
  cardFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EDF2F8', paddingHorizontal: spacing.lg, backgroundColor: '#FBFDFF' },
  cardAction: { ...typography.small, color: colors.primarySoft, fontWeight: '700' },
  cardArrow: { fontSize: 25, lineHeight: 26, color: colors.primarySoft }
});
