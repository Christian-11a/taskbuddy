/**
 * CertificateNotices.tsx
 *
 * Two small pieces shared by the Certifications screen and the Get verified
 * status screen: the expiry notices (amber within 30 days, red once expired)
 * and the two-row "Identity / Certificate" status.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Banner from './ui/Banner';
import Tap from './ui/Tap';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import type { ClearanceState, Credential } from '../lib/api';
import { certificateExpiry, type VerificationSummary } from '../lib/verificationStatus';

/** Today as YYYY-MM-DD in the phone's own calendar. */
export function todayIso(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function expiryMessage(serviceName: string, state: 'expiring' | 'expired', daysLeft: number): string {
  if (state === 'expired') {
    return `Your ${serviceName} certificate expired. Upload a new one to send proposals for ${serviceName}.`;
  }
  const when = daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'in 1 day' : `in ${daysLeft} days`;
  return `Your ${serviceName} certificate expires ${when}. Upload the renewed one.`;
}

export function CertificateExpiryNotice({
  credentials,
  serviceNames,
  onRenew,
  today = todayIso(),
}: {
  credentials: readonly Pick<Credential, 'category_id' | 'status' | 'expires_on'>[] | null | undefined;
  /** Service names by category id. */
  serviceNames: Record<number, string | undefined>;
  onRenew: (categoryId: number) => void;
  today?: string;
}) {
  const { s } = useThemedStyles(createStyles);
  const items = certificateExpiry(credentials, today).filter(
    (item): item is Extract<typeof item, { state: 'expiring' | 'expired' }> => item.state !== 'ok',
  );
  if (!items.length) return null;
  return (
    <View style={s.stack} testID="expiry-notices">
      {items.map((item) => (
        <Banner
          key={item.categoryId}
          tone={item.state === 'expired' ? 'error' : 'warning'}
          message={expiryMessage(serviceNames[item.categoryId] ?? 'service', item.state, item.daysLeft)}
          actionLabel="Upload renewal"
          onAction={() => onRenew(item.categoryId)}
        />
      ))}
    </View>
  );
}

const IDENTITY_LABEL: Record<string, string> = {
  approved: 'approved',
  pending: 'under review',
  rejected: 'not accepted',
  revoked: 'revoked',
  none: 'not started',
};
const CERTIFICATE_LABEL: Record<string, string> = {
  none: 'needed',
  pending: 'under review',
  expired: 'expired',
  rejected: 'not accepted',
  revoked: 'revoked',
  approved: 'approved',
};

/** What the certificate row's action says, or null when nothing is left to do. */
export function certificateActionLabel(certificate: string): string | null {
  if (certificate === 'none') return 'Upload your certificate';
  if (certificate === 'rejected' || certificate === 'revoked') return 'Upload a new certificate';
  if (certificate === 'expired') return 'Upload renewal';
  return null;
}

const CLEARANCE_LABEL: Record<ClearanceState, string> = {
  none: 'not uploaded',
  pending: 'under review',
  approved: 'approved',
  rejected: 'not accepted',
  expired: 'expired',
  revoked: 'revoked',
};

/** The clearance row's action. Pending and approved open the list; the rest start an upload. */
export function clearanceActionLabel(clearance: string): string {
  if (clearance === 'rejected' || clearance === 'revoked' || clearance === 'expired') return 'Upload again';
  if (clearance === 'pending' || clearance === 'approved') return 'View';
  return 'Upload clearance';
}

export function CertificateStatusRows({
  summary,
  clearance = 'none',
  onCertificateAction,
  onClearanceAction,
}: {
  summary: Pick<VerificationSummary, 'identity' | 'certificate'>;
  /** Shown even while a clearance is not required, so a provider can upload early. */
  clearance?: ClearanceState;
  onCertificateAction?: () => void;
  onClearanceAction?: () => void;
}) {
  const { s } = useThemedStyles(createStyles);
  const action = certificateActionLabel(summary.certificate);
  const clearanceAction = clearanceActionLabel(clearance);
  const identityOk = summary.identity === 'approved';
  const certificateOk = summary.certificate === 'approved';
  return (
    <View style={s.rows} testID="verification-status-rows">
      <View style={s.row}>
        <Text style={s.rowText}>{`Identity: ${IDENTITY_LABEL[summary.identity]}`}</Text>
        <Text style={identityOk ? s.ok : s.todo}>{identityOk ? 'Done' : ''}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.rowText}>{`Certificate: ${CERTIFICATE_LABEL[summary.certificate]}`}</Text>
        {certificateOk ? (
          <Text style={s.ok}>Done</Text>
        ) : (
          !!action && !!onCertificateAction && (
            <Tap onPress={onCertificateAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action}>
              <Text style={s.action}>{action}</Text>
            </Tap>
          )
        )}
      </View>
      <View style={s.row}>
        <Text style={s.rowText}>{`NBI or police clearance: ${CLEARANCE_LABEL[clearance]}`}</Text>
        <Tap onPress={() => onClearanceAction?.()} hitSlop={8} accessibilityRole="button" accessibilityLabel={clearanceAction}>
          <Text style={s.action}>{clearanceAction}</Text>
        </Tap>
      </View>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    stack: { gap: 10 },
    rows: {
      backgroundColor: V6Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line,
      paddingHorizontal: 14, paddingVertical: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
    rowText: { flex: 1, color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20 },
    ok: { color: Colors.primary, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
    todo: { color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 14 },
    action: { color: Colors.link, fontFamily: 'Inter', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  }),
});
