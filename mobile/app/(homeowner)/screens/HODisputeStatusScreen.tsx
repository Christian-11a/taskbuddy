import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import StatusCard from '../../../src/components/ui/StatusCard';
import TextField from '../../../src/components/ui/TextField';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import SheetFrame from '../../../src/components/ui/SheetFrame';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { ArrowLeft, Check, Paperclip, Undo2 } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useAuth } from '../../../src/context/AuthContext';
import { api, type Message } from '../../../src/lib/api';
import { caseDate, caseView, type CaseStep } from '../../../src/lib/caseView';
import { cleanText, validateText } from '../../../src/lib/textRules';

interface Props {
  jobId: string | null;
  onBack: () => void;
  /** Opens the job chat with the other party. Optional: the link shows only when given. */
  onMessage?: () => void;
}

export default function HODisputeStatusScreen({ jobId, onBack, onMessage }: Props) {
  const { C, Colors, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile } = useAuth();
  const { data: dispute, loading, error, reload } = useAsyncData(() => jobId ? api.jobDispute(jobId) : Promise.resolve(null), [jobId]);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'statement' | 'appeal'>('statement');
  const [evidence, setEvidence] = useState<Message[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [messageId, setMessageId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'agree' | 'contest' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inFlight = useRef(false);
  const open = dispute?.status === 'open';
  const pending = dispute?.status === 'open' && dispute.cancellation_state === 'pending';
  const canRespond = pending && dispute.jobs?.assigned_provider_id === profile?.id &&
    !!dispute.cancellation_deadline && Date.now() < new Date(dispute.cancellation_deadline).getTime();
  const view = dispute ? caseView(dispute, profile?.id) : null;
  // Statement or appeal: the segment only applies while the case is open and not awaiting a response.
  const entryKind = open ? kind : 'appeal';
  const sendLabel = entryKind === 'appeal' ? 'Send appeal' : 'Send details';
  const noNote = busy || !cleanText(body);
  // The note is required, so spaces alone are refused; the message shows once the field is left.
  const noteError = validateText(body, { required: true, max: 1000, label: 'a note' }) ?? undefined;

  async function submit(accept?: boolean): Promise<boolean> {
    if (!dispute || !cleanText(body) || busy || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setActionError(null);
    try {
      if (accept !== undefined) await api.respondToCancellation(dispute.id, accept, cleanText(body), messageId);
      else await api.addDisputeEntry(dispute.id, { kind: dispute.status === 'open' ? kind : 'appeal', body: cleanText(body), message_id: messageId });
      setBody(''); setMessageId(undefined); reload();
      return true;
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not update the complaint.'); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  // Each confirm closes itself, then runs the same submit call exactly once.
  function confirmAgree() { setConfirm(null); void submit(true); }
  function confirmContest() { setConfirm(null); void submit(false); }
  async function sendDetails() { if (await submit()) setSheetOpen(false); }
  async function loadEvidence() {
    if (!jobId || busy || evidenceLoading) return;
    setEvidenceLoading(true); setActionError(null);
    try {
      const conversation = await api.openConversation(jobId);
      setEvidence((await api.messages(conversation.id)).filter((message) => message.sender_id === profile?.id));
      setEvidenceLoaded(true);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not load job evidence.'); }
    finally { setEvidenceLoading(false); }
  }
  function openSheet() { setSheetOpen(true); void loadEvidence(); }

  // Inline evidence picker, used by the provider's answer.
  const evidenceTrigger = <Tap style={styles.evidenceButton} onPress={() => void loadEvidence()} disabled={busy} activeOpacity={0.8}>
    <Paperclip size={16} color={V6Colors.link} />
    <Text style={styles.evidenceText}>Choose job chat evidence</Text>
  </Tap>;
  const evidenceRows = evidence.map((message) => {
    const selected = messageId === message.id;
    return <Tap key={message.id} style={[styles.evidenceRow, selected && styles.evidenceRowOn]} onPress={() => setMessageId(selected ? undefined : message.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={message.body || 'Photo message'} activeOpacity={0.85}>
      {!!message.attachment_url && <Image accessibilityLabel="Photo from the job chat" source={{ uri: message.attachment_url }} style={styles.thumb} resizeMode="cover" />}
      <View style={styles.evidenceBodyWrap}>
        <Text style={[styles.evidenceBody, selected && styles.evidenceRowTextOn]}>{message.body || 'Photo message'}</Text>
        <Text style={styles.stepMeta}>{caseDate(message.created_at)}</Text>
      </View>
      {selected && <Check size={16} color={Colors.link} strokeWidth={3} />}
    </Tap>;
  });

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <Tap style={styles.backButton} onPress={onBack} hitSlop={5} accessibilityRole="button" accessibilityLabel="Back" activeOpacity={0.8}><ArrowLeft size={20} color={C.ink700} /></Tap>
      <Text style={styles.title} numberOfLines={1}>{view?.heading ?? 'Report'}</Text>
    </View>
    {loading && <ActivityIndicator style={styles.loader} color={V6Colors.link} />}
    {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    {!loading && !error && !dispute && <Text style={[styles.text, styles.emptyPage]}>No complaint has been filed for this job.</Text>}
    {dispute && view && <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        testID="case-scroll" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={V6Colors.link} colors={[V6Colors.link]} />}
      >
        {!!view.jobChip && <Text style={styles.jobChip} numberOfLines={1}>{view.jobChip}</Text>}

        {/* Where the case stands, in plain words */}
        <StatusCard tone={view.status.tone} overline={view.status.overline} title={view.status.title} body={view.status.body} />
        {canRespond && <View style={styles.card}>
          <Text style={styles.label}>Their reason</Text>
          <Text style={styles.body}>{view.theirReason}</Text>
        </View>}

        <Text style={styles.sectionTitle} accessibilityRole="header">What happened</Text>
        <View style={styles.timeline}>
          {view.steps.map((step: CaseStep, index) => {
            const last = index === view.steps.length - 1;
            const marker = step.state === 'done' ? styles.markerDone : step.state === 'current' ? styles.markerCurrent : styles.markerNext;
            return <View key={step.id} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.marker, marker]}>
                  {step.state === 'done' && <Check size={12} color={Colors.successText} strokeWidth={3} />}
                  {step.state === 'current' && <View accessible={false} style={styles.dot} />}
                </View>
                {!last && <View style={styles.connector} />}
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, step.state === 'next' && styles.stepTitleNext]}>{step.title}</Text>
                {!!step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
                {!!step.chatNote && <Text style={styles.stepDetail}>{step.chatNote}</Text>}
                {!!step.photoUrl && <Image accessibilityLabel="Case photo evidence" source={{ uri: step.photoUrl }} style={styles.photo} resizeMode="contain" />}
                {!!step.photoUnavailable && !step.photoUrl && <Text style={styles.error} accessibilityLiveRegion="polite">Photo evidence is unavailable. Pull down to retry.</Text>}
                {!!step.meta && <Text style={styles.stepMeta}>{step.meta}</Text>}
              </View>
            </View>;
          })}
        </View>

        {canRespond && <View style={styles.card}>
          <TextField
            label="Your note" value={body} onChangeText={setBody} helper="They'll see this with your answer." error={noteError}
            placeholder="Add a note for the client and admin" multiline maxLength={1000} keyboardAppearance={appearance}
          />
          {evidenceTrigger}
          {evidenceRows}
          {!!actionError && <Text style={styles.error} accessibilityLiveRegion="polite">{actionError}</Text>}
          <Tap style={styles.linkButton} onPress={() => setConfirm('contest')} disabled={noNote} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Contest and explain" accessibilityState={{ disabled: noNote }}>
            <Text style={[styles.linkText, noNote && styles.linkTextDisabled]}>Contest and explain</Text>
          </Tap>
        </View>}
      </ScrollView>
      {canRespond
        ? <BottomActionBar primaryLabel="Agree to cancel" onPrimary={() => setConfirm('agree')} primaryDisabled={noNote} busy={busy} />
        : open
          ? <BottomActionBar primaryLabel="Add details or photos" onPrimary={openSheet}
            secondaryLabel={onMessage ? `Message ${view.counterpartName}` : undefined} onSecondary={onMessage} />
          : <BottomActionBar primaryLabel={view.closedBackLabel} onPrimary={onBack}
            secondaryLabel="Disagree? Appeal this decision" onSecondary={openSheet} />}
    </KeyboardAvoidingView>}

    {canRespond && view && <>
      <ConfirmationModal
        visible={confirm === 'agree'} title={view.agree.title} message={view.agree.message} confirmLabel={view.agree.confirmLabel}
        cancelLabel="Go back" destructive icon={Undo2} busy={busy} onConfirm={confirmAgree} onCancel={() => setConfirm(null)}
      />
      <ConfirmationModal
        visible={confirm === 'contest'} title={view.contest.title} message={view.contest.message} confirmLabel={view.contest.confirmLabel}
        cancelLabel="Go back" busy={busy} onConfirm={confirmContest} onCancel={() => setConfirm(null)}
      />
    </>}

    {!canRespond && view && <SheetFrame visible={sheetOpen} onClose={busy ? undefined : () => setSheetOpen(false)} contentStyle={styles.sheet}>
      <Text style={styles.sheetTitle} accessibilityRole="header">{view.sheetTitle}</Text>
      <Text style={styles.text}>{view.sheetIntro}</Text>
      {open && !pending && <View style={styles.segment}>
        <Tap style={[styles.segmentItem, kind === 'statement' && styles.segmentItemOn]} onPress={() => setKind('statement')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'statement' }} activeOpacity={0.85}><Text style={[styles.segmentText, kind === 'statement' && styles.segmentTextOn]}>Details</Text></Tap>
        <Tap style={[styles.segmentItem, kind === 'appeal' && styles.segmentItemOn]} onPress={() => setKind('appeal')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'appeal' }} activeOpacity={0.85}><Text style={[styles.segmentText, kind === 'appeal' && styles.segmentTextOn]}>Appeal</Text></Tap>
      </View>}
      <TextField
        label="What else should the admin know?" value={body} onChangeText={setBody} helper={`${body.length} / 1000`} error={noteError}
        placeholder="Explain what happened…" multiline maxLength={1000} keyboardAppearance={appearance}
      />
      <Text style={styles.sectionTitle} accessibilityRole="header">From this job's chat</Text>
      <Text style={styles.text}>Pick one of your messages to attach it as evidence.</Text>
      {evidenceLoading ? <ActivityIndicator color={V6Colors.link} /> : evidenceRows}
      {evidenceLoaded && !evidenceLoading && evidence.length === 0 && <Text style={styles.text}>No messages from you in this job's chat yet.</Text>}
      {!!actionError && <Text style={styles.error} accessibilityLiveRegion="polite">{actionError}</Text>}
      <Tap style={[styles.button, noNote && styles.buttonDisabled]} disabled={noNote} onPress={() => void sendDetails()}
        accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{ disabled: noNote }}>
        <Text style={[styles.buttonText, noNote && styles.buttonTextDisabled]}>{busy ? 'Saving…' : sendLabel}</Text>
      </Tap>
      <Tap style={styles.linkButton} onPress={() => setSheetOpen(false)} disabled={busy} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel="Cancel" accessibilityState={{ disabled: busy }}>
        <Text style={styles.linkText}>Cancel</Text>
      </Tap>
    </SheetFrame>}
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
    sheet: { gap: 14, paddingHorizontal: 20, paddingTop: 4 },
    sheetTitle: { color: C.ink900, fontSize: 20, fontWeight: '700', lineHeight: 26, fontFamily: 'Inter' },
    segment: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: C.ink100, gap: 4 },
    segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
    segmentItemOn: { backgroundColor: C.surface, ...V6Shadows.sm },
    segmentText: { color: C.ink500, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    segmentTextOn: { color: C.ink900, fontWeight: '700' },
    evidenceButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, alignSelf: 'flex-start' },
    evidenceText: { color: V6Colors.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
    evidenceRowOn: { borderColor: C.cyan700, backgroundColor: C.primaryTonal },
    evidenceRowTextOn: { color: C.ink900 },
    evidenceBodyWrap: { flex: 1, gap: 2 },
    evidenceBody: { color: C.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: C.ink100 },
    linkButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    linkTextDisabled: { color: C.ink500 },
    button: {
      minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
      backgroundColor: C.primary, borderRadius: V6Radii.btn, marginTop: 2,
    },
    // Readable disabled state: grey fill with dark text, like the other forms.
    buttonDisabled: { backgroundColor: C.ink100 },
    buttonText: { color: C.onPrimary, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
    buttonTextDisabled: { color: C.ink700 },
    photo: { width: '100%', height: 200, borderRadius: 12 },
    error: { color: V6Colors.dangerText, padding: 12, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
