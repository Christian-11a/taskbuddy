import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import StatusCard from '../../../src/components/ui/StatusCard';
import { ArrowLeft, Check, Paperclip, RefreshCw } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useAuth } from '../../../src/context/AuthContext';
import { api, type Message } from '../../../src/lib/api';
import { caseView, type CaseStep } from '../../../src/lib/caseView';

interface Props { jobId: string | null; onBack: () => void }

export default function HODisputeStatusScreen({ jobId, onBack }: Props) {
  const { C, Colors, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile } = useAuth();
  const { data: dispute, loading, error, reload } = useAsyncData(() => jobId ? api.jobDispute(jobId) : Promise.resolve(null), [jobId]);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'statement' | 'appeal'>('statement');
  const [evidence, setEvidence] = useState<Message[]>([]);
  const [messageId, setMessageId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = dispute?.status === 'open' && dispute.cancellation_state === 'pending';
  const canRespond = pending && dispute.jobs?.assigned_provider_id === profile?.id &&
    !!dispute.cancellation_deadline && Date.now() < new Date(dispute.cancellation_deadline).getTime();
  const view = dispute ? caseView(dispute, profile?.id) : null;

  async function submit(accept?: boolean) {
    if (!dispute || !body.trim() || busy) return;
    setBusy(true); setActionError(null);
    try {
      if (accept !== undefined) await api.respondToCancellation(dispute.id, accept, body.trim(), messageId);
      else await api.addDisputeEntry(dispute.id, { kind: dispute.status === 'open' ? kind : 'appeal', body: body.trim(), message_id: messageId });
      setBody(''); setMessageId(undefined); reload();
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not update the complaint.'); }
    finally { setBusy(false); }
  }
  async function loadEvidence() {
    if (!jobId || busy) return;
    setBusy(true); setActionError(null);
    try {
      const conversation = await api.openConversation(jobId);
      setEvidence((await api.messages(conversation.id)).filter((message) => message.sender_id === profile?.id));
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not load job evidence.'); }
    finally { setBusy(false); }
  }

  const open = dispute?.status === 'open';

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <Tap style={styles.backButton} onPress={onBack} accessibilityLabel="Back" activeOpacity={0.8}><ArrowLeft size={20} color={C.ink700} /></Tap>
      <Text style={styles.title} numberOfLines={1}>{view?.heading ?? 'Report'}</Text>
      <Tap style={styles.refreshButton} onPress={reload} accessibilityLabel="Refresh complaint" activeOpacity={0.8}>
        <RefreshCw size={15} color={V6Colors.link} />
        <Text style={styles.refreshText}>Refresh</Text>
      </Tap>
    </View>
    {loading && <ActivityIndicator style={styles.loader} color={V6Colors.link} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !error && !dispute && <Text style={[styles.text, styles.emptyPage]}>No complaint has been filed for this job.</Text>}
    {dispute && view && <KeyboardAvoidingView style={styles.flex} behavior="padding"><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {!!view.jobChip && <Text style={styles.jobChip} numberOfLines={1}>{view.jobChip}</Text>}

      {/* Where the case stands, in plain words */}
      <StatusCard tone={view.status.tone} overline={view.status.overline} title={view.status.title} body={view.status.body} />
      {canRespond && <View style={styles.card}>
        <Text style={styles.label}>Their reason</Text>
        <Text style={styles.body}>{view.theirReason}</Text>
      </View>}

      <Text style={styles.sectionTitle}>What happened</Text>
      <View style={styles.timeline}>
        {view.steps.map((step: CaseStep, index) => {
          const last = index === view.steps.length - 1;
          const marker = step.state === 'done' ? styles.markerDone : step.state === 'current' ? styles.markerCurrent : styles.markerNext;
          return <View key={step.id} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.marker, marker]}>
                {step.state === 'done' && <Check size={12} color={Colors.successText} strokeWidth={3} />}
                {step.state === 'current' && <View style={styles.dot} />}
              </View>
              {!last && <View style={styles.connector} />}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, step.state === 'next' && styles.stepTitleNext]}>{step.title}</Text>
              {!!step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
              {!!step.chatNote && <Text style={styles.stepDetail}>{step.chatNote}</Text>}
              {!!step.photoUrl && <Image accessibilityLabel="Case photo evidence" source={{ uri: step.photoUrl }} style={styles.photo} resizeMode="contain" />}
              {!!step.photoUnavailable && !step.photoUrl && <Text style={styles.error}>Photo evidence is unavailable. Refresh to retry.</Text>}
              {!!step.meta && <Text style={styles.stepMeta}>{step.meta}</Text>}
            </View>
          </View>;
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{dispute.status === 'open' ? 'Add a statement or appeal' : 'Appeal the recorded decision'}</Text>
        <Text style={styles.text}>Describe your position. Send photos in the job chat, then select your message below as evidence. An appeal reopens review without reversing settled payments.</Text>
        {dispute.status === 'open' && !pending && <View style={styles.segment}>
          <Tap style={[styles.segmentItem, kind === 'statement' && styles.segmentItemOn]} onPress={() => setKind('statement')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'statement' }} activeOpacity={0.85}><Text style={[styles.segmentText, kind === 'statement' && styles.segmentTextOn]}>Statement</Text></Tap>
          <Tap style={[styles.segmentItem, kind === 'appeal' && styles.segmentItemOn]} onPress={() => setKind('appeal')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'appeal' }} activeOpacity={0.85}><Text style={[styles.segmentText, kind === 'appeal' && styles.segmentTextOn]}>Appeal</Text></Tap>
        </View>}
        <TextInput keyboardAppearance={appearance} accessibilityLabel="Case statement" multiline value={body} onChangeText={setBody} maxLength={1000} placeholder="Explain what happened…" placeholderTextColor={C.ink400} textAlignVertical="top" style={styles.input} />
        <Tap style={styles.evidenceButton} onPress={() => void loadEvidence()} disabled={busy} activeOpacity={0.8}>
          <Paperclip size={16} color={V6Colors.link} />
          <Text style={styles.evidenceText}>Choose job chat evidence</Text>
        </Tap>
        {evidence.map((message) => {
          const selected = messageId === message.id;
          return <Tap key={message.id} style={[styles.evidenceRow, selected && styles.evidenceRowOn]} onPress={() => setMessageId(selected ? undefined : message.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} activeOpacity={0.85}>
            <Text style={[styles.text, selected && styles.evidenceRowTextOn]}>{selected ? 'Selected: ' : ''}{message.body || 'Photo message'} · {new Date(message.created_at).toLocaleString()}</Text>
          </Tap>;
        })}
        {!!actionError && <Text style={styles.error}>{actionError}</Text>}
        {canRespond ? <>
          <Tap style={[styles.button, (busy || !body.trim()) && styles.buttonDisabled]} disabled={busy || !body.trim()} onPress={() => void submit(true)}><Text style={[styles.buttonText, (busy || !body.trim()) && styles.buttonTextDisabled]}>Agree to cancellation and refund</Text></Tap>
          <Tap style={styles.outlineButton} disabled={busy || !body.trim()} onPress={() => void submit(false)}><Text style={styles.outlineButtonText}>Contest cancellation</Text></Tap>
        </> : <Tap style={[styles.button, (busy || !body.trim()) && styles.buttonDisabled]} disabled={busy || !body.trim()} onPress={() => void submit()}><Text style={[styles.buttonText, (busy || !body.trim()) && styles.buttonTextDisabled]}>{busy ? 'Saving…' : dispute.status === 'open' ? 'Submit statement' : 'Submit appeal'}</Text></Tap>}
      </View>
    </ScrollView></KeyboardAvoidingView>}
  </View>;
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, paddingHorizontal: Spacing.screenH, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: C.line,
    },
    backButton: {
      width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center',
    },
    title: { flex: 1, fontSize: 19.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
    refreshButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
      paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.primaryTonal,
    },
    refreshText: { color: V6Colors.link, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    loader: { marginTop: 24 },
    emptyPage: { padding: Spacing.screenH },
    content: { padding: Spacing.screenH, paddingTop: 16, gap: 14, paddingBottom: 40 },
    jobChip: {
      alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 999, backgroundColor: C.primaryTonal, color: C.primaryDeep,
      fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter',
    },
    card: {
      backgroundColor: C.surface, borderRadius: V6Radii.card, borderWidth: 1, borderColor: C.line,
      padding: 16, gap: 10, ...V6Shadows.sm,
    },
    label: { color: C.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginTop: 2 },
    timeline: { gap: 0 },
    step: { flexDirection: 'row', gap: 12 },
    rail: { width: 22, alignItems: 'center' },
    marker: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    markerDone: { backgroundColor: V6Colors.successSurface, borderColor: V6Colors.successBorder },
    markerCurrent: { backgroundColor: C.primaryTonal, borderColor: Colors.link },
    markerNext: { backgroundColor: C.surface, borderColor: C.line },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.link },
    connector: { flex: 1, width: 2, backgroundColor: C.line, marginVertical: 2 },
    stepBody: { flex: 1, gap: 4, paddingBottom: 18 },
    stepTitle: { color: C.ink900, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    stepTitleNext: { color: C.ink700, fontWeight: '500' },
    stepDetail: { color: C.ink700, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    stepMeta: { color: C.ink500, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },
    body: { color: C.ink800, fontSize: 15, lineHeight: 22, fontFamily: 'Inter' },
    text: { color: C.ink500, fontSize: 14, lineHeight: 21, fontFamily: 'Inter' },
    segment: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: C.ink100, gap: 4 },
    segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
    segmentItemOn: { backgroundColor: C.surface, ...V6Shadows.sm },
    segmentText: { color: C.ink500, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    segmentTextOn: { color: C.ink900, fontWeight: '700' },
    input: {
      minHeight: 110, padding: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.fieldBorder,
      borderRadius: V6Radii.input, color: C.ink900, fontSize: 15, fontFamily: 'Inter',
    },
    evidenceButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, alignSelf: 'flex-start' },
    evidenceText: { color: V6Colors.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    evidenceRow: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line },
    evidenceRowOn: { borderColor: C.cyan700, backgroundColor: C.primaryTonal },
    evidenceRowTextOn: { color: C.ink900 },
    button: {
      minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
      backgroundColor: C.primary, borderRadius: V6Radii.btn, marginTop: 2,
    },
    // Readable disabled state: grey fill with dark text, like the other forms.
    buttonDisabled: { backgroundColor: C.ink100 },
    buttonText: { color: C.onPrimary, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
    buttonTextDisabled: { color: C.ink700 },
    outlineButton: {
      minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
      borderRadius: V6Radii.btn, borderWidth: 1, borderColor: C.fieldBorder, backgroundColor: C.surface,
    },
    outlineButtonText: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    photo: { width: '100%', height: 200, borderRadius: 12 },
    error: { color: V6Colors.dangerText, padding: 12, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
