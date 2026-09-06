import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions, useEarliestJoinMonth } from '../../../lib/students/hooks';
import { useUnpaidStudentsRange, useFreeStudents } from '../../../lib/payments/hooks';
import type { FreeStudent } from '../../../db/repositories/paymentsRepo';
import { MonthPickerModal } from '../../../components/MonthPickerModal';
import { useScreenTitle } from '../../../lib/ui/header';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
}

/** Format cents as a plain LKR amount, e.g. 150000 → "LKR 1,500". */
function lkr(cents: number): string {
  return `LKR ${Math.round(cents / 100).toLocaleString()}`;
}

export default function UnpaidStudentsScreen() {
  useScreenTitle('Outstanding Fees');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const teacherId = teacher?.id ?? 'local';

  const today = currentMonth();
  const [fromMonth, setFromMonth] = useState(today);
  const [toMonth, setToMonth] = useState(today);
  const [classId, setClassId] = useState('');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');

  const classOptions = useClassOptions(teacherId);

  // Anchor the range to when students actually joined: From = earliest student
  // join month (for the chosen class, or all classes), To = current month.
  const joinMonth = useEarliestJoinMonth(teacherId, classId);
  useEffect(() => {
    if (!joinMonth) return;
    setFromMonth(joinMonth > today ? today : joinMonth);
    setToMonth(today);
  }, [joinMonth, today]);

  const { unpaid, loading, refresh } = useUnpaidStudentsRange(classId, fromMonth, toMonth, teacherId);
  // Free-card students owe nothing — shown in their own section, tagged "Free",
  // so staff see they're handled without counting them as unpaid.
  const { free, refresh: refreshFree } = useFreeStudents(classId, teacherId);

  useFocusEffect(React.useCallback(() => { refresh(); refreshFree(); }, [refresh, refreshFree]));

  const styles = useMemo(() => buildStyles(colors), [colors]);

  const selectedClass = classId ? classOptions.find((c) => c.id === classId) : undefined;
  const classButtonLabel = selectedClass?.label ?? 'All classes';
  const classSearchable = classOptions.length > 6;
  const filteredClassOptions = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classOptions;
    return classOptions.filter((c) => c.label.toLowerCase().includes(q));
  }, [classOptions, classSearch]);

  // Keep From ≤ To when either end moves, like the Payments screen.
  function handleFromChange(ym: string) {
    setFromMonth(ym);
    if (ym > toMonth) setToMonth(ym);
  }
  function handleToChange(ym: string) {
    setToMonth(ym);
    if (ym < fromMonth) setFromMonth(ym);
  }

  const rangeLabel = fromMonth === toMonth
    ? monthLabel(fromMonth)
    : `${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;

  function pickClass(id: string) {
    setClassId(id);
    setClassPickerOpen(false);
    setClassSearch('');
  }

  // Outstanding breakdown for the header pill and summary strip.
  const partialCount = unpaid.filter((s) => s.payStatus === 'partial').length;
  const unpaidCount = unpaid.length - partialCount;
  const totalDueCents = unpaid.reduce((sum, s) => sum + s.remainingCents, 0);

  return (
    <View style={styles.container}>
      {/* Info row */}
      <View style={styles.infoRow}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {`${classButtonLabel} · ${rangeLabel}`}
        </Text>
        {totalDueCents > 0 && (
          <View style={styles.duePill}>
            <Text style={styles.duePillLabel}>DUE</Text>
            <Text style={styles.duePillValue}>{lkr(totalDueCents)}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* From → To range — same calendar picker card as the Payments screen. */}
        <View style={styles.rangeCard}>
          <View style={styles.rangeFields}>
            <View style={{ flex: 1 }}>
              <MonthPickerModal
                label="From"
                value={fromMonth}
                onChange={handleFromChange}
                minMonth={joinMonth ?? undefined}
                maxMonth={today}
              />
            </View>
            <View style={styles.rangeArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <MonthPickerModal
                label="To"
                value={toMonth}
                onChange={handleToChange}
                minMonth={fromMonth}
                maxMonth={today}
              />
            </View>
          </View>
          <View style={styles.rangeFooter}>
            <Text style={[styles.rangeActive, { color: colors.textMuted }]}>
              <Ionicons name="time-outline" size={12} /> {rangeLabel}
            </Text>
            {(fromMonth !== today || toMonth !== today) && (
              <Pressable
                onPress={() => { setFromMonth(today); setToMonth(today); }}
                style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.7 : 1 }]}
                accessibilityLabel="Reset to current month"
              >
                <Ionicons name="refresh" size={12} color={colors.primary} />
                <Text style={[styles.resetText, { color: colors.primary }]}>This month</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Class filter — dropdown trigger that opens a searchable bottom sheet. */}
        {classOptions.length > 0 && (
          <Pressable
            onPress={() => setClassPickerOpen(true)}
            style={({ pressed }) => [
              styles.classTrigger,
              classId ? styles.classTriggerActive : null,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Filter by class. Current: ${classButtonLabel}`}
          >
            <Ionicons name="school-outline" size={16} color={classId ? colors.primary : colors.textMuted} />
            <Text
              style={[styles.classTriggerText, classId ? { color: colors.primary } : null]}
              numberOfLines={1}
            >
              {classButtonLabel}
            </Text>
            {classId ? (
              <Pressable onPress={() => pickClass('')} hitSlop={10} accessibilityLabel="Clear class filter">
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </Pressable>
            ) : (
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            )}
          </Pressable>
        )}

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.empty}>Loading…</Text>
          </View>
        ) : unpaid.length === 0 ? (
          free.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.allPaidIcon}>
                <Ionicons name="checkmark-circle" size={56} color="#059669" />
              </View>
              <Text style={[styles.emptyTitle, { color: '#059669' }]}>All paid</Text>
              <Text style={styles.empty}>
                {selectedClass
                  ? `Everyone in ${selectedClass.label} has settled ${rangeLabel}.`
                  : `Everyone has settled ${rangeLabel}.`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={[]}
              keyExtractor={() => 'none'}
              renderItem={() => null}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListHeaderComponent={
                <View style={[styles.summaryStrip, { paddingTop: 0 }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={[styles.summaryText, { color: '#059669' }]}>All paid</Text>
                </View>
              }
              ListFooterComponent={<FreeSection free={free} showClass={!classId} colors={colors} styles={styles} />}
            />
          )
        ) : (
          <>
            <View style={styles.summaryStrip}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.summaryText, { color: colors.text }]}>
                {unpaidCount > 0 && `${unpaidCount} unpaid`}
                {unpaidCount > 0 && partialCount > 0 && '  ·  '}
                {partialCount > 0 && `${partialCount} partial`}
              </Text>
            </View>
            <FlatList
              data={unpaid}
              keyExtractor={(s) => `${s.id}-${s.month}`}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListFooterComponent={<FreeSection free={free} showClass={!classId} colors={colors} styles={styles} />}
              renderItem={({ item }) => {
                const partial = item.payStatus === 'partial';
                const accent = partial ? '#d97706' : colors.danger;
                return (
                  <View style={[styles.card, { borderColor: partial ? '#fcd34d' : colors.border }]}>
                    <View style={styles.cardTop}>
                      <View style={[styles.avatarCircle, { backgroundColor: accent + '18' }]}>
                        <Text style={[styles.avatarLetter, { color: accent }]}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.cardCode}>{item.studentCode}</Text>
                        {!classId && item.className ? (
                          <View style={styles.contactItem}>
                            <Ionicons name="school-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.cardSub} numberOfLines={1}>{item.className}</Text>
                          </View>
                        ) : null}
                        {item.parentMobile ? (
                          <View style={styles.contactItem}>
                            <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.cardSub}>{item.parentMobile}</Text>
                          </View>
                        ) : item.studentPhone ? (
                          <View style={styles.contactItem}>
                            <Ionicons name="phone-portrait-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.cardSub}>{item.studentPhone}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.badgeCol}>
                        <View style={[styles.statusBadge, { backgroundColor: accent + '18' }]}>
                          <Text style={[styles.statusBadgeText, { color: accent }]}>
                            {partial ? 'Partial' : 'Unpaid'}
                          </Text>
                        </View>
                        <Text style={styles.monthTag}>{monthLabel(item.month)}</Text>
                      </View>
                    </View>

                    {/* Balance line */}
                    <View style={styles.balanceRow}>
                      <Ionicons name="wallet-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.balanceText}>
                        {partial
                          ? `${lkr(item.paidCents)} paid · `
                          : ''}
                        <Text style={{ color: accent, fontWeight: '700' }}>{lkr(item.remainingCents)} due</Text>
                      </Text>
                    </View>

                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/payments/new',
                          params: { prefillStudentId: item.studentCode, prefillClassId: classId || item.classId, prefillMonth: item.month },
                        })
                      }
                      style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Record payment for ${item.name}`}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={colors.primaryText} />
                      <Text style={styles.payBtnText}>{partial ? 'Collect Balance' : 'Record Payment'}</Text>
                    </Pressable>
                  </View>
                );
              }}
            />
          </>
        )}
      </View>

      {/* Class picker bottom sheet */}
      <Modal
        visible={classPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setClassPickerOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setClassPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter by class</Text>

            {classSearchable ? (
              <View style={styles.sheetSearch}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  value={classSearch}
                  onChangeText={setClassSearch}
                  placeholder="Search classes"
                  placeholderTextColor={colors.textMuted}
                  style={styles.sheetSearchInput}
                  autoCorrect={false}
                />
                {classSearch.length > 0 ? (
                  <Pressable onPress={() => setClassSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={filteredClassOptions}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              style={styles.sheetListBox}
              ListHeaderComponent={
                <Pressable
                  onPress={() => pickClass('')}
                  style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <Text style={[styles.sheetRowText, !classId && { color: colors.primary, fontWeight: '700' }]}>
                    All classes
                  </Text>
                  {!classId ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              }
              renderItem={({ item }) => {
                const active = classId === item.id;
                return (
                  <Pressable
                    onPress={() => pickClass(item.id)}
                    style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <Text
                      style={[styles.sheetRowText, active && { color: colors.primary, fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.sheetEmpty}>No classes match “{classSearch}”.</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** "Free cards" section shown under the unpaid list — students who owe nothing. */
function FreeSection({
  free,
  showClass,
  colors,
  styles,
}: {
  free: FreeStudent[];
  showClass: boolean;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
  styles: ReturnType<typeof buildStyles>;
}) {
  if (free.length === 0) return null;
  const totalWaived = free.reduce((sum, s) => sum + s.waivedCents, 0);
  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.freeHeaderRow}>
        <Ionicons name="gift-outline" size={15} color="#059669" />
        <Text style={styles.freeHeaderText}>
          {free.length} free {free.length === 1 ? 'card' : 'cards'}
        </Text>
        <Text style={styles.freeHeaderWaived}>{lkr(totalWaived)}/mo waived</Text>
      </View>
      {free.map((item) => (
        <View key={`${item.id}-${item.freeClassId}`} style={[styles.card, { borderColor: '#a7f3d0' }]}>
          <View style={[styles.cardTop, { marginBottom: 0 }]}>
            <View style={[styles.avatarCircle, { backgroundColor: '#05966918' }]}>
              <Text style={[styles.avatarLetter, { color: '#059669' }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardCode}>{item.studentCode}</Text>
              {showClass && item.className ? (
                <View style={styles.contactItem}>
                  <Ionicons name="school-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.cardSub} numberOfLines={1}>{item.className}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.badgeCol}>
              <View style={[styles.statusBadge, { backgroundColor: '#05966918' }]}>
                <Text style={[styles.statusBadgeText, { color: '#059669' }]}>Free</Text>
              </View>
              <Text style={styles.monthTag}>{lkr(item.waivedCents)} waived</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 8,
    },
    subtitle: { flex: 1, fontSize: 12.5, fontWeight: '500', marginTop: 1 },
    headerRight: { width: 44 },
    duePill: {
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      borderRadius: 12,
      backgroundColor: colors.danger + '14',
    },
    duePillLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: colors.danger, opacity: 0.8 },
    duePillValue: { fontSize: 14, fontWeight: '800', color: colors.danger, marginTop: 1 },

    content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

    // From → To range card (matches the Payments screen)
    rangeCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 12,
    },
    rangeFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    rangeArrow: { paddingBottom: 12 },
    rangeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    rangeActive: { fontSize: 12 },
    resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    resetText: { fontSize: 12, fontWeight: '600' },

    // Class filter trigger button
    classTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    classTriggerActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
    classTriggerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

    // Class picker bottom sheet
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingBottom: 28,
      paddingTop: 8,
      maxHeight: '70%',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    sheetSearch: {
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
    sheetSearchInput: { flex: 1, fontSize: 14, color: colors.text },
    sheetListBox: { flexGrow: 0 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetRowText: { fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
    sheetEmpty: { textAlign: 'center', color: colors.textMuted, fontSize: 14, paddingVertical: 24 },

    summaryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      marginBottom: 8,
    },
    summaryText: { fontSize: 13, fontWeight: '700' },

    freeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
    freeHeaderText: { fontSize: 13, fontWeight: '700', color: '#059669', flex: 1 },
    freeHeaderWaived: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 64 },
    allPaidIcon: { marginBottom: 4 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textMuted, maxWidth: 260 },

    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    badgeCol: { alignItems: 'flex-end', gap: 4 },
    statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
    statusBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
    monthTag: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    balanceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginBottom: 12, paddingHorizontal: 2,
    },
    balanceText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    avatarCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: { fontSize: 16, fontWeight: '700' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
    cardCode: { fontSize: 12, color: colors.textMuted, fontFamily: 'monospace' },
    contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    cardSub: { fontSize: 12, color: colors.textMuted },

    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      minHeight: 44,
    },
    payBtnText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
