import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, type PortfolioEntry } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { requestAppPermission } from '../../../src/lib/permissions';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import PortfolioGallery from '../../../src/components/PortfolioGallery';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

export default function SPPortfolioScreen({ onBack }: { onBack: () => void }) {
  const { styles, C, V6Colors, appearance } = useThemedStyles(createThemedStyles);
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
    <View style={[styles.screen, { paddingTop: useHeaderTop() }]}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.action}>Back</Text>
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>My Portfolio</Text>
        <Text style={styles.text}>
          Publish up to 20 of your own work photos, at most 10 MB each.
          Signed-in clients can view them. Only upload photos you have
          permission to share.
        </Text>
        {(editing || (portfolio.data?.length ?? 0) < 20) && (
          <View style={styles.form}>
            {!editing && (
              <TouchableOpacity disabled={busy} onPress={() => void choose()}>
                <Text style={styles.action}>Choose portfolio photo</Text>
              </TouchableOpacity>
            )}
            {(uri || editing) && (
              <Image
                source={{ uri: uri ?? editing!.image_url }}
                style={{ height: 150, width: '100%' }}
                resizeMode="contain"
              />
            )}
            <Text style={styles.text}>Caption</Text>
            <TextInput keyboardAppearance={appearance}
              accessibilityLabel="Portfolio caption"
              style={styles.input}
              value={caption}
              onChangeText={setCaption}
              maxLength={400}
              multiline
              editable={!busy}
            />
            <Text style={styles.text}>Display order (lower numbers first)</Text>
            <TextInput keyboardAppearance={appearance}
              accessibilityLabel="Portfolio display order"
              style={styles.input}
              value={position}
              onChangeText={setPosition}
              keyboardType="number-pad"
              editable={!busy}
            />
            <Text style={styles.text}>Service (optional)</Text>
            {[
              { id: null, name: 'No service category' },
              ...(categories.data ?? []),
            ].map((item) => (
              <TouchableOpacity
                disabled={busy}
                key={item.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === item.id }}
                onPress={() => setCategory(item.id)}
              >
                <Text style={styles.action}>
                  {category === item.id ? '✓ ' : ''}
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
            {!!categories.error && (
              <Text style={styles.text}>{categories.error}</Text>
            )}
            <TouchableOpacity
              disabled={busy || portfolio.loading}
              onPress={() => void save()}
            >
              <Text style={styles.action}>
                {busy
                  ? 'Saving…'
                  : editing
                    ? 'Save photo details'
                    : 'Publish photo'}
              </Text>
            </TouchableOpacity>
            {editing && (
              <TouchableOpacity disabled={busy} onPress={reset}>
                <Text style={styles.action}>Cancel edit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={styles.text}>
            {error}
          </Text>
        )}
        {portfolio.loading && <ActivityIndicator color={V6Colors.link} />}
        {!!portfolio.error && (
          <View>
            <Text style={styles.text}>{portfolio.error}</Text>
            <TouchableOpacity onPress={portfolio.reload}>
              <Text style={styles.action}>Retry portfolio</Text>
            </TouchableOpacity>
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
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    heading: { color: C.ink900, fontSize: 22, fontWeight: '700' },
    text: { color: C.ink700, marginVertical: 8 },
    action: { color: V6Colors.link, padding: 10, fontWeight: '600' },
    form: { marginVertical: 16 },
    input: {
      backgroundColor: C.surface,
      color: C.ink900,
      borderWidth: 1,
      borderColor: C.line,
      padding: 12,
      borderRadius: 8,
    },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
