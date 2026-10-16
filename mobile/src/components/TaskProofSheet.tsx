import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
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
      <Text style={s.title} accessibilityRole="header">Proof the task is done</Text>
      <Text style={s.task}>{taskLabel}</Text>
      <EvidencePhotoPicker
        testID="task-proof-picker"
        photos={photos}
        onChange={setPhotos}
        max={TASK_PROOF_MAX}
        label="Photos (required)"
        helper="Add at least one photo of the finished task. The client sees it."
        disabled={busy}
      />
      {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
      <Tap
        style={[s.button, !ready && s.buttonOff]}
        disabled={!ready}
        onPress={() => void submit()}
        accessibilityRole="button"
        accessibilityLabel="Mark as done"
        accessibilityState={{ disabled: !ready }}
      >
        {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={[s.buttonText, !ready && s.buttonTextOff]}>Mark as done</Text>}
      </Tap>
    </SheetFrame>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    sheet: { gap: 12 },
    title: { color: V6Colors.ink900, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
    task: { color: V6Colors.ink700, fontSize: 15, fontFamily: 'Inter' },
    error: { color: Colors.dangerText, fontSize: 14, fontFamily: 'Inter' },
    button: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    buttonOff: { backgroundColor: V6Colors.line },
    buttonText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    buttonTextOff: { color: V6Colors.ink500 },
  }),
  c: { onPrimary: Colors.onPrimary },
});
