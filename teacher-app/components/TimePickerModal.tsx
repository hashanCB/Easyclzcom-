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

// Minutes shown as 5-minute increments
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse "HH:MM" → { h, m } with safe fallback */
function parseHM(value: string): { h: number; m: number } {
  const parts = value.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return {
    h: Number.isFinite(h) && h >= 0 && h <= 23 ? h : 0,
    m: Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0,
  };
}

interface Props {
  /** Current value as "HH:MM" (24-hour). Empty string = no time set. */
  value: string;
  onChange: (hhmm: string) => void;
  label: string;
  /** If true the trigger shows a placeholder style when value is empty */
  placeholder?: string;
}

export function TimePickerModal({ value, onChange, label, placeholder = '-- : --' }: Props) {
  const colors = useThemeStore((s) => s.colors);
  const [open, setOpen] = useState(false);

  const { h: initH, m: initM } = value ? parseHM(value) : { h: 8, m: 0 };
  const [pickerH, setPickerH] = useState(initH);
  const [pickerM, setPickerM] = useState(initM);

  function openPicker() {
    const { h, m } = value ? parseHM(value) : { h: 8, m: 0 };
    setPickerH(h);
    // Snap minute to nearest 5-min step
    setPickerM(MINUTE_STEPS.reduce((best, s) => Math.abs(s - m) < Math.abs(best - m) ? s : best, 0));
    setOpen(true);
  }

  function confirmTime() {
    onChange(`${pad(pickerH)}:${pad(pickerM)}`);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  const hasValue = value.length > 0;
  const displayText = hasValue ? value : placeholder;

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
          accessibilityLabel={`${label}: ${hasValue ? value : 'not set'}, tap to change`}
        >
          <Ionicons name="time-outline" size={15} color={hasValue ? colors.primary : colors.textMuted} />
          <Text style={[s.triggerText, { color: hasValue ? colors.text : colors.textMuted }]}>
            {displayText}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>

            {/* Preview */}
            <Text style={[s.preview, { color: colors.primary }]}>
              {pad(pickerH)}:{pad(pickerM)}
            </Text>

            {/* Hour row */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>Hour</Text>
            <View style={s.hourRow}>
              <Pressable
                onPress={() => setPickerH((h) => (h === 0 ? 23 : h - 1))}
                style={({ pressed }) => [s.arrowBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Previous hour"
              >
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </Pressable>
              <Text style={[s.hourText, { color: colors.text }]}>{pad(pickerH)}</Text>
              <Pressable
                onPress={() => setPickerH((h) => (h === 23 ? 0 : h + 1))}
                style={({ pressed }) => [s.arrowBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Next hour"
              >
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </Pressable>
            </View>

            {/* Minute grid */}
            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>Minute</Text>
            <View style={s.minuteGrid}>
              {MINUTE_STEPS.map((m) => {
                const active = pickerM === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setPickerM(m)}
                    style={({ pressed }) => [
                      s.minuteCell,
                      active
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.bg, borderColor: colors.border },
                      pressed && !active && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${pad(m)} minutes`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.minuteText, { color: active ? colors.primaryText : colors.text }]}>
                      {pad(m)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Actions */}
            <View style={s.actions}>
              <Pressable
                onPress={clear}
                style={({ pressed }) => [s.clearBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Clear time"
              >
                <Text style={[s.clearText, { color: colors.textMuted }]}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={confirmTime}
                style={({ pressed }) => [s.setBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                accessibilityLabel={`Set time to ${pad(pickerH)}:${pad(pickerM)}`}
              >
                <Text style={[s.setText, { color: colors.primaryText }]}>
                  Set {pad(pickerH)}:{pad(pickerM)}
                </Text>
              </Pressable>
            </View>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  preview: {
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  arrowBtn: { padding: 6 },
  hourText: { fontSize: 36, fontWeight: '800', minWidth: 60, textAlign: 'center' },

  minuteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  minuteCell: {
    width: '22%',
    aspectRatio: 1.5,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteText: { fontSize: 14, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10 },
  clearBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { fontSize: 14, fontWeight: '600' },
  setBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setText: { fontSize: 15, fontWeight: '700' },
});
