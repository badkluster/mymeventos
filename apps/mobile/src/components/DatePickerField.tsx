import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';

const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function fromIsoDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function toIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDisplayDate(value?: string) {
  const date = fromIsoDate(value);
  if (!date) return 'Seleccionar fecha';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function monthDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leadingEmptyDays = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((leadingEmptyDays + dayCount) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingEmptyDays + 1;
    return day > 0 && day <= dayCount ? new Date(year, monthIndex, day) : null;
  });
}

export function DatePickerField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (value: string) => void; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const [viewingMonth, setViewingMonth] = useState(() => fromIsoDate(value) ?? new Date());
  const selectedDate = fromIsoDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = useMemo(() => monthDays(viewingMonth), [viewingMonth]);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(viewingMonth);
  const canGoForward = viewingMonth.getFullYear() < today.getFullYear() || (
    viewingMonth.getFullYear() === today.getFullYear() && viewingMonth.getMonth() < today.getMonth()
  );

  function open() {
    setViewingMonth(selectedDate ?? today);
    setVisible(true);
  }

  function moveMonth(amount: number) {
    setViewingMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${formatDisplayDate(value)}`}>
        <Text style={[styles.value, !selectedDate && styles.placeholder]}>{formatDisplayDate(value)}</Text>
        <View style={styles.calendarIcon}><Text style={styles.calendarIconText}>□</Text></View>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} accessibilityLabel="Cerrar calendario" />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetEyebrow}>DATOS PERSONALES</Text>
            <Text style={styles.sheetTitle}>Fecha de nacimiento</Text>
            <View style={styles.monthControls}>
              <Pressable style={styles.monthButton} onPress={() => moveMonth(-1)} accessibilityRole="button" accessibilityLabel="Mes anterior"><Text style={styles.monthButtonText}>‹</Text></Pressable>
              <Text style={styles.monthTitle}>{monthLabel}</Text>
              <Pressable style={[styles.monthButton, !canGoForward && styles.monthButtonDisabled]} onPress={() => canGoForward && moveMonth(1)} accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={!canGoForward}><Text style={styles.monthButtonText}>›</Text></Pressable>
            </View>
            <View style={styles.weekRow}>
              {weekDays.map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}
            </View>
            <View style={styles.grid}>
              {days.map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const disabled = day.getTime() > today.getTime();
                const selected = selectedDate ? isSameDay(day, selectedDate) : false;
                const isToday = isSameDay(day, today);
                return (
                  <Pressable
                    key={toIsoDate(day)}
                    style={[styles.dayCell, styles.dayButton, selected && styles.daySelected, isToday && !selected && styles.dayToday, disabled && styles.dayDisabled]}
                    disabled={disabled}
                    onPress={() => { onChange(toIsoDate(day)); setVisible(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(day)}`}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected, disabled && styles.dayTextDisabled]}>{day.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => { onChange(''); setVisible(false); }}><Text style={styles.clearAction}>Borrar fecha</Text></Pressable>
              <Pressable onPress={() => setVisible(false)}><Text style={styles.closeAction}>Listo</Text></Pressable>
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
  calendarIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  calendarIconText: { color: colors.primarySoft, fontSize: 18, fontWeight: '800', marginTop: -2 },
  hint: { ...typography.small, color: colors.textSubtle },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.xl, gap: spacing.md, ...shadow.card },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.surfaceStrong, marginBottom: spacing.xs },
  sheetEyebrow: { ...typography.caption, color: colors.violet, fontWeight: '700', letterSpacing: 1 },
  sheetTitle: { ...typography.h2, color: colors.text },
  monthControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  monthButton: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  monthButtonDisabled: { opacity: 0.35 },
  monthButtonText: { fontSize: 28, color: colors.primarySoft, lineHeight: 32 },
  monthTitle: { ...typography.bodyStrong, color: colors.text, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: '14.2857%', textAlign: 'center', ...typography.caption, color: colors.textSubtle, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: 41, alignItems: 'center', justifyContent: 'center' },
  dayButton: { borderRadius: radii.md },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayDisabled: { opacity: 0.28 },
  dayText: { ...typography.bodyStrong, color: colors.text },
  dayTextSelected: { color: colors.primaryText },
  dayTextDisabled: { color: colors.textSubtle },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginTop: spacing.xs },
  clearAction: { ...typography.bodyStrong, color: colors.danger },
  closeAction: { ...typography.bodyStrong, color: colors.primarySoft }
});
