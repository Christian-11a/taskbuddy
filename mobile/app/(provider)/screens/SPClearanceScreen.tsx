import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import ClearanceUploadForm, {
  CLEARANCE_FIELD_ORDER,
  clearanceTypeLabel,
  type ClearanceUploadFormHandle,
} from '../../../src/components/ClearanceUploadForm';
import { api, type Clearance } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';

const STATUS_LABEL: Record<Clearance['status'], string> = {
  pending: 'Under review',
  approved: 'Approved',
  rejected: 'Not accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

const HINT = 'Upload a valid NBI clearance or police clearance. An admin checks that the name matches your ID.';

export default function SPClearanceScreen({ onBack }: { onBack: () => void }) {
  const { styles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const clearances = useAsyncData(() => api.myClearances(), []);
  const [busy, setBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Clearance | null>(null);
  const formRef = useRef<ClearanceUploadFormHandle>(null);
  const scroll = useScrollToFirstError(CLEARANCE_FIELD_ORDER);
  const { scrollRef } = scroll;

  const resubmit = (item: Clearance) => {
    formRef.current?.prefill(item);
    setError(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const remove = async () => {
    const entry = removing!;
    setRemoving(null);
    setBusy(true);
    try {
      await api.removeClearance(entry.id);
      clearances.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this clearance.');
    } finally {
      setBusy(false);
    }
  };

  const list = clearances.data?.clearances;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Clearance</Text>
      </View>
      <KeyboardAwareScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{HINT}</Text>

        <ClearanceUploadForm
          ref={formRef}
          scroll={scroll}
          onBusyChange={setFormBusy}
          onSubmitted={() => clearances.reload()}
        />
        {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}

        <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Your clearances</Text>
        {clearances.loading && !clearances.data && <ContentSkeleton variant="list" />}
        {!!clearances.error && (
          <LoadErrorCard title="Couldn't load your clearances" message={clearances.error} onRetry={clearances.reload} />
        )}
        {list?.length === 0 && <Text style={styles.intro}>No clearances yet.</Text>}
        {list?.map((item) => {
          const label = clearanceTypeLabel(item.clearance_type);
          const canResubmit = item.status === 'rejected' || item.status === 'revoked' || item.status === 'expired';
          const canRemove = item.status === 'pending' || item.status === 'rejected';
          const reason = item.status === 'rejected' ? item.rejection_reason : item.status === 'revoked' ? item.revoke_reason : null;
          return (
            <View key={item.id} style={styles.card} testID={`clearance-${item.id}`}>
              <ShieldCheck size={22} color={item.status === 'approved' ? Colors.primary : V6Colors.ink500} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{label}</Text>
                <Text style={styles.cardMeta}>{`${item.clearance_number} · until ${item.expires_on}`}</Text>
                <Text style={[styles.status, item.status === 'approved' && styles.statusOk]}>{STATUS_LABEL[item.status]}</Text>
                {!!reason && <Text style={styles.cardMeta}>{reason}</Text>}
              </View>
              {canResubmit && (
                <Tap disabled={busy} onPress={() => resubmit(item)} accessibilityRole="button" accessibilityLabel={`Resubmit ${label}`}>
                  <Text style={styles.link}>Resubmit</Text>
                </Tap>
              )}
              {canRemove && (
                <Tap disabled={busy} onPress={() => setRemoving(item)} accessibilityRole="button" accessibilityLabel={`Remove ${label}`}>
                  <Text style={styles.link}>Remove</Text>
                </Tap>
              )}
            </View>
          );
        })}
      </KeyboardAwareScrollView>

      <BottomActionBar
        primaryLabel={busy || formBusy ? 'Submitting…' : 'Submit for review'}
        onPrimary={() => void formRef.current?.submit()}
        busy={busy || formBusy}
        primaryDisabled={busy || formBusy}
      />

      <ConfirmationModal
        visible={removing !== null}
        title="Remove clearance?"
        message="This withdraws it from review."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: V6Colors.surface, paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: V6Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 24, gap: 14 },
    intro: { color: V6Colors.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    listTitle: { marginTop: 8, fontSize: 15, color: V6Colors.ink900 },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    cardText: { flex: 1, gap: 2 },
    cardTitle: { color: V6Colors.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    cardMeta: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    status: { color: V6Colors.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter', marginTop: 2 },
    statusOk: { color: Colors.primary },
    link: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
