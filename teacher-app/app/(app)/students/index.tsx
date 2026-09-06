import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../lib/theme/store';
import { getDownloadUrl } from '../../../lib/r2';
import { useAuthStore } from '../../../lib/auth/store';
import { useClassOptions, usePendingPaymentCount, usePortalStatusMap, useStudentsList } from '../../../lib/students/hooks';
import { usePendingJoinRequests } from '../../../lib/students/joinRequests';
import { useScreenTitle } from '../../../lib/ui/header';

type StatusFilter = 'active' | 'deactivated' | 'all';
type PortalFilter = 'all' | 'joined' | 'suspended' | 'not_joined';

export default function StudentsListScreen() {
  useScreenTitle('Students');
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const teacher = useAuthStore((s) => s.teacher);
  const session = useAuthStore((s) => s.session);
  const teacherId = teacher?.id ?? 'local';
  const token = session?.access_token ?? '';

  // Join requests from the student portal (class code flow), awaiting approval.
  const { items: joinRequests, refresh: refreshJoinRequests } = usePendingJoinRequests(teacherId, token);
  // Students accepted via class code but not yet paid (money gate).
  const pendingPaymentCount = usePendingPaymentCount(teacherId);
  useFocusEffect(React.useCallback(() => {
    refreshJoinRequests();
  }, [refreshJoinRequests]));

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [portalFilter, setPortalFilter] = useState<PortalFilter>('all');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');

  const classOptions = useClassOptions(teacherId);

  const selectedClass = classId ? classOptions.find((c) => c.id === classId) : undefined;
  const classButtonLabel = selectedClass?.label ?? 'All classes';

  // Show the in-sheet search box only once the list is long enough to need it.
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
  const { statusMap, refresh: refreshPortal } = usePortalStatusMap(
    teacher?.id ?? '',
    session?.access_token,
  );

  const filter = useMemo(
    () => ({ teacherId, classId, status, search }),
    [teacherId, classId, status, search],
  );
  const { students, loading, refresh, isWeb } = useStudentsList(filter);

  // Apply portal filter on top of the local SQL results
  const visibleStudents = useMemo(() => {
    if (portalFilter === 'all')       return students;
    if (portalFilter === 'joined')    return students.filter((s) => statusMap.get(s.id) === 'active');
    if (portalFilter === 'suspended') return students.filter((s) => statusMap.get(s.id) === 'suspended');
    return students.filter((s) => !statusMap.has(s.id));
  }, [students, portalFilter, statusMap]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      refreshPortal();
    }, [refresh, refreshPortal]),
  );

  const styles = useMemo(() => buildStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(app)/students/new')}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Add new student"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Join requests from the student portal */}
      {joinRequests.length > 0 && (
        <Pressable
          onPress={() => router.push('/(app)/students/requests')}
          style={({ pressed }) => [styles.joinBanner, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="mail-unread-outline" size={18} color="#2563eb" />
          <Text style={styles.joinBannerText}>
            {joinRequests.length} join request{joinRequests.length > 1 ? 's' : ''} waiting for approval
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#2563eb" />
        </Pressable>
      )}

      {/* Students accepted via class code but awaiting first payment (money gate) */}
      {pendingPaymentCount > 0 && (
        <Pressable
          onPress={() => router.push('/(app)/students/pending-payment' as never)}
          style={({ pressed }) => [styles.pendingPayBanner, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="hourglass-outline" size={18} color="#7c3aed" />
          <Text style={styles.pendingPayBannerText}>
            {pendingPaymentCount} student{pendingPaymentCount > 1 ? 's' : ''} awaiting first payment
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#7c3aed" />
        </Pressable>
      )}

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or student ID"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Class filter — dropdown trigger that opens a searchable bottom sheet.
          Keeps a fixed height no matter how many classes the teacher has. */}
      {classOptions.length > 0 ? (
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
          <Ionicons
            name="school-outline"
            size={16}
            color={classId ? colors.primary : colors.textMuted}
          />
          <Text
            style={[styles.classTriggerText, classId ? { color: colors.primary } : null]}
            numberOfLines={1}
          >
            {classButtonLabel}
          </Text>
          {classId ? (
            <Pressable
              onPress={() => pickClass(undefined)}
              hitSlop={10}
              accessibilityLabel="Clear class filter"
            >
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}

      {/* Quick filters — compact segmented controls on one slim, scrollable
          line (never wraps, stays low height). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.segment}>
          {([
            { key: 'active',      label: 'Active' },
            { key: 'deactivated', label: 'Inactive' },
            { key: 'all',         label: 'All' },
          ] as { key: StatusFilter; label: string }[]).map((opt, i) => (
            <Pressable
              key={opt.key}
              onPress={() => setStatus(opt.key)}
              style={({ pressed }) => [
                styles.segBtn,
                i > 0 && styles.segBtnBorder,
                status === opt.key && styles.segBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.segText, status === opt.key && styles.segTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.segment, { marginLeft: 8 }]}>
          {([
            { key: 'all',        label: 'All' },
            { key: 'joined',     label: '🔗 Active' },
            { key: 'suspended',  label: '⏸ Suspended' },
            { key: 'not_joined', label: 'Not Joined' },
          ] as { key: PortalFilter; label: string }[]).map((opt, i) => (
            <Pressable
              key={opt.key}
              onPress={() => setPortalFilter(opt.key)}
              style={({ pressed }) => [
                styles.segBtn,
                i > 0 && styles.segBtnBorder,
                portalFilter === opt.key && styles.segBtnPortalActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.segText, portalFilter === opt.key && styles.segTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
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
              style={styles.sheetList}
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

      {isWeb ? (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Mobile only</Text>
          <Text style={styles.empty}>Open the app on a device to manage students.</Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.empty}>Loading…</Text>
        </View>
      ) : visibleStudents.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No students found</Text>
          <Text style={styles.empty}>
            {portalFilter === 'joined'
              ? 'No students have joined the portal yet.'
              : portalFilter === 'not_joined'
              ? 'All students in this view have joined the portal.'
              : 'Try adjusting your filters.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleStudents}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const portalStatus = statusMap.get(item.id) ?? null; // 'active' | 'suspended' | null
            return (
            <Pressable
              onPress={() => router.push(`/(app)/students/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                { opacity: item.isActive ? 1 : 0.55 },
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} student profile`}
            >
              {/* Avatar — student photo if available, else first letter */}
              <StudentAvatar name={item.name} photoKey={item.profilePhotoUrl} token={token} colors={colors} />

              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.badgeRow}>
                    {item.joinStatus === 'pending_payment' && (
                      <Text style={styles.pendingPayBadge}>⏳ Awaiting payment</Text>
                    )}
                    {portalStatus === 'active' && (
                      <Text style={styles.portalBadge}>🔗 Portal</Text>
                    )}
                    {portalStatus === 'suspended' && (
                      <Text style={styles.portalBadgeSuspended}>⏸ Suspended</Text>
                    )}
                    <Text
                      style={[
                        styles.badge,
                        {
                          color: item.isActive ? colors.primary : colors.textMuted,
                          borderColor: item.isActive ? colors.primary : colors.border,
                          backgroundColor: item.isActive ? colors.primary + '12' : 'transparent',
                        },
                      ]}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardCode}>
                  {item.studentCode}
                  {item.grade ? ` · Grade ${item.grade}` : ''}
                  {item.batch ? ` · ${item.batch}` : ''}
                </Text>

                {(item.studentPhone || item.parentMobile) ? (
                  <View style={styles.contactRow}>
                    {item.studentPhone ? (
                      <View style={styles.contactItem}>
                        <Ionicons name="phone-portrait-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.contactText}>{item.studentPhone}</Text>
                      </View>
                    ) : null}
                    {item.parentMobile ? (
                      <View style={styles.contactItem}>
                        <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.contactText}>{item.parentMobile}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={16} color={colors.border} />
            </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

/**
 * Student list avatar — shows the student's photo when one exists
 * (profile_photo_url, an R2 key resolved to a URL), otherwise the first letter.
 */
function StudentAvatar({ name, photoKey, token, colors }: {
  name: string;
  photoKey: string | null | undefined;
  token: string;
  colors: ReturnType<typeof useThemeStore.getState>['colors'];
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!photoKey) {
      setUri(null);
    } else if (photoKey.startsWith('data:') || photoKey.startsWith('http')) {
      // Student-provided photo (small data URL) or a full URL — use directly.
      setUri(photoKey);
    } else if (token) {
      // R2 key (teacher-uploaded) — resolve to a signed URL via the worker.
      getDownloadUrl(photoKey, token).then((u) => { if (live) setUri(u); }).catch(() => { if (live) setUri(null); });
    } else {
      setUri(null);
    }
    return () => { live = false; };
  }, [photoKey, token]);

  if (uri) {
    return <Image source={{ uri }} style={avatarStyles.image} />;
  }
  return (
    <View style={[avatarStyles.circle, { backgroundColor: colors.primary + '18' }]}>
      <Text style={[avatarStyles.letter, { color: colors.primary }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 16, fontWeight: '700' },
  image: { width: 40, height: 40, borderRadius: 20 },
});

function buildStyles(colors: ReturnType<typeof useThemeStore.getState>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.bg },

    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginBottom: 12,
    },
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

    reviewBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 12, backgroundColor: '#fef3c7',
    },
    reviewBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#92400e' },

    joinBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 12, backgroundColor: '#dbeafe',
    },
    joinBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1e40af' },

    pendingPayBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 12, backgroundColor: '#f3e8ff',
    },
    pendingPayBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#6d28d9' },

    pendingPayBadge: {
      fontSize: 10,
      fontWeight: '600',
      color: '#7c3aed',
      backgroundColor: '#f3e8ff',
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
      overflow: 'hidden',
    },

    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      marginBottom: 10,
      gap: 8,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },

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

    // Horizontal quick-filter row (status + portal segmented controls).
    // Pin the height so the ScrollView hugs its 32px content instead of
    // measuring tall and leaving big gaps above/below the bar.
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
    segBtnPortalActive: { backgroundColor: '#0d9488' },
    segText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
    segTextActive: { color: '#ffffff', fontWeight: '700' },

    // Class picker bottom sheet
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 24,
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
    sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
    sheetSearch: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 42,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    sheetSearchInput: { flex: 1, fontSize: 14, color: colors.text },
    sheetList: { flexGrow: 0 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetRowText: { flex: 1, fontSize: 14, color: colors.text },
    sheetEmpty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },

    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
      marginBottom: 6,
      minHeight: 32,
      justifyContent: 'center',
    },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { fontSize: 12, color: colors.text, textTransform: 'capitalize' },
    chipTextActive: { color: colors.primaryText, fontWeight: '600' },
    // Portal filter uses teal/emerald colour so it's visually distinct from status chips
    chipPortalActive: { borderColor: '#0d9488', backgroundColor: '#0d9488' },
    chipPortalTextActive: { color: '#ffffff', fontWeight: '600' },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
    empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textMuted, maxWidth: 260 },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    avatarCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: { fontSize: 16, fontWeight: '700' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 6 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    portalBadge: {
      fontSize: 10,
      fontWeight: '600',
      color: '#0d9488',
      backgroundColor: '#0d948815',
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    portalBadgeSuspended: {
      fontSize: 10,
      fontWeight: '600',
      color: '#d97706',
      backgroundColor: '#fef3c715',
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    cardTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8, color: colors.text },
    cardCode: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    contactRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
    contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    contactText: { fontSize: 12, color: colors.textMuted },
    badge: {
      fontSize: 11,
      fontWeight: '600',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
      overflow: 'hidden',
    },
  });
}
