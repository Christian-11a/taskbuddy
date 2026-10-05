import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import { ArrowLeft } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useAuth } from '../../../src/context/AuthContext';
import { api, type Message } from '../../../src/lib/api';

interface Props { jobId: string | null; onBack: () => void }

export default function HODisputeStatusScreen({ jobId, onBack }: Props) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
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

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <Tap onPress={onBack} accessibilityLabel="Back"><ArrowLeft size={22} color={C.ink700} /></Tap>
      <Text style={styles.title}>Complaint Status</Text>
      <Tap onPress={reload} accessibilityLabel="Refresh complaint"><Text style={styles.link}>Refresh</Text></Tap>
    </View>
    {loading && <ActivityIndicator color={V6Colors.link} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !error && !dispute && <Text style={styles.text}>No complaint has been filed for this job.</Text>}
    {dispute && <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{dispute.reason}</Text>
      {!!dispute.details && <Text style={styles.text}>{dispute.details}</Text>}
      <Text style={styles.text}>Filed {new Date(dispute.created_at).toLocaleString()}</Text>
      {pending ? <Text style={styles.text}>Cancellation awaiting provider response until {new Date(dispute.cancellation_deadline!).toLocaleString()}. No response refunds any unsettled payment to the client.</Text>
        : dispute.status === 'open' ? <Text style={styles.text}>{dispute.escrow_transactions?.status === 'disputed' ? 'Payment under admin review' : 'Complaint awaiting admin review'}</Text>
        : <Text style={styles.heading}>Decision recorded: {dispute.resolution}</Text>}
      {!!dispute.resolution_note && <Text style={styles.text}>{dispute.resolution_note}</Text>}
      {!!dispute.resolved_at && <Text style={styles.text}>Closed {new Date(dispute.resolved_at).toLocaleString()}</Text>}
      <Text style={styles.heading}>Recorded case activity</Text>
      {(dispute.entries ?? []).map((entry) => <View key={entry.id} style={styles.entry}>
        <Text style={styles.heading}>{entry.author?.full_name ?? 'System'} · {entry.kind}</Text>
        <Text style={styles.text}>{entry.body}</Text>
        <Text style={styles.text}>{new Date(entry.created_at).toLocaleString()}</Text>
        {!!entry.message?.body && <Text style={styles.text}>Job chat evidence: {entry.message.body}</Text>}
        {entry.attachment_url && <Image accessibilityLabel="Case photo evidence" source={{ uri: entry.attachment_url }} style={styles.photo} resizeMode="contain" />}
        {entry.message?.attachment_path && !entry.attachment_url && <Text style={styles.error}>Photo evidence is unavailable. Refresh to retry.</Text>}
      </View>)}
      <Text style={styles.heading}>{dispute.status === 'open' ? 'Add a statement or appeal' : 'Appeal the recorded decision'}</Text>
      <Text style={styles.text}>Describe your position. Send photos in the job chat, then select your message below as evidence. An appeal reopens review without reversing settled payments.</Text>
      {dispute.status === 'open' && !pending && <View style={styles.header}>
        <Tap onPress={() => setKind('statement')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'statement' }}><Text style={styles.link}>Statement</Text></Tap>
        <Tap onPress={() => setKind('appeal')} accessibilityRole="radio" accessibilityState={{ checked: kind === 'appeal' }}><Text style={styles.link}>Appeal</Text></Tap>
      </View>}
      <TextInput keyboardAppearance={appearance} accessibilityLabel="Case statement" multiline value={body} onChangeText={setBody} maxLength={1000} placeholder="Explain what happened…" style={styles.input} />
      <Tap onPress={() => void loadEvidence()} disabled={busy}><Text style={styles.link}>Choose job chat evidence</Text></Tap>
      {evidence.map((message) => <Tap key={message.id} onPress={() => setMessageId(messageId === message.id ? undefined : message.id)} accessibilityRole="checkbox" accessibilityState={{ checked: messageId === message.id }}>
        <Text style={styles.text}>{messageId === message.id ? 'Selected: ' : ''}{message.body || 'Photo message'} · {new Date(message.created_at).toLocaleString()}</Text>
      </Tap>)}
      {!!actionError && <Text style={styles.error}>{actionError}</Text>}
      {canRespond ? <>
        <Tap style={styles.button} disabled={busy || !body.trim()} onPress={() => void submit(true)}><Text style={styles.buttonText}>Agree to cancellation and refund</Text></Tap>
        <Tap style={styles.button} disabled={busy || !body.trim()} onPress={() => void submit(false)}><Text style={styles.buttonText}>Contest cancellation</Text></Tap>
      </> : <Tap style={styles.button} disabled={busy || !body.trim()} onPress={() => void submit()}><Text style={styles.buttonText}>{busy ? 'Saving…' : dispute.status === 'open' ? 'Submit statement' : 'Submit appeal'}</Text></Tap>}
    </ScrollView>}
  </View>;
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screenH, paddingBottom: 12, gap: 12 },
    title: { fontSize: 20, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
    content: { padding: Spacing.screenH, gap: 12, paddingBottom: 40 },
    heading: { color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    text: { color: C.ink500, fontSize: 14, lineHeight: 21, fontFamily: 'Inter' },
    link: { color: V6Colors.link, fontSize: 14, fontFamily: 'Inter' },
    entry: { padding: 14, backgroundColor: C.surface, borderRadius: 12, gap: 8 },
    input: { minHeight: 100, padding: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, color: C.ink900, fontFamily: 'Inter' },
    button: { backgroundColor: C.cyan700, padding: 14, borderRadius: 12, alignItems: 'center' },
    buttonText: { color: C.onPrimary, fontFamily: 'Inter', fontWeight: '700' },
    photo: { width: '100%', height: 220 },
    error: { color: V6Colors.dangerText, padding: 12, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
