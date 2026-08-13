/**
 * HOLeaveReviewScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-rating screen — a flat
 * white .topbar (not a dark hero, and using the same icon back-button as
 * every other screen instead of a text "← Back" link), a centered provider
 * avatar/name, an amber .star-picker (the mockup's active star color is
 * amber, not teal), and a flat .field-style textarea.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, Star } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { initials } from '../../../src/lib/format';

interface HOLeaveReviewScreenProps {
  jobId: string;
  onSubmitted: () => void;
  onBack?: () => void;
}

export default function HOLeaveReviewScreen({ jobId, onSubmitted, onBack }: HOLeaveReviewScreenProps) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job } = useAsyncData(
    useCallback(() => api.getJob(jobId), [jobId]),
  );
  const providerName = job?.assigned_provider?.full_name ?? 'Provider';

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.reviewJob(jobId, { rating, comment: comment || undefined });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, icon back button) */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={C.ink700} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Rate Your Provider</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(providerName)}</Text>
          </View>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.prompt}>How was your experience?</Text>

          <View style={styles.starPicker}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(n)}
                activeOpacity={0.85}
                style={styles.starBtn}
              >
                <Star size={33} color={n <= rating ? '#f59e0b' : '#cbd5e1'} fill={n <= rating ? '#f59e0b' : 'none'} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Write a review</Text>
            <TextInput
              style={styles.input}
              value={comment}
              onChangeText={setComment}
              placeholder="Share what went well or what could improve…"
              placeholderTextColor={C.ink400}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, busy && styles.disabled]}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.submitText}>Submit Review</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 22, paddingBottom: 24, alignItems: 'center' },

  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: C.white, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
  providerName: { color: C.ink900, fontSize: 19.5, fontWeight: '700', fontFamily: 'Inter' },
  prompt: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginTop: 5 },

  starPicker: { flexDirection: 'row', gap: 9, paddingVertical: 18 },
  starBtn: { padding: 3 },

  fieldGroup: { width: '100%', marginTop: 4 },
  fieldLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
  input: {
    width: '100%',
    borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12,
    padding: 14, minHeight: 90, fontSize: 16, fontFamily: 'Inter', color: C.ink900,
    backgroundColor: C.white,
  },

  submitBtn: {
    width: '100%', backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14,
    alignItems: 'center', marginTop: 18, ...V6Shadows.primaryButton,
  },
  submitText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },

  disabled: { opacity: 0.6 },

  errorText: { color: '#ef4444', marginTop: 8, fontFamily: 'Inter', fontSize: 15 },
});
