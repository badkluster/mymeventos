import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';

const ROW_HEIGHT = 44;
const hours = Array.from({ length: 24 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function fromHhMm(value?: string): { hour: number; minute: number } | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null;
}

export function TimePickerField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (value: string) => void; hint?: string }) {
  const parsed = fromHhMm(value);
  const [visible, setVisible] = useState(false);
  const [hour, setHour] = useState(parsed?.hour ?? 0);
  const [minute, setMinute] = useState(parsed?.minute ?? 0);
  const hourListRef = useRef<ScrollView>(null);
  const minuteListRef = useRef<ScrollView>(null);

  function open() {
    const current = fromHhMm(value);
    const nextHour = current?.hour ?? 0;
    const nextMinute = current?.minute ?? 0;
    setHour(nextHour);
    setMinute(nextMinute);
    setVisible(true);
    requestAnimationFrame(() => {
      hourListRef.current?.scrollTo({ y: nextHour * ROW_HEIGHT, animated: false });
      minuteListRef.current?.scrollTo({ y: nextMinute * ROW_HEIGHT, animated: false });
    });
  }

  function confirm() {
    onChange(`${pad(hour)}:${pad(minute)}`);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${parsed ? value : 'sin definir'}`}>
        <Text style={[styles.value, !parsed && styles.placeholder]}>{parsed ? value : 'Seleccionar hora'}</Text>
        <View style={styles.clockIcon}>
          <View style={styles.clockGlyph}>
            <View style={styles.clockHandMinute} />
            <View style={styles.clockHandHour} />
          </View>
        </View>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} accessibilityLabel="Cerrar selector de hora" />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{label}</Text>
            <View style={styles.pickerRow}>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>Hora</Text>
                <View style={styles.listFrame}>
                  <ScrollView ref={hourListRef} showsVerticalScrollIndicator={false} snapToInterval={ROW_HEIGHT} decelerationRate="fast">
                    {hours.map((item) => (
                      <Pressable key={item} style={[styles.row, item === hour && styles.rowSelected]} onPress={() => setHour(item)} accessibilityRole="button" accessibilityLabel={`Hora ${pad(item)}`}>
                        <Text style={[styles.rowText, item === hour && styles.rowTextSelected]}>{pad(item)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <Text style={styles.colon}>:</Text>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>Minutos</Text>
                <View style={styles.listFrame}>
                  <ScrollView ref={minuteListRef} showsVerticalScrollIndicator={false} snapToInterval={ROW_HEIGHT} decelerationRate="fast">
                    {minutes.map((item) => (
                      <Pressable key={item} style={[styles.row, item === minute && styles.rowSelected]} onPress={() => setMinute(item)} accessibilityRole="button" accessibilityLabel={`Minuto ${pad(item)}`}>
                        <Text style={[styles.rowText, item === minute && styles.rowTextSelected]}>{pad(item)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => { onChange(''); setVisible(false); }}><Text style={styles.clearAction}>Borrar hora</Text></Pressable>
              <Pressable onPress={confirm}><Text style={styles.closeAction}>Listo</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  field: { minHeight: 54, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FBFDFF', paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 16, color: colors.text },
  placeholder: { color: colors.textSubtle },
  clockIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  clockGlyph: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primarySoft },
  clockHandMinute: { position: 'absolute', width: 1.5, height: 5, left: 7.25, top: 3, borderRadius: 1, backgroundColor: colors.primarySoft },
  clockHandHour: { position: 'absolute', width: 4.5, height: 1.5, left: 7.6, top: 7.6, borderRadius: 1, backgroundColor: colors.primarySoft, transform: [{ rotate: '35deg' }] },
  hint: { ...typography.small, color: colors.textSubtle },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.xl, gap: spacing.md, ...shadow.card },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.surfaceStrong, marginBottom: spacing.xs },
  sheetTitle: { ...typography.h2, color: colors.text },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  column: { alignItems: 'center', gap: spacing.xs, width: 96 },
  columnLabel: { ...typography.caption, color: colors.textSubtle, fontWeight: '700' },
  listFrame: { height: ROW_HEIGHT * 5, width: '100%', borderRadius: radii.md, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  colon: { ...typography.h1, color: colors.textSubtle, marginTop: spacing.lg },
  row: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  rowSelected: { backgroundColor: colors.primary },
  rowText: { ...typography.bodyStrong, color: colors.text },
  rowTextSelected: { color: colors.primaryText },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginTop: spacing.xs },
  clearAction: { ...typography.bodyStrong, color: colors.danger },
  closeAction: { ...typography.bodyStrong, color: colors.primarySoft }
});
