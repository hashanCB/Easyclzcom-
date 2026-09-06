import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions, useStudentsMap, useEarliestJoinMonth } from '../../../lib/students/hooks';
import { usePaymentsList, useRefundedPaymentIds } from '../../../lib/payments/hooks';
import { usePendingCollections } from '../../../lib/payments/collections';
import { MonthPickerModal } from '../../../components/MonthPickerModal';
import { ReceiptToggle } from '../../../components/payments/ReceiptToggle';
import { useScreenTitle } from '../../../lib/ui/header';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
}

const STATUS_OPTS = ['all', 'paid', 'partial', 'free', 'refunded'] as const;
type StatusOpt = (typeof STATUS_OPTS)[number];

function statusColor(status: string, colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  if (status === 'paid') return '#059669';
  if (status === 'partial') return '#f59e0b';
  if (status === 'free') return colors.textMuted;
  return colors.textMuted;
}

export default function PaymentsListScreen() {
  useScreenTitle('Payments');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const token = useAuthStore((s) => s.session?.access_token ?? '');
  const teacherId = teacher?.id ?? 'local';

  // Cash an assistant collected, waiting for this teacher to count + confirm.
  const { items: cashPending, refresh: refreshCash } = usePendingCollections(teacherId, token);
  const cashPendingCents = cashPending.reduce((s, c) => s + c.amount_cents, 0);
  useFocusEffect(React.useCallback(() => { refreshCash(); }, [refreshCash]));

  const today = currentMonth();
  const [fromMonth, setFromMonth] = useState(today);
  const [toMonth, setToMonth] = useState(today);
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusOpt>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const classOptions = useClassOptions(teacherId);

  // Anchor the range to when students joined: From = earliest student join
  // month (for the chosen class, or all classes), To = current month.
  const joinMonth = useEarliestJoinMonth(teacherId, classId);
  useEffect(() => {
    if (!joinMonth) return;
    setFromMonth(joinMonth > today ? today : joinMonth);
    setToMonth(today);
  }, [joinMonth, today]);

  const selectedClass = classId ? classOptions.find((c) => c.id === classId) : undefined;
  const classButtonLabel = selectedClass?.label ?? 'All classes';
  const classSearchable = classOptions.length > 6;
  const filteredClassOptions = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classOptions;
    return classOptions.filter((c) => c.label.toLowerCase().includes(q));
  }, [classOptions, classSearch]);

  function pickClass(id: string | undefined) {
    setClassId(id);
    setClassPickerOpen(false);
    setClassSearch('');
  }

  const repoStatusFilter = statusFilter === 'refunded' ? 'all' : statusFilter;
  const filter = useMemo(
    () => ({ teacherId, classId, fromMonth, toMonth, status: repoStatusFilter }),
    [teacherId, classId, fromMonth, toMonth, repoStatusFilter],
  );
  const { payments: rawPayments, loading, refresh, isWeb } = usePaymentsList(filter);
  const refundedIds = useRefundedPaymentIds(teacherId);
  const studentsMap = useStudentsMap(teacherId);

  const payments = useMemo(() => {
    let list = rawPayments;
    if (statusFilter === 'refunded') list = list.filter((p) => refundedIds.has(p.id));
    else if (statusFilter !== 'all') list = list.filter((p) => !refundedIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => {
        const s = studentsMap.get(p.studentId);
        return (
          s?.name.toLowerCase().includes(q) ||
          s?.studentCode?.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [rawPayments, refundedIds, statusFilter, searchQuery, studentsMap]);

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));

  const styles = useMemo(() => buildStyles(colors), [colors]);

  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0);

  const rangeLabel = fromMonth === toMonth
    ? monthLabel(fromMonth)
    : `${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;

  // Count the secondary filters that differ from their defaults, so the
  // collapsed Filters bar can show a badge without being expanded.
  const activeFilterCount =
    (classId ? 1 : 0) + (fromMonth !== today || toMonth !== today ? 1 : 0);

  function handleFromChange(ym: string) {
    setFromMonth(ym);
    if (ym > toMonth) setToMonth(ym);
  }

  function handleToChange(ym: string) {
    setToMonth(ym);
    if (ym < fromMonth) setFromMonth(ym);
  }

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.headerBtns}>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Payment settings"
            hitSlop={6}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/payments/unpaid')}
            style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.8 }]}
            accessibilityLabel="View unpaid students"
          >
            <Ionicons name="alert-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Unpaid</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/payments/new')}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="Record new payment"
          >
            <Ionicons name="add" size={18} color={colors.primaryText} />
            <Text style={styles.addBtnText}>Record</Text>
          </Pressable>
      </View>

      {/* Cash awaiting reconciliation from assistants */}
      {cashPending.length > 0 && (
        <Pressable
          onPress={() => router.push('/(app)/payments/handover')}
          style={({ pressed }) => [styles.cashBanner, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="cash-outline" size={18} color="#047857" />
          <Text style={styles.cashBannerText}>
            Rs {(cashPendingCents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })} cash to confirm ({cashPending.length})
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#047857" />
        </Pressable>
      )}

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by student name or ID"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Filters toggle — collapses the date range + class picker into one slim
          summary bar so the records list isn't pushed far down the screen. */}
      <Pressable
        onPress={() => setFiltersOpen((o) => !o)}
        style={({ pressed }) => [
          styles.filterToggle,
          filtersOpen && styles.filterToggleOpen,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Toggle date and class filters"
      >
        <Ionicons name="options-outline" size={16} color={filtersOpen ? colors.primary : colors.textMuted} />
        <Text
          style={[styles.filterToggleText, filtersOpen && { color: colors.primary }]}
          numberOfLines={1}
        >
          {rangeLabel} · {classButtonLabel}
        </Text>
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
        <Ionicons
          name={filtersOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {filtersOpen && (
      <>
      {/* Date range */}
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
            <Pressable onPress={() => pickClass(undefined)} hitSlop={10} accessibilityLabel="Clear class filter">
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </Pressable>
      )}
      </>
      )}

      {/* Status filter — compact segmented control on one slim, scrollable line. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.segment}>
          {STATUS_OPTS.map((s, i) => {
            const isRefund = s === 'refunded';
            const isActive = statusFilter === s;
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={({ pressed }) => [
                  styles.segBtn,
                  i > 0 && styles.segBtnBorder,
                  isActive && (isRefund ? styles.segBtnRefundActive : styles.segBtnActive),
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.segText, isActive && styles.segTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

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
                  onPress={() => pickClass(undefined)}
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

      {/* Payment settings bottom sheet — houses the auto-receipt SMS toggle
          (governs both teacher and assistant collections). */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Payment settings</Text>
            <ReceiptToggle />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Summary strip */}
      {!isWeb && !loading && payments.length > 0 && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Ionicons name="receipt-outline" size={14} color={colors.textMuted} />
            <Text style={styles.summaryText}>
              {payments.length} record{payments.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Ionicons name="cash-outline" size={14} color="#059669" />
            <Text style={[styles.summaryText, { fontWeight: '700', color: '#059669' }]}>
              Rs {(totalCents / 100).toLocaleString()}
            </Text>
          </View>
        </View>
      )}

      {isWeb ? (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={48} color={colors.border} />
          <Text style={styles.empty}>Open on a device to manage payments.</Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.empty}>Loading…</Text>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="card-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No payments found</Text>
          <Text style={styles.empty}>
            {searchQuery.trim()
              ? `No results for "${searchQuery.trim()}".`
              : `for ${rangeLabel}.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(app)/payments/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {studentsMap.get(item.studentId)?.name ?? '—'}
                  </Text>
                  <Text style={styles.cardCode}>
                    {studentsMap.get(item.studentId)?.studentCode ?? item.studentId.slice(0, 8)}
                  </Text>
                </View>
                <View style={styles.badgeRow}>
                  {refundedIds.has(item.id) && (
                    <Text style={styles.refundBadge}>REFUND</Text>
                  )}
                  <Text style={[styles.badge, { color: statusColor(item.status, colors), borderColor: statusColor(item.status, colors), backgroundColor: statusColor(item.status, colors) + '12' }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardAmt}>Rs {(item.amountCents / 100).toLocaleString()}</Text>
                <Text style={styles.cardSub}>{item.method.replace('_', ' ')} · {item.collectedAt.slice(0, 10)}</Text>
              </View>
              {item.remark ? <Text style={styles.cardRemark} numberOfLines={1}>{item.remark}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 16 },

    headerBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 12 },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: colors.primary,
      minHeight: 44,
    },
    addBtnText: { fontWeight: '700', fontSize: 14, color: colors.primaryText },
    cashBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 4, marginBottom: 4,
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: '#d1fae5',
    },
    cashBannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#047857' },
    outlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      minHeight: 44,
    },
    outlineBtnText: { fontWeight: '600', fontSize: 14 },
    iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },

    // Collapsible filters summary bar
    filterToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    filterToggleOpen: { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
    filterToggleText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
    filterBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primaryText },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      gap: 8,
      marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 14 },

    rangeCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 10,
    },
    rangeFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    rangeArrow: { paddingBottom: 12 },
    rangeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    rangeActive: { fontSize: 12 },
    resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    resetText: { fontSize: 12, fontWeight: '600' },

    // Class dropdown trigger
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
      marginBottom: 10,
    },
    classTriggerActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
    classTriggerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

    // Status segmented control on one slim, scrollable line
    filterBar: { flexGrow: 0, height: 32, marginBottom: 10 },
    filterScroll: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    segment: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: 32,
      borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    segBtn: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
    segBtnBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
    segBtnActive: { backgroundColor: colors.primary },
    segBtnRefundActive: { backgroundColor: '#d97706' },
    segText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
    segTextActive: { color: '#ffffff', fontWeight: '700' },

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
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    summaryDivider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: 12 },
    summaryText: { fontSize: 13, color: colors.textMuted },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
    empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textMuted },

    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    cardCode: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginTop: 1 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardAmt: { fontSize: 16, fontWeight: '800', color: colors.text },
    cardSub: { fontSize: 12, color: colors.textMuted },
    cardRemark: { fontSize: 12, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    badge: {
      fontSize: 11,
      fontWeight: '600',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
      overflow: 'hidden',
    },
    refundBadge: {
      fontSize: 10,
      fontWeight: '700',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: '#fef3c7',
      color: '#92400e',
      borderWidth: 1,
      borderColor: '#fcd34d',
    },
  });
}
