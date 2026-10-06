import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Check, ImagePlus } from 'lucide-react-native';
import { api, type PortfolioEntry } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { requestAppPermission } from '../../../src/lib/permissions';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import PortfolioGallery from '../../../src/components/PortfolioGallery';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

export default function SPPortfolioScreen({ onBack }: { onBack: () => void }) {
  const { styles, C, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const portfolio = useAsyncData(() => api.myPortfolio(), []);
  const categories = useAsyncData(() => api.categories(), []);
  useRefreshOnForeground(portfolio.reload, true);
  const [uri, setUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [position, setPosition] = useState('0');
  const [category, setCategory] = useState<number | null>(null);
  const [editing, setEditing] = useState<PortfolioEntry | null>(null);
  const [removing, setRemoving] = useState<PortfolioEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setUri(null);
    setCaption('');
    setPosition('0');
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
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setError('Choose a photo no larger than 10 MB.');
          return;
        }
        setUri(asset.uri);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };
  const save = async () => {
    const order = Number(position);
    if (
      !caption.trim() ||
      (!editing && !uri) ||
      !position.trim() ||
      !Number.isInteger(order) ||
      order < 0 ||
      order > 10000
    ) {
      setError(
        'Choose a photo, add a caption and enter an order from 0 to 10000.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const details = {
        caption: caption.trim(),
        position: order,
        category_id: category,
      };
      if (editing) await api.updatePortfolio(editing.id, details);
      else {
        const image_path = await api.uploadImage('provider-portfolio', uri!);
        await api.createPortfolio({ ...details, image_path });
      }
      reset();
      portfolio.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this photo.');
    } finally {
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
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle}>My Portfolio</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Publish up to 20 of your own work photos, at most 10 MB each.
          Signed-in clients can view them. Only upload photos you have
          permission to share.
        </Text>
        {(editing || (portfolio.data?.length ?? 0) < 20) && (
          <View style={styles.form}>
            {!editing && !uri && (
              <Tap disabled={busy} onPress={() => void choose()} style={styles.pickBox} accessibilityRole="button">
                <ImagePlus size={28} color={C.link} />
                <Text style={styles.pickText}>Choose portfolio photo</Text>
              </Tap>
            )}
            {(uri || editing) && (
              <Image
                source={{ uri: uri ?? editing!.image_url }}
                style={styles.preview}
                resizeMode="cover"
              />
            )}
            {!editing && !!uri && (
              <Tap disabled={busy} onPress={() => void choose()} style={styles.linkBtn} accessibilityRole="button">
                <Text style={styles.link}>Choose portfolio photo</Text>
              </Tap>
            )}
            <Text style={styles.label}>Caption</Text>
            <TextInput keyboardAppearance={appearance}
              accessibilityLabel="Portfolio caption"
              style={[styles.input, styles.inputMulti]}
              value={caption}
              onChangeText={setCaption}
              maxLength={400}
              multiline
              editable={!busy}
            />
            <Text style={styles.label}>Display order (lower numbers first)</Text>
            <TextInput keyboardAppearance={appearance}
              accessibilityLabel="Portfolio display order"
              style={styles.input}
              value={position}
              onChangeText={setPosition}
              keyboardType="number-pad"
              editable={!busy}
            />
            <Text style={styles.label}>Service (optional)</Text>
            <View style={styles.chips}>
              {[
                { id: null, name: 'No service category' },
                ...(categories.data ?? []),
              ].map((item) => {
                const selected = category === item.id;
                return (
                  <Tap
                    disabled={busy}
                    key={item.id ?? 'none'}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(item.id)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    {selected && <Check size={14} color={C.chipActiveText} strokeWidth={3} />}
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {item.name}
                    </Text>
                  </Tap>
                );
              })}
            </View>
            {!!categories.error && (
              <Text style={styles.errorText}>{categories.error}</Text>
            )}
            <Tap
              disabled={busy || portfolio.loading}
              onPress={() => void save()}
              style={[styles.primaryBtn, (busy || portfolio.loading) && styles.primaryBtnDisabled]}
              accessibilityRole="button"
              scale
            >
              <Text style={styles.primaryBtnText}>
                {busy
                  ? 'Saving…'
                  : editing
                    ? 'Save photo details'
                    : 'Publish photo'}
              </Text>
            </Tap>
            {editing && (
              <Tap disabled={busy} onPress={reset} style={styles.secondaryBtn} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Cancel edit</Text>
              </Tap>
            )}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        )}
        {portfolio.loading && <ContentSkeleton variant="list" />}
        {!!portfolio.error && (
          <View>
            <Text style={styles.errorText}>{portfolio.error}</Text>
            <Tap onPress={portfolio.reload} style={styles.linkBtn} accessibilityRole="button">
              <Text style={styles.link}>Retry portfolio</Text>
            </Tap>
          </View>
        )}
        {!portfolio.loading && !portfolio.error && (
          <PortfolioGallery
            entries={portfolio.data ?? []}
            busy={busy}
            onEdit={(entry) => {
              setEditing(entry);
              setUri(null);
              setCaption(entry.caption);
              setPosition(String(entry.position));
              setCategory(entry.category_id);
            }}
            onRemove={setRemoving}
          />
        )}
      </ScrollView>
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
  const chipActiveText = theme.appearance === 'dark' ? '#e0f2fe' : '#0c4a6e';
  const C = { ...V6Colors, chipActiveText };
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: C.line,
    },
    backBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    content: { padding: 20, paddingBottom: 32 },
    intro: { color: C.ink500, fontSize: 14.5, lineHeight: 21, fontFamily: 'Inter' },
    form: {
      marginVertical: 18, padding: 16, gap: 4,
      backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line,
    },
    pickBox: {
      alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 132,
      borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primaryTonalStrong,
      backgroundColor: C.primaryTonal, marginBottom: 8,
    },
    pickText: { color: C.link, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    preview: { height: 180, width: '100%', borderRadius: 16, backgroundColor: C.ink100, marginBottom: 4 },
    label: { color: C.ink700, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginTop: 12, marginBottom: 6 },
    input: {
      backgroundColor: C.surface, color: C.ink900, fontFamily: 'Inter', fontSize: 15,
      borderWidth: 1, borderColor: C.fieldBorder, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    },
    inputMulti: { minHeight: 88, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
      borderRadius: 12, paddingHorizontal: 14, minHeight: 40,
    },
    chipActive: { backgroundColor: C.primaryTonalStrong, borderColor: C.primaryTonalStrong },
    chipText: { color: C.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    chipTextActive: { color: chipActiveText, fontWeight: '700' },
    primaryBtn: {
      backgroundColor: C.primary, borderRadius: 16, minHeight: 52, marginTop: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    primaryBtnDisabled: { opacity: 0.6 },
    primaryBtnText: { color: C.onPrimary, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    secondaryBtn: {
      borderWidth: 1, borderColor: C.fieldBorder, borderRadius: 16, minHeight: 48, marginTop: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    secondaryBtnText: { color: C.ink800, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    linkBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
    link: { color: C.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    errorText: { color: C.dangerText, fontSize: 14, fontFamily: 'Inter', marginVertical: 8 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
