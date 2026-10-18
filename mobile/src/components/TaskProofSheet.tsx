import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import SheetFrame from './ui/SheetFrame';
import Tap from './ui/Tap';
import EvidencePhotoPicker from './EvidencePhotoPicker';

/** At most this many proof photos per task (job_tasks check, migration 0059). */
export const TASK_PROOF_MAX = 4;

/**
 * Asked before a task is ticked done: at least one photo showing it is done.
 * `onSubmit` uploads the photos and ticks the task; the sheet stays open,
 * locked, until it settles, and shows its error if it fails.
 */
export default function TaskProofSheet({
  taskLabel, onSubmit, onClose,
}: {
  /** The task being ticked, or null when the sheet is closed. */
  taskLabel: string | null;
  onSubmit: (photoUris: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { s, c } = useThemedStyles(createStyles);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (taskLabel !== null) {
      setPhotos([]);
      setError(null);
    }
  }, [taskLabel]);

  const ready = photos.length >= 1 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this task.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetFrame visible={taskLabel !== null} onClose={busy ? undefined : onClose} contentStyle={s.sheet}>
      <Text style={s.title} accessibilityRole="header">Show the finished task</Text>
      <View style={s.taskChip}>
        <Text style={s.task} numberOfLines={2}>{taskLabel}</Text>
      </View>
      <EvidencePhotoPicker
        testID="task-proof-picker"
        photos={photos}
        onChange={setPhotos}
        max={TASK_PROOF_MAX}
        min={1}
        disabled={busy}
      />
      {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
      <View style={s.footer}>
        {photos.length === 0 && <Text style={s.hint}>Add a photo to continue</Text>}
        <Tap
          style={[s.button, !ready && !busy && s.buttonOff]}
          disabled={!ready}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityLabel="Mark as done"
          accessibilityState={{ disabled: !ready, busy }}
        >
          {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={[s.buttonText, !ready && s.buttonTextOff]}>Mark as done</Text>}
        </Tap>
      </View>
    </SheetFrame>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    sheet: { gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
    title: { color: V6Colors.ink900, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },
    taskChip: {
      alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: V6Colors.ink100,
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: -8,
    },
    task: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    footer: { gap: 8 },
    hint: { color: V6Colors.ink500, fontSize: 13, textAlign: 'center', fontFamily: 'Inter' },
    error: { color: Colors.dangerText, fontSize: 14, fontFamily: 'Inter' },
    button: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch' },
    buttonOff: { backgroundColor: V6Colors.line },
    buttonText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    buttonTextOff: { color: V6Colors.ink500 },
  }),
  c: { onPrimary: Colors.onPrimary },
});
