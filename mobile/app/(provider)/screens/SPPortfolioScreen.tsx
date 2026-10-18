import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import RefreshBar from '../../../src/components/ui/RefreshBar';
import Banner from '../../../src/components/ui/Banner';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import TextField from '../../../src/components/ui/TextField';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Check, CircleAlert, ImagePlus } from 'lucide-react-native';
import { api, type PortfolioEntry, type ProviderProfile } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { requestAppPermission } from '../../../src/lib/permissions';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import PortfolioGallery from '../../../src/components/PortfolioGallery';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { cleanText, textLength, textUnits } from '../../../src/lib/textRules';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';
import { EXAMPLES_BELOW, portfolioExamples } from '../../../src/lib/portfolioExamples';

/** Most photos one portfolio holds: the `limit_provider_portfolio` trigger (migration 0044). */
export const PORTFOLIO_LIMIT = 20;
/** Largest photo accepted: the `provider-portfolio` bucket's `file_size_limit` (migration 0044). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Longest caption: the `caption` check on `provider_portfolio` (1 to 400 characters). */
export const CAPTION_MAX = 400;
/**
 * Highest `position` the API accepts: `PortfolioDetailsDto` and the
 * `provider_portfolio` position check (0 to 10000).
 */
export const PORTFOLIO_POSITION_MAX = 10000;

const PHOTO_TIPS = ['Your own work only', 'No client faces or house numbers', 'Good light'];

export function portfolioIsFull(count: number): boolean {
  return count >= PORTFOLIO_LIMIT;
}

/**
 * Where a new photo goes: after the highest position already in the portfolio,
 * so it lands at the end of the list. An empty portfolio starts at 0. Past the
 * cap, photos share the last position and are ordered by upload time.
 */
export function nextPortfolioPosition(entries: ReadonlyArray<{ position: number }>): number {
  if (entries.length === 0) return 0;
  const highest = Math.max(...entries.map((entry) => entry.position));
  return Math.min(highest + 1, PORTFOLIO_POSITION_MAX);
}

/**
 * The services a provider may file a photo under: the main one, then each approved
 * secondary service, with no service listed twice. Nothing else is offered.
 */
export function portfolioServices(
  provider: Pick<ProviderProfile, 'category_id' | 'service_categories' | 'approved_secondary_services'> | null | undefined,
): { id: number; name: string }[] {
  if (!provider) return [];
  const services: { id: number; name: string }[] = [];
  if (provider.service_categories) services.push({ id: provider.category_id, name: provider.service_categories.name });
  for (const service of provider.approved_secondary_services ?? []) {
    services.push({ id: service.category_id, name: service.service_categories.name });
  }
  return services.filter((service, index) => services.findIndex((other) => other.id === service.id) === index);
}

/** The details sent with a photo: caption, position and service, in the shape the API takes. */
export function portfolioDetails(input: { caption: string; categoryId: number | null; position: number }) {
  return {
    caption: cleanText(input.caption),
    position: input.position,
    category_id: input.categoryId,
  };
}

/**
 * The first thing missing from a publish, or null when it can go ahead. A caption
 * of only spaces is no caption, and the cleaned caption must fit the API's 400.
 */
export function publishProblem(input: { caption: string; hasPhoto: boolean; editing: boolean }): string | null {
  if (!input.editing && !input.hasPhoto) return 'Choose a photo to publish.';
  if (textLength(input.caption) === 0) return 'Add a caption to publish this photo.';
  if (textUnits(input.caption) > CAPTION_MAX) return `Shorten the caption to ${CAPTION_MAX} characters or fewer.`;
  return null;
}

export type PortfolioField = 'photo' | 'caption';
const FIELD_ORDER: readonly PortfolioField[] = ['photo', 'caption'];

/** Per-field messages for a publish, shown under each field. */
export function publishErrors(input: { caption: string; hasPhoto: boolean; editing: boolean }): Partial<Record<PortfolioField, string>> {
  const errors: Partial<Record<PortfolioField, string>> = {};
  if (!input.editing && !input.hasPhoto) errors.photo = 'Choose a photo to publish.';
  if (textLength(input.caption) === 0) errors.caption = 'Add a caption to publish this photo.';
  else if (textUnits(input.caption) > CAPTION_MAX) errors.caption = `Shorten the caption to ${CAPTION_MAX} characters or fewer.`;
  return errors;
}

export type PublishStage = 'uploading' | 'saving';
export type SegmentState = 'done' | 'active' | 'todo';

/**
 * The label and step bar for a publish in progress. A new photo uploads and
 * then saves; an edit only saves. Each stage is a real call, not a guess.
 */
export function publishProgress(stage: PublishStage, editing: boolean): { label: string; segments: SegmentState[] } {
  if (editing) return { label: 'Saving changes…', segments: ['active'] };
  if (stage === 'uploading') return { label: 'Uploading photo…', segments: ['active', 'todo'] };
  return { label: 'Saving to your portfolio…', segments: ['done', 'active'] };
}

export default function SPPortfolioScreen({ onBack }: { onBack: () => void }) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const portfolio = useAsyncData(() => api.myPortfolio(), []);
  const { providerProfile } = useAuth();
  const services = portfolioServices(providerProfile);
  useRefreshOnForeground(portfolio.reload, true);
  const [uri, setUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [editing, setEditing] = useState<PortfolioEntry | null>(null);
  // A new photo starts on the provider's first service; an edit keeps the entry's own category, even one not listed.
  const selectedCategory = editing ? category : (category ?? services[0]?.id ?? null);
  const [removing, setRemoving] = useState<PortfolioEntry | null>(null);
  const [stage, setStage] = useState<PublishStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PortfolioField, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [published, setPublished] = useState(false);
  const { scrollRef, fieldLayout, inputRef, scrollToFirstError } = useScrollToFirstError(FIELD_ORDER);
  const reset = () => {
    setUri(null);
    setCaption('');
    setCategory(null);
    setEditing(null);
  };
  const choose = async () => {
    setError(null);
    try {
      if (!(await requestAppPermission('gallery'))) {
        setError('Photo library access is required to choose a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) {
          setError('Choose a photo no larger than 10 MB.');
          return;
        }
        setUri(asset.uri);
        setFieldErrors((previous) => ({ ...previous, photo: undefined }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };
  const save = async () => {
    setPublished(false);
    const errors = publishErrors({ caption, hasPhoto: !!uri, editing: !!editing });
    setSubmitted(true);
    setFieldErrors(errors);
    if (errors.photo || errors.caption) {
      scrollToFirstError(errors);
      return;
    }
    // A new photo needs the loaded list to know which position puts it last.
    if (!editing && !portfolio.data) {
      setError('Your portfolio has not loaded yet. Try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const details = portfolioDetails({
        caption,
        categoryId: selectedCategory,
        position: editing ? editing.position : nextPortfolioPosition(portfolio.data ?? []),
      });
      if (editing) {
        setStage('saving');
        await api.updatePortfolio(editing.id, details);
      } else {
        setStage('uploading');
        const image_path = await api.uploadImage('provider-portfolio', uri!);
        setStage('saving');
        await api.createPortfolio({ ...details, image_path });
      }
      reset();
      setSubmitted(false);
      setFieldErrors({});
      setPublished(true);
      portfolio.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this photo.');
    } finally {
      setStage(null);
      setBusy(false);
    }
  };
  const remove = async () => {
    const entry = removing!;
    setRemoving(null);
    setBusy(true);
    setError(null);
    try {
      await api.removePortfolio(entry.id);
      if (editing?.id === entry.id) reset();
      portfolio.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this photo.');
    } finally {
      setBusy(false);
    }
  };

  const count = portfolio.data?.length ?? 0;
  // A full portfolio can still edit an existing photo, but cannot add one.
  const showForm = !!editing || !portfolioIsFull(count);
  const progress = stage ? publishProgress(stage, !!editing) : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">My Portfolio</Text>
      </View>
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {portfolio.loading && !!portfolio.data && <RefreshBar />}
        <Text style={styles.intro}>
          {`Up to ${PORTFOLIO_LIMIT} photos, ${PHOTO_MAX_BYTES / (1024 * 1024)} MB each (JPEG, PNG or WebP). Signed-in clients can see them.`}
        </Text>

        {!showForm && (
          <Banner
            tone="info"
            message={`Your portfolio is full: ${count} of ${PORTFOLIO_LIMIT} photos. Remove one to add another.`}
          />
        )}

        {showForm && (
          <>
            <View onLayout={fieldLayout('photo')} style={styles.fieldBlock}>
            {!editing && !uri && (
              <Tap
                disabled={busy}
                onPress={() => void choose()}
                style={styles.pickTile}
                accessibilityRole="button"
                accessibilityLabel="Choose portfolio photo"
              >
                <ImagePlus size={28} color={Colors.link} />
                <Text style={styles.pickText}>Choose portfolio photo</Text>
              </Tap>
            )}
            {(uri || editing) && (
              <Image
                accessible
                accessibilityLabel="Selected portfolio photo"
                source={{ uri: uri ?? editing!.image_url }}
                style={styles.preview}
                resizeMode="contain"
              />
            )}
            {!editing && !!uri && (
              <Tap
                disabled={busy}
                onPress={() => void choose()}
                style={styles.linkBtn}
                accessibilityRole="button"
                accessibilityLabel="Choose portfolio photo"
              >
                <Text style={styles.link}>Choose portfolio photo</Text>
              </Tap>
            )}
            {!!fieldErrors.photo && (
              <View style={styles.errorRow}>
                <CircleAlert size={14} color={Colors.dangerText} />
                <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.photo}</Text>
              </View>
            )}
            </View>

            <View onLayout={fieldLayout('caption')}>
            <TextField
              ref={inputRef('caption')}
              error={fieldErrors.caption}
              submitted={submitted}
              label="Caption"
              value={caption}
              onChangeText={(text) => { setCaption(text); if (fieldErrors.caption) setFieldErrors((previous) => ({ ...previous, caption: undefined })); }}
              helper="Shown under the photo"
              multiline
              maxLength={CAPTION_MAX}
              counter={`${caption.length} / ${CAPTION_MAX}`}
              editable={!busy}
              keyboardAppearance={appearance}
            />
            </View>

            {/* One service is said in words; several are picked from, and only the provider's own are offered. */}
            {services.length === 1 && <Text style={styles.label}>{`Service: ${services[0].name}`}</Text>}
            {services.length > 1 && (
              <>
                <Text style={styles.label}>Service</Text>
                <View style={styles.chips}>
                  {services.map((item) => {
                    const selected = selectedCategory === item.id;
                    return (
                      <Tap
                        disabled={busy}
                        key={item.id}
                        accessibilityRole="radio"
                        accessibilityLabel={item.name}
                        accessibilityState={{ selected, disabled: busy }}
                        hitSlop={{ top: 4, bottom: 4 }}
                        onPress={() => setCategory(item.id)}
                        style={[styles.chip, selected && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                          {item.name}
                        </Text>
                      </Tap>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.tips}>
              {PHOTO_TIPS.map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <Check size={16} color={V6Colors.ink700} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {!!error && (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        )}
        {published && (
          <View style={styles.publishedRow} testID="published-confirmation">
            <Check size={16} color={Colors.primary} />
            <Text accessibilityLiveRegion="polite" style={styles.publishedText}>Published</Text>
          </View>
        )}
        {portfolio.data !== null && portfolio.data.length < EXAMPLES_BELOW && (
          <View style={styles.examples} testID="portfolio-examples">
            <Text style={styles.label} accessibilityRole="header">Ideas for your first photos</Text>
            {portfolioExamples(services).map((example) => {
              const Icon = example.icon;
              return (
                <View key={example.key} style={styles.exampleCard} testID="portfolio-example">
                  <View style={styles.exampleIcon}><Icon size={22} color={Colors.link} /></View>
                  <View style={styles.exampleText}>
                    <Text style={styles.exampleBadge}>Example</Text>
                    <Text style={styles.tipText}>{example.tip}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {/* Skeletons stand in only for a portfolio not loaded yet. A refresh keeps the gallery under a bar, and a failed one keeps it under the error. */}
        {portfolio.loading && !portfolio.data && <ContentSkeleton variant="list" />}
        {!!portfolio.error && (
          <LoadErrorCard title="Couldn't load your portfolio" message={portfolio.error} onRetry={portfolio.reload} />
        )}
        {portfolio.data !== null && (
          <PortfolioGallery
            entries={portfolio.data ?? []}
            busy={busy}
            emptyBody="Add a photo of finished work so clients can see what you do."
            onEdit={(entry) => {
              setPublished(false);
              setFieldErrors({});
              setSubmitted(false);
              scrollRef.current?.scrollTo({ y: 0, animated: true });
              setEditing(entry);
              setUri(null);
              setCaption(entry.caption);
              setCategory(entry.category_id);
            }}
            onRemove={setRemoving}
          />
        )}
      </KeyboardAwareScrollView>

      {showForm && (
        <>
          {progress && (
            <View style={styles.progress}>
              <Text style={styles.progressLabel} accessibilityLiveRegion="polite">
                {progress.label}
              </Text>
              <View style={styles.segments}>
                {progress.segments.map((segment, index) => (
                  <View
                    key={index}
                    style={[
                      styles.segment,
                      segment === 'done' && styles.segmentDone,
                      segment === 'active' && styles.segmentActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
          <BottomActionBar
            primaryLabel={progress ? progress.label : editing ? 'Save photo details' : 'Publish photo'}
            onPrimary={() => void save()}
            busy={stage !== null}
            primaryDisabled={busy || portfolio.loading || (!editing && !portfolio.data)}
            secondaryLabel={editing ? 'Cancel edit' : undefined}
            onSecondary={reset}
          />
        </>
      )}

      <ConfirmationModal
        visible={removing !== null}
        title="Remove portfolio photo?"
        message="This removes the photo from your published portfolio."
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

    pickTile: {
      alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 160,
      borderRadius: 16, backgroundColor: Colors.primaryTonal,
    },
    pickText: { color: Colors.link, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    preview: { height: 180, width: '100%', borderRadius: 16, backgroundColor: V6Colors.ink100 },
    linkBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
    link: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },

    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    chipTextOn: { color: Colors.onPrimary, fontWeight: '700' },

    tips: {
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      borderRadius: 16, padding: 14, gap: 10,
    },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tipText: { flex: 1, color: V6Colors.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },

    progress: {
      gap: 8, paddingHorizontal: 20, paddingTop: 12,
      backgroundColor: V6Colors.surface, borderTopWidth: 1, borderTopColor: V6Colors.line,
    },
    progressLabel: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    segments: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: V6Colors.line },
    segmentDone: { backgroundColor: Colors.primary },
    segmentActive: { backgroundColor: Colors.link },

    fieldBlock: { gap: 8 },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    publishedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    publishedText: { color: Colors.primary, fontSize: 14, fontWeight: '700', lineHeight: 20, fontFamily: 'Inter' },
    examples: { gap: 10 },
    exampleCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderStyle: 'dashed', borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    exampleIcon: {
      width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center',
    },
    exampleText: { flex: 1, gap: 2 },
    exampleBadge: { color: V6Colors.ink500, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
