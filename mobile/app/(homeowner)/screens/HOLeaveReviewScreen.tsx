/**
 * HOLeaveReviewScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-rating screen — a flat
 * white .topbar (not a dark hero, and using the same icon back-button as
 * every other screen instead of a text "← Back" link), a centered provider
 * avatar/name, an amber .star-picker (the mockup's active star color is
 * amber, not teal), and a flat .field-style textarea.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import Silhouette from '../../../src/components/ui/Silhouette';
import { ArrowLeft, Star } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';

interface HOLeaveReviewScreenProps {
  jobId: string;
  onSubmitted: () => void;
  onBack?: () => void;
}

const RATING_WORDS: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

export default function HOLeaveReviewScreen({ jobId, onSubmitted, onBack }: HOLeaveReviewScreenProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job } = useAsyncData(
    useCallback(() => api.getJob(jobId), [jobId]),
  );
  const providerName = job?.assigned_provider?.full_name ?? 'Provider';
  const alreadyReviewed = job?.has_review === true;

  const submit = async () => {
    if (alreadyReviewed) {
      setError('You have already submitted a review for this job.');
      return;
    }
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {onBack && (
          <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={C.ink700} />
          </Tap>
        )}
        <Text style={styles.headerTitle}>Rate Your Provider</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          <View style={styles.avatar}>
            <Silhouette name={providerName} textStyle={styles.avatarText} />
          </View>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.prompt}>How was your experience?</Text>

          <View style={styles.starPicker}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Tap
                key={n}
                onPress={() => setRating(n)}
                activeOpacity={0.85}
                style={styles.starBtn}
                borderlessRipple
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                accessibilityState={{ selected: n <= rating }}
              >
                <Star size={33} color={n <= rating ? '#f59e0b' : '#cbd5e1'} fill={n <= rating ? '#f59e0b' : 'none'} />
              </Tap>
            ))}
          </View>
          {/* Stars start empty so the rating is always the user's own choice. */}
          <Text style={[styles.ratingLabel, rating === 0 && styles.ratingHint]}>
            {rating === 0 ? 'Tap a star to rate' : `${rating} of 5 · ${RATING_WORDS[rating]}`}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Write a review</Text>
            <TextInput keyboardAppearance={appearance}
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

          {alreadyReviewed && (
            <Text style={styles.alreadyReviewedText}>You already submitted a review for this job.</Text>
          )}
          {error && <Text style={styles.errorText}>{error}</Text>}

          <Tap
            style={[styles.submitBtn, (busy || alreadyReviewed) && styles.disabled, rating === 0 && styles.submitBtnEmpty]}
            onPress={submit}
            disabled={busy || alreadyReviewed || rating === 0}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color={C.onPrimary} /> : <Text style={[styles.submitText, rating === 0 && styles.submitTextEmpty]}>Submit Review</Text>}
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 22, paddingBottom: 24, alignItems: 'center' },

    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
    avatarText: { color: C.primaryDeep, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
    providerName: { color: C.ink900, fontSize: 19.5, fontWeight: '700', fontFamily: 'Inter' },
    prompt: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginTop: 5 },

    starPicker: { flexDirection: 'row', gap: 9, paddingVertical: 18 },
    starBtn: { padding: 6, borderRadius: 24 },
    ratingLabel: { color: C.ink700, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center', marginTop: 4, marginBottom: 8 },

    fieldGroup: { width: '100%', marginTop: 4 },
    fieldLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
    input: {
      width: '100%',
      borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 12,
      padding: 14, minHeight: 90, fontSize: 16, fontFamily: 'Inter', color: C.ink900,
      backgroundColor: C.surface,
    },

    submitBtn: {
      width: '100%', backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14,
      alignItems: 'center', marginTop: 18, ...V6Shadows.primaryButton,
    },
    submitText: { color: C.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },

    disabled: { opacity: 0.6 },
    // No rating picked yet: grey fill with dark text, like the other disabled buttons.
    submitBtnEmpty: { backgroundColor: C.ink100, shadowOpacity: 0, elevation: 0 },
    submitTextEmpty: { color: C.ink700 },
    ratingHint: { color: C.ink500, fontWeight: '600' },

    errorText: { color: V6Colors.dangerText, marginTop: 8, fontFamily: 'Inter', fontSize: 15 },
    alreadyReviewedText: { color: V6Colors.link, marginTop: 8, fontFamily: 'Inter', fontSize: 15, textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
