import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Check, FileText } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type PhotoCardProps = {
  /** Shown under the photo, e.g. "Front" or "Selfie". */
  title: string;
  /** The photo. Without one the card shows a placeholder, e.g. for a certificate sent in an earlier session. */
  uri?: string | null;
  /** Status under the title, e.g. "Sent for review". */
  note?: string;
  /** The button's visible text. Defaults to "Retake". */
  actionLabel?: string;
  /** Read by screen readers on the action button, e.g. "Retake selfie". The action shows only with `onRetake`. */
  retakeLabel?: string;
  onRetake?: () => void;
};

/** A photo the provider has added: the photo, a tick with its name, and a Retake button. */
export default function PhotoCard({ title, uri, note, actionLabel = 'Retake', retakeLabel, onRetake }: PhotoCardProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.card}>
      <View style={s.frame}>
        {uri ? (
          <Image source={{ uri }} style={s.image} resizeMode="cover" accessibilityLabel={`${title} photo`} />
        ) : (
          <View style={s.placeholder} accessible={false}>
            <FileText size={28} color={c.placeholder} />
          </View>
        )}
      </View>
      <View style={s.caption}>
        <View style={s.tick}>
          <Check size={11} color={c.onTick} strokeWidth={3} />
        </View>
        <Text style={s.title}>{title}</Text>
      </View>
      {!!note && <Text style={s.note}>{note}</Text>}
      {!!onRetake && (
        <Tap onPress={onRetake} hitSlop={8} accessibilityRole="button" accessibilityLabel={retakeLabel ?? actionLabel}>
          <Text style={s.retake}>{actionLabel}</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      flex: 1, gap: 8, padding: 10, borderRadius: 16, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    frame: { height: 120, borderRadius: 10, overflow: 'hidden', backgroundColor: V6Colors.ink50 },
    image: { width: '100%', height: '100%' },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    note: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink700 },
    caption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tick: {
      width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.successSolid,
    },
    title: { flex: 1, fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: V6Colors.ink900 },
    retake: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.link, paddingVertical: 4 },
  }),
  c: { onTick: Colors.onPrimary, placeholder: V6Colors.ink500 },
});
