/**
 * SPSkillRequestScreen.tsx ("My Services")
 *
 * A provider's service is what clients hire them for, so it no longer
 * changes from Edit Profile. Here the provider sees their main service, asks
 * the admins to change it or to add another one, and follows the answer.
 * Only one request can be open at a time (enforced by the API, 0034).
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import RadioRow from '../../../src/components/ui/RadioRow';
import TextField from '../../../src/components/ui/TextField';
import StatusCard from '../../../src/components/ui/StatusCard';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import { ArrowLeft, CircleCheck, CircleSlash, CircleX, Clock, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { Spacing, V6Radii } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useNotifications } from '../../../src/context/NotificationsContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type SkillRequest, type SkillRequestType } from '../../../src/lib/api';
import { shortDate } from '../../../src/lib/format';
import { categoryIcon } from '../../../src/lib/categoryIcon';
import { showToast } from '../../../src/components/Toast';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { cleanText, textLength, textUnits } from '../../../src/lib/textRules';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

const TYPE_OPTIONS: { value: SkillRequestType; label: string; hint: string }[] = [
  { value: 'change_primary', label: 'Change my main service', hint: 'Replace the service clients see on your profile.' },
  { value: 'add_secondary', label: 'Add another service', hint: 'Offer a second service alongside your main one.' },
];

/** The icon a past request shows: approved a check, pending a clock, rejected a cross, cancelled a slash. */
export type RequestIconKind = 'check' | 'clock' | 'cross' | 'slash';

export function requestIconKind(status: SkillRequest['status']): RequestIconKind {
  switch (status) {
    case 'approved': return 'check';
    case 'pending': return 'clock';
    case 'rejected': return 'cross';
    case 'cancelled': return 'slash';
  }
}

const REQUEST_ICON: Record<RequestIconKind, LucideIcon> = {
  check: CircleCheck,
  clock: Clock,
  cross: CircleX,
  slash: CircleSlash,
};

/** The line under the reason box: names the service asked for, or says "this service" until one is chosen. */
export function requestCopy(serviceName: string | null): string {
  return `Tell us about your experience with ${serviceName?.trim() || 'this service'}. Admins check this before approving. Clients only see approved services.`;
}

/**
 * What is wrong with the reason, or undefined when it can be sent. The length
 * is of the cleaned text, so spaces alone are no reason: at least REASON_MIN
 * characters, and at most REASON_MAX UTF-16 units, the count the API uses.
 */
export function reasonProblem(reason: string): string | undefined {
  if (textLength(reason) < REASON_MIN) return `Tell the admins a little more (at least ${REASON_MIN} characters).`;
  if (textUnits(reason) > REASON_MAX) return `Keep it to ${REASON_MAX} characters or fewer.`;
  return undefined;
}

/**
 * Send is live only for a service the provider does not already offer, with a
 * reason that passes reasonProblem, and while no send is in flight.
 */
export function canSendRequest(input: {
  categoryId: number | null;
  offeredIds: ReadonlySet<number>;
  reason: string;
  submitting: boolean;
}): boolean {
  return (
    !!input.categoryId &&
    !input.offeredIds.has(input.categoryId) &&
    reasonProblem(input.reason) === undefined &&
    !input.submitting
  );
}

interface SPSkillRequestScreenProps {
  onBack: () => void;
}

export default function SPSkillRequestScreen({ onBack }: SPSkillRequestScreenProps) {
  const { STATUS_META, styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { providerProfile, refreshProfile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);
  const { notifications } = useNotifications();
  const serviceNoticeKey = notifications.filter((notice) => notice.data?.request_id).map((notice) => notice.id).join(',');
  const requests = useAsyncData(() => api.mySkillRequests(), [serviceNoticeKey]);

  const [type, setType] = useState<SkillRequestType>('change_primary');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<SkillRequest | null>(null);

  useEffect(() => {
    void refreshProfile().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not refresh your services.'));
  }, [refreshProfile]);

  useRefreshOnForeground(requests.reload, true);
  const secondaryServices = providerProfile?.approved_secondary_services ?? [];
  const mainService = providerProfile?.service_categories?.name ?? '—';
  const verified = providerProfile?.is_verified === true;
  const pending = (requests.data ?? []).find((r) => r.status === 'pending') ?? null;
  const history = (requests.data ?? []).filter((r) => r.status !== 'pending');
  const offeredIds = new Set<number>(
    [providerProfile?.category_id, ...secondaryServices.map((service) => service.category_id)].filter(
      (id): id is number => typeof id === 'number',
    ),
  );
  const choices = (categories.data ?? []).filter((c) => !offeredIds.has(c.id));
  const chosenName = (categories.data ?? []).find((c) => c.id === categoryId)?.name ?? null;
  const canSubmit = canSendRequest({ categoryId, offeredIds, reason, submitting });

  const submit = async () => {
    if (!categoryId || offeredIds.has(categoryId)) {
      setError('Choose a service.');
      return;
    }
    const problem = reasonProblem(reason);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createSkillRequest({ type, category_id: categoryId, reason: cleanText(reason) });
      setCategoryId(null);
      setReason('');
      showToast('Request sent to the admins', 'success');
      requests.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (request: SkillRequest) => {
    setConfirmCancel(null);
    try {
      await api.cancelSkillRequest(request.id);
      showToast('Request cancelled');
      requests.reload();
      // An approval may have landed meanwhile; keep the main service honest.
      await refreshProfile();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel the request.', 'error');
    }
  };

  /** One service a client can see: the main one, or an approved extra. */
  const renderService = (name: string, meta: string, showVerified = false) => {
    const Icon = categoryIcon(name);
    return (
      <View key={`${meta}-${name}`} style={styles.serviceRow}>
        <View style={styles.serviceTile}>
          <Icon size={18} color={Colors.link} />
        </View>
        <View style={styles.serviceText}>
          <Text style={styles.serviceName} numberOfLines={1}>{name}</Text>
          <Text style={styles.serviceMeta}>{meta}</Text>
        </View>
        {showVerified && (
          <View style={styles.verified}>
            <ShieldCheck size={13} color={Colors.successText} />
            <Text style={styles.verifiedText}>ID verified</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">My Services</Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.overline}>What clients see now</Text>
          {renderService(mainService, 'Main service', verified)}
          {secondaryServices.map((service) =>
            renderService(service.service_categories.name, 'Approved additional service'),
          )}
        </View>

        {requests.loading && <ActivityIndicator color={Colors.link} style={styles.spinner} />}
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

        {pending && (
          <StatusCard
            tone="attention"
            overline="Under review"
            title={`${pending.type === 'change_primary' ? 'Change main service to ' : 'Add '}${pending.category?.name ?? 'a service'}`}
            body={`Sent ${shortDate(pending.created_at)}`}
          >
            <Text style={styles.reasonQuote}>“{pending.reason}”</Text>
            <Tap
              onPress={() => setConfirmCancel(pending)}
              activeOpacity={0.8}
              hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel request"
              style={styles.cancelLink}
            >
              <Text style={styles.cancelLinkText}>Cancel request</Text>
            </Tap>
          </StatusCard>
        )}

        {!pending && !requests.loading && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Request a change</Text>
            <View style={styles.typeGroup}>
              {TYPE_OPTIONS.map((opt) => (
                <View key={opt.value}>
                  <RadioRow
                    label={opt.label}
                    selected={type === opt.value}
                    onSelect={() => setType(opt.value)}
                  />
                  <Text style={styles.typeHint}>{opt.hint}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Service</Text>
            <View style={styles.chipGrid}>
              {choices.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <Tap
                    key={cat.id}
                    style={[styles.chip, active && styles.chipOn]}
                    onPress={() => setCategoryId(cat.id)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4 }}
                    accessibilityRole="radio"
                    accessibilityLabel={cat.name}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextOn]}>{cat.name}</Text>
                  </Tap>
                );
              })}
            </View>

            <TextField
              label="Why are you qualified?"
              value={reason}
              onChangeText={setReason}
              placeholder="Years of experience, licences or certificates, past jobs…"
              multiline
              maxLength={REASON_MAX}
              counter={`${reason.length} / ${REASON_MAX}`}
              error={reasonProblem(reason)}
              editable={!submitting}
              keyboardAppearance={appearance}
            />

            <View style={styles.infoBox}>
              <ShieldCheck size={18} color={V6Colors.ink700} />
              <Text style={styles.infoText}>{requestCopy(chosenName)}</Text>
            </View>
          </>
        )}

        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Past requests</Text>
            {history.map((r) => {
              const meta = STATUS_META[r.status];
              const kind = requestIconKind(r.status);
              const Icon = REQUEST_ICON[kind];
              return (
                <View key={r.id} style={styles.historyRow}>
                  <View style={styles.historyIcon} testID={`request-icon-${kind}`}>
                    <Icon size={18} color={meta.color} />
                  </View>
                  <View style={styles.historyText}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {r.type === 'change_primary' ? 'Change to ' : 'Add '}
                      {r.category?.name ?? 'a service'}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {shortDate(r.reviewed_at ?? r.created_at)}
                      {r.review_note ? ` · ${r.review_note}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </KeyboardAwareScrollView>

      {!pending && !requests.loading && (
        <BottomActionBar
          primaryLabel="Send request"
          onPrimary={() => void submit()}
          primaryDisabled={!canSubmit}
          busy={submitting}
        />
      )}

      <ConfirmationModal
        visible={!!confirmCancel}
        title="Cancel this request?"
        message="The admins won't review it. You can send a new one afterwards."
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        onConfirm={() => confirmCancel && void cancelRequest(confirmCancel)}
        onCancel={() => setConfirmCancel(null)}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const STATUS_META: Record<SkillRequest['status'], { label: string; color: string; bg: string }> = {
    pending: { label: 'Under review', color: Colors.warningText, bg: Colors.warningSurface },
    approved: { label: 'Approved', color: Colors.successText, bg: Colors.successSurface },
    rejected: { label: 'Not approved', color: Colors.dangerText, bg: Colors.dangerSurface },
    cancelled: { label: 'Cancelled', color: C.ink500, bg: C.canvas },
  };
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: C.hairline,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    body: { flex: 1 },
    bodyContent: { padding: Spacing.screenH, paddingBottom: 24, gap: 14 },
    spinner: { marginTop: 16 },
    error: { color: Colors.dangerText, fontSize: 13.5, lineHeight: 19, fontFamily: 'Inter' },

    card: {
      backgroundColor: C.surface, borderRadius: V6Radii.card, borderWidth: 1, borderColor: C.line,
      padding: 16, gap: 12,
    },
    overline: {
      color: C.ink500, fontSize: 10, fontWeight: '700', lineHeight: 14, letterSpacing: 0.6,
      textTransform: 'uppercase', fontFamily: 'Inter',
    },
    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    serviceTile: {
      width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center',
    },
    serviceText: { flex: 1, minWidth: 0, gap: 2 },
    serviceName: { color: C.ink900, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    serviceMeta: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    verified: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
      backgroundColor: Colors.successSurface, borderWidth: 1, borderColor: Colors.successBorder,
    },
    verifiedText: { color: Colors.successText, fontSize: 12, fontWeight: '600', lineHeight: 16, fontFamily: 'Inter' },

    reasonQuote: { color: C.ink500, fontSize: 13.5, fontStyle: 'italic', lineHeight: 19, fontFamily: 'Inter', marginTop: 8 },
    cancelLink: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
    cancelLinkText: { color: Colors.dangerText, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

    sectionTitle: { color: C.ink900, fontSize: 17, fontWeight: '700', lineHeight: 22, fontFamily: 'Inter', marginTop: 6 },
    typeGroup: { gap: 8 },
    typeHint: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', paddingHorizontal: 14, paddingTop: 4 },
    fieldLabel: { color: C.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter', marginTop: 4 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    },
    chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: C.ink700, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    chipTextOn: { color: Colors.onPrimary, fontWeight: '700' },
    infoBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      padding: 14, borderRadius: 14, backgroundColor: Colors.primaryTonal,
    },
    infoText: { flex: 1, color: C.ink700, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },

    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14,
      padding: 12, marginBottom: 8,
    },
    historyIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    historyText: { flex: 1, minWidth: 0 },
    historyTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    historyMeta: { color: C.ink500, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter', marginTop: 1 },
    pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    pillText: { fontSize: 11.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, STATUS_META, styles };
}
