// Reusable class filter/selector — a compact dropdown trigger that opens a
// searchable bottom sheet. Shared across Students, Payments, Notes, Exams,
// Attendance and Reports so the filter UX stays consistent on mobile.
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../lib/theme/store';

type Colors = ReturnType<typeof useThemeStore.getState>['colors'];

export interface ClassPickerItem {
  id: string;
  label: string;
}

interface ClassPickerProps {
  classes: ClassPickerItem[];
  /** Selected class id, or undefined/'' when none selected. */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  colors: Colors;
  /** Show an "All classes" row that clears the selection. Default true. */
  allowAll?: boolean;
  /** Label for the All row. Default "All classes". */
  allLabel?: string;
  /** Placeholder shown on the trigger when nothing is selected. */
  placeholder?: string;
  /** Sheet heading. Default "Filter by class". */
  title?: string;
  /** Extra style for the trigger wrapper (e.g. margins). */
  style?: object;
}

export function ClassPicker({
  classes,
  value,
  onChange,
  colors,
  allowAll = true,
  allLabel = 'All classes',
  placeholder = 'Select a class',
  title = 'Filter by class',
  style,
}: ClassPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const styles = useMemo(() => buildStyles(colors), [colors]);

  const hasValue = !!value;
  const selected = hasValue ? classes.find((c) => c.id === value) : undefined;
  const triggerLabel = selected?.label ?? (allowAll ? allLabel : placeholder);
  const searchable = classes.length > 6;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) => c.label.toLowerCase().includes(q));
  }, [classes, search]);

  function pick(id: string | undefined) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          hasValue ? styles.triggerActive : null,
          pressed && { opacity: 0.85 },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Filter by class. Current: ${triggerLabel}`}
      >
        <Ionicons name="school-outline" size={16} color={hasValue ? colors.primary : colors.textMuted} />
        <Text
          style={[styles.triggerText, hasValue ? { color: colors.primary } : null]}
          numberOfLines={1}
        >
          {triggerLabel}
        </Text>
        {hasValue && allowAll ? (
          <Pressable onPress={() => pick(undefined)} hitSlop={10} accessibilityLabel="Clear class filter">
            <Ionicons name="close-circle" size={16} color={colors.primary} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{title}</Text>

            {searchable ? (
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search classes"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={filtered}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              style={styles.listBox}
              ListHeaderComponent={
                allowAll ? (
                  <Pressable
                    onPress={() => pick(undefined)}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <Text style={[styles.rowText, !hasValue && { color: colors.primary, fontWeight: '700' }]}>
                      {allLabel}
                    </Text>
                    {!hasValue ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => {
                const active = value === item.id;
                return (
                  <Pressable
                    onPress={() => pick(item.id)}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <Text
                      style={[styles.rowText, active && { color: colors.primary, fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No classes match “{search}”.</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function buildStyles(colors: Colors) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
    },
    triggerActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
    triggerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingBottom: 28,
      paddingTop: 8,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      gap: 8,
      marginBottom: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.text },
    listBox: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowText: { fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
    empty: { textAlign: 'center', color: colors.textMuted, fontSize: 14, paddingVertical: 24 },
  });
}
