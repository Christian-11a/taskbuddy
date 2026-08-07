/**
 * HOLeaveReviewScreen.tsx
 *
 * Small screen to leave a review for a job: rating (1-5) + comment.
 * Calls `api.reviewJob(jobId, { rating, comment })` and invokes `onSubmitted` on success.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Star } from 'lucide-react-native';
import { Colors, Radii, Shadows, Spacing } from '../../../src/constants/theme';
import { api } from '../../../src/lib/api';

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
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.screen}
    >
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>Leave a Review</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rating</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(n)}
                activeOpacity={0.85}
                style={styles.starBtn}
              >
                <Star size={28} color={n <= rating ? Colors.brandTeal : Colors.slate} fill={n <= rating ? Colors.brandTeal : undefined} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.cardTitle, { marginTop: 12 }]}>Comment</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Tell others about your experience (optional)"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, busy && styles.disabled]}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Submit Review</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { paddingVertical: 6, paddingRight: 8 },
  backText: { color: Colors.brandDark, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
  headerTitle: { color: Colors.brandDark, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1, paddingHorizontal: Spacing.screenH },

  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 16, marginTop: 8, ...Shadows.card },

  cardTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },

  ratingRow: { flexDirection: 'row', marginTop: 12, gap: 8 },

  starBtn: { padding: 4 },

  input: {
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.15)', borderRadius: 12,
    marginTop: 10, padding: 12, minHeight: 90, fontSize: 14, fontFamily: 'Inter', color: Colors.brandDark,
  },

  submitBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 14,
  },
  submitText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

  disabled: { opacity: 0.6 },

  errorText: { color: Colors.error, marginTop: 8 },
});
