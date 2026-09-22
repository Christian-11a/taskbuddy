import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Send } from 'lucide-react-native';
import { V6Colors, V6Radii } from '../constants/theme';

const C = V6Colors;
/** Matches ApplyDto.cover_message's MaxLength on the backend. */
export const PROPOSAL_MAX_LENGTH = 300;

interface ProposalModalProps {
  visible: boolean;
  jobTitle?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (message: string) => void;
  onCancel: () => void;
}

/**
 * "Submit Proposal" used to send a bare application the moment it was
 * tapped. The client picks between proposals, so this gives the provider a
 * chance to say why them — shown to the client on the Proposals screen.
 */
export default function ProposalModal({
  visible, jobTitle, busy = false, error, onSubmit, onCancel,
}: ProposalModalProps) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) setMessage('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={busy ? undefined : onCancel} accessible={false}>
          <Pressable
            style={styles.dialog}
            onPress={(e) => {
              e.stopPropagation();
              Keyboard.dismiss();
            }}
            accessibilityViewIsModal
          >
            <Text style={styles.title} accessibilityRole="header">Send a proposal</Text>
            <Text style={styles.body}>
              {jobTitle ? `Tell the client why you're a good fit for "${jobTitle}".` : "Tell the client why you're a good fit."}{' '}
              Mention your experience, when you can start, or anything they should know.
            </Text>

            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Hi! I've done this kind of job many times and can come tomorrow morning…"
              placeholderTextColor={C.ink400}
              multiline
              maxLength={PROPOSAL_MAX_LENGTH}
              textAlignVertical="top"
              editable={!busy}
              testID="proposal-message"
              accessibilityLabel="Message to the client"
            />
            <Text style={styles.counter}>{message.length}/{PROPOSAL_MAX_LENGTH}</Text>

            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.disabled]}
                onPress={() => onSubmit(message.trim())}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                testID="proposal-send"
              >
                {busy ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <View style={styles.primaryContent}>
                    <Send size={15} color={C.white} />
                    <Text style={styles.primaryText}>Send proposal</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
  dialog: { backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22, width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter' },
  body: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 14 },
  input: {
    minHeight: 110, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12, backgroundColor: '#f8fafc',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink900, fontFamily: 'Inter',
  },
  counter: { alignSelf: 'flex-end', color: C.ink400, fontSize: 12, fontFamily: 'Inter', marginTop: 4 },
  error: { color: '#b91c1c', fontSize: 13.5, fontFamily: 'Inter', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryBtn: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.ink500, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  primaryBtn: { flex: 1, minHeight: 44, backgroundColor: C.cyan700, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryContent: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryText: { color: C.white, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  disabled: { opacity: 0.6 },
});
