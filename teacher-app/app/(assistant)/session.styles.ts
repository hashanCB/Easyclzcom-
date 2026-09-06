import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../lib/theme/store';

/** Styles for the assistant QR-scan session screen. Extracted from session.tsx
 *  to keep the screen file focused on behaviour. Built per-theme from colors. */
export function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#000' },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, height: 56,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    summaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    summaryBtnText: { fontSize: 14, fontWeight: '600' },
    absentBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#fee2e2', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 5,
    },
    absentBtnText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
    queueChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: '#fef3c7', borderRadius: 8,
      paddingHorizontal: 7, paddingVertical: 5,
    },
    queueChipText: { fontSize: 12, fontWeight: '700', color: '#d97706' },
    countBadge: {
      minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#f59e0b',
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    countText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    cameraContainer: { flex: 1, position: 'relative' },
    cameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 220, height: 220, position: 'relative' },
    corner: { position: 'absolute', width: 28, height: 28, borderColor: '#f59e0b', borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    scanHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 20, textAlign: 'center' },

    noCardBtn: {
      position: 'absolute', bottom: 28, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22,
      paddingHorizontal: 18, paddingVertical: 11,
    },
    noCardBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    accountBusyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center', justifyContent: 'center', gap: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    accountBusyText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    popup: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      borderWidth: StyleSheet.hairlineWidth, padding: 20, paddingBottom: 32,
    },
    popupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    popupAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    popupInitials: { fontSize: 18, fontWeight: '700' },
    popupInfo: { flex: 1 },
    popupName: { fontSize: 17, fontWeight: '700' },
    popupCode: { fontSize: 13, marginTop: 2 },
    popupClass: { fontSize: 12, marginTop: 1 },
    payBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    payBadgeText: { fontSize: 12, fontWeight: '700' },
    balanceBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 10,
    },
    balanceText: { fontSize: 12.5, fontWeight: '600', color: '#92400e' },

    waitingBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 10,
    },
    waitingText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#6d28d9' },

    // Find-by-name sheet
    searchBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    searchSheet: {
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    },
    searchHandle: {
      alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
      backgroundColor: 'rgba(127,127,127,0.4)', marginBottom: 12,
    },
    searchTitle: { fontSize: 17, fontWeight: '800' },
    searchSubtitle: { fontSize: 13, marginTop: 2, marginBottom: 12 },
    searchInputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      height: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12, marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 15 },
    searchEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 28, lineHeight: 19 },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchName: { fontSize: 15, fontWeight: '600' },
    searchMeta: { fontSize: 12, marginTop: 2 },
    searchWaitingTag: {
      backgroundColor: '#f5f3ff', borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    searchWaitingTagText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
    searchAddNew: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 14, height: 48, borderRadius: 10,
    },
    searchAddNewText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    searchCancel: {
      marginTop: 10, height: 46, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    searchCancelText: { fontSize: 15, fontWeight: '600' },

    alreadyBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12,
    },
    countdownRow: { marginBottom: 14 },
    countdownBar: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
    countdownFill: { height: 4, borderRadius: 2 },
    countdownText: { fontSize: 12, textAlign: 'center' },

    savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
    savingText: { fontSize: 14 },

    actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },

    dismissBtn: { alignItems: 'center', paddingVertical: 8 },
    dismissText: { fontSize: 14, fontWeight: '500' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalSub: { fontSize: 13, marginTop: 4 },
    modalInput: {
      borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 22, fontWeight: '700', marginBottom: 20,
    },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalBtnText: { fontSize: 14, fontWeight: '700' },

    // Confirm-before-record dialog
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    confirmBox: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 24, alignItems: 'center' },
    confirmIcon: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: '#f5f3ff',
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    confirmTitle: { fontSize: 18, fontWeight: '800' },
    confirmSub: { fontSize: 13, fontWeight: '500', marginTop: 2, textAlign: 'center' },
    confirmAmount: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 14, marginBottom: 14 },
    confirmBalance: {
      width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 12, marginBottom: 20, alignItems: 'center',
    },
    confirmBalanceText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  });
}
