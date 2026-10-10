/**
 * HOLeaveReviewScreen.tsx
 *
 * Figma "Rate your provider": five stars with a word under them, quick tags
 * for what went well, an optional comment, a note that the review is public,
 * and the Submit review bar pinned at the bottom. A chosen tag is written in
 * front of the comment (see reviewComment.ts), so the API call is unchanged.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import Silhouette from '../../../src/components/ui/Silhouette';
import Banner from '../../../src/components/ui/Banner';
import FilterPill from '../../../src/components/ui/FilterPill';
import TextField from '../../../src/components/ui/TextField';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import { ArrowLeft, Star } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import {
  REVIEW_TAGS,
  orderedTags,
  reviewCommentFor,
  reviewCommentLimit,
} from '../../../src/lib/reviewComment';

import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';

interface HOLeaveReviewScreenProps {
  jobId: string;
  onSubmitted: () => void;
  onBack?: () => void;
}

const RATING_WORDS: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

export default function HOLeaveReviewScreen({ jobId, onSubmitted, onBack }: HOLeaveReviewScreenProps) {
  const { C, styles, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [rating, setRating] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job } = useAsyncData(
    useCallback(() => api.getJob(jobId), [jobId]),
  );
  const providerName = job?.assigned_provider?.full_name ?? 'Provider';
  const jobLine = [job?.service_categories?.name, job?.title].filter(Boolean).join(': ');
  const alreadyReviewed = job?.has_review === true;
  const chosenTags = orderedTags(tags);

  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    // A tag in front of the comment leaves it less room, so trim what no longer fits.
    setComment((text) => text.slice(0, reviewCommentLimit(orderedTags(next))));
  };

  const submit = async () => {
    if (alreadyReviewed) {
      setError('You have already submitted a review for this job.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.reviewJob(jobId, { rating, comment: reviewCommentFor(chosenTags, comment) });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header — flat white with the icon back button used on every other screen. */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {onBack && (
          <Tap
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.8}
            hitSlop={5}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={C.ink700} />
          </Tap>
        )}
        <Text style={styles.headerTitle}>Rate your provider</Text>
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
          {!!jobLine && <Text style={styles.jobLine}>{jobLine}</Text>}

          <View style={styles.starPicker}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Tap
                key={n}
                onPress={() => setRating(n)}
                activeOpacity={0.85}
                style={styles.starBtn}
                borderlessRipple
                // The 46 dp star button plus 1 dp around it reaches the 48 dp touch area.
                hitSlop={1}
                // The five stars are one choice: a radio group, read as "Rate 4 out of 5 stars, checked".
                accessibilityRole="radio"
                accessibilityLabel={`Rate ${n} out of 5 stars`}
                accessibilityState={{ checked: n === rating, selected: n <= rating }}
              >
                <Star size={38} color={n <= rating ? '#f59e0b' : '#cbd5e1'} fill={n <= rating ? '#f59e0b' : 'none'} />
              </Tap>
            ))}
          </View>
          {/* Stars start empty so the rating is always the user's own choice. */}
          <Text style={[styles.ratingWord, rating === 0 && styles.ratingHint]}>
            {rating === 0 ? 'Tap a star to rate' : RATING_WORDS[rating]}
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What went well?</Text>
            <View style={styles.tagRow}>
              {REVIEW_TAGS.map((tag) => (
                <FilterPill key={tag} label={tag} selected={tags.includes(tag)} onPress={() => toggleTag(tag)} />
              ))}
            </View>
          </View>

          <TextField
            label="Add a comment (optional)"
            value={comment}
            onChangeText={setComment}
            placeholder="Tell others about the job"
            multiline
            maxLength={reviewCommentLimit(chosenTags)}
            keyboardAppearance={appearance}
          />

          <Banner tone="info" message="Your review is public." />

          {alreadyReviewed && (
            <Text style={styles.alreadyReviewedText}>You already submitted a review for this job.</Text>
          )}
          {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
        </ScrollView>

        <BottomActionBar
          primaryLabel="Submit review"
          onPrimary={() => void submit()}
          primaryDisabled={rating === 0 || alreadyReviewed}
          busy={busy}
        />
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

    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 24, gap: 16 },

    avatar: {
      alignSelf: 'center', width: 80, height: 80, borderRadius: 40,
      backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: C.primaryDeep, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
    providerName: { alignSelf: 'center', color: C.ink900, fontSize: 18, fontWeight: '700', fontFamily: 'Inter', marginTop: -8 },
    jobLine: { alignSelf: 'center', color: C.ink500, fontSize: 13, fontFamily: 'Inter', marginTop: -10 },

    starPicker: { alignSelf: 'center', flexDirection: 'row', gap: 6, paddingVertical: 4 },
    starBtn: { padding: 4, borderRadius: 24 },
    ratingWord: { alignSelf: 'center', color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginTop: -8 },
    ratingHint: { color: C.ink500, fontWeight: '600' },

    section: { gap: 8 },
    sectionLabel: { color: C.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    errorText: { color: V6Colors.dangerText, fontFamily: 'Inter', fontSize: 14, lineHeight: 20 },
    alreadyReviewedText: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
