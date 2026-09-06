import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../lib/theme/store';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  value: string;          // YYYY-MM
  onChange: (ym: string) => void;
  maxMonth?: string;      // YYYY-MM — months after this are disabled
  minMonth?: string;      // YYYY-MM — months before this are disabled
  label: string;
}

export function MonthPickerModal({ value, onChange, maxMonth, minMonth, label }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [open, setOpen] = useState(false);

  const [year, month] = value.split('-').map(Number);
  const [pickerYear, setPickerYear] = useState(year);

  function ym(y: number, m: number): string {
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  function isDisabled(m: number): boolean {
    const candidate = ym(pickerYear, m);
    if (maxMonth && candidate > maxMonth) return true;
    if (minMonth && candidate < minMonth) return true;
    return false;
  }

  function select(m: number) {
    if (isDisabled(m)) return;
    onChange(ym(pickerYear, m));
    setOpen(false);
  }

  function openPicker() {
    setPickerYear(year);
    setOpen(true);
  }

  const displayLabel = MONTH_LABELS[month - 1] + ' ' + year;

  return (
    <>
      <View>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        <Pressable
          onPress={openPicker}
          style={({ pressed }) => [
            s.trigger,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayLabel}, tap to change`}
        >
          <Ionicons name="calendar-outline" size={15} color={colors.primary} />
          <Text style={[s.triggerText, { color: colors.text }]}>{displayLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.surface, shadowColor: '#000' }]} onPress={() => {}}>
            {/* Year navigation */}
            <View style={s.yearRow}>
              <Pressable
                onPress={() => setPickerYear((y) => y - 1)}
                style={({ pressed }) => [s.yearBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Previous year"
              >
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </Pressable>
              <Text style={[s.yearText, { color: colors.text }]}>{pickerYear}</Text>
              <Pressable
                onPress={() => setPickerYear((y) => y + 1)}
                disabled={maxMonth ? pickerYear >= Number(maxMonth.split('-')[0]) : false}
                style={({ pressed }) => [s.yearBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Next year"
              >
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={maxMonth && pickerYear >= Number(maxMonth.split('-')[0]) ? colors.textMuted : colors.primary}
                />
              </Pressable>
            </View>

            {/* Month grid */}
            <View style={s.grid}>
              {MONTH_LABELS.map((ml, idx) => {
                const mNum = idx + 1;
                const thisYm = ym(pickerYear, mNum);
                const selected = thisYm === value;
                const disabled = isDisabled(mNum);
                return (
                  <Pressable
                    key={ml}
                    onPress={() => select(mNum)}
                    disabled={disabled}
                    style={({ pressed }) => [
                      s.monthCell,
                      selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                      !selected && !disabled && { backgroundColor: colors.bg, borderColor: colors.border },
                      disabled && { backgroundColor: colors.bg, borderColor: 'transparent', opacity: 0.35 },
                      pressed && !disabled && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${ml} ${pickerYear}`}
                    accessibilityState={{ selected, disabled }}
                  >
                    <Text
                      style={[
                        s.monthText,
                        { color: selected ? colors.primaryText : disabled ? colors.textMuted : colors.text },
                        selected && { fontWeight: '700' },
                      ]}
                    >
                      {ml}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  yearBtn: { padding: 6 },
  yearText: { fontSize: 20, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: {
    width: '22%',
    aspectRatio: 1.6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: { fontSize: 13 },
});
