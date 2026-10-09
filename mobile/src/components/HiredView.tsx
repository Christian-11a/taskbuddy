import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, MessageCircle } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import Tap from './ui/Tap';
import SuccessMark from './ui/SuccessMark';
import { clockLabel, dayLabel, peso } from '../lib/format';

export interface HiredViewProps {
  providerName: string;
  /** What the hire holds for the job; null or 0 when nothing is held. */
  budget: number | null;
  /** The job's scheduled start (ISO), or null when it has no set time. */
  scheduledAt: string | null;
  onMessage: () => void;
  onViewJob: () => void;
}

/**
 * The full-screen moment after a hire goes through: a check, what happens to
 * the money, when the provider comes, and the two things to do next. It shows
 * only facts from the hire itself; nothing here is a promise the data doesn't back.
 */
export default function HiredView({ providerName, budget, scheduledAt, onMessage, onViewJob }: HiredViewProps) {
  const { s, check, chat } = useThemedStyles(createStyles);
  const held = budget != null && budget > 0
    ? `${peso(budget)} is held safely until the job is done.`
    : 'Nothing is held for this job.';
  const visit = [dayLabel(scheduledAt), clockLabel(scheduledAt)].filter(Boolean).join(' · ');

  return (
    <View style={s.wrap}>
      <View style={s.center}>
        <SuccessMark
          size={96}
          fallback={<View style={s.fallback}><Check size={44} color={check} /></View>}
        />
        <Text style={s.title} accessibilityRole="header">{providerName} is hired!</Text>
        <Text style={s.held}>{held}</Text>

        <View style={s.card}>
          <View style={s.row}>
            <MessageCircle size={18} color={chat} />
            <Text style={s.rowText}>You can now chat with them</Text>
          </View>
          {!!visit && (
            <View style={s.row}>
              <Check size={18} color={check} />
              <Text style={s.rowText}>They come {visit}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.actions}>
        <Tap
          style={s.primary}
          scale
          onPress={onMessage}
          accessibilityRole="button"
          accessibilityLabel={`Message ${providerName}`}
        >
          <Text style={s.primaryText}>Message {providerName}</Text>
        </Tap>
        <Tap
          style={s.link}
          onPress={onViewJob}
          accessibilityRole="button"
          accessibilityLabel="View job"
        >
          <Text style={s.linkText}>View job</Text>
        </Tap>
      </View>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    wrap: {
      flex: 1, backgroundColor: V6Colors.surface, paddingHorizontal: 24, paddingBottom: 24,
      justifyContent: 'space-between',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    fallback: {
      width: 96, height: 96, borderRadius: 48, backgroundColor: V6Colors.successSurface,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: V6Colors.ink900, fontSize: 24, fontWeight: '800', fontFamily: 'Inter', textAlign: 'center' },
    held: { color: V6Colors.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter', textAlign: 'center' },
    card: {
      alignSelf: 'stretch', marginTop: 10, gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowText: { flex: 1, color: V6Colors.ink900, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    actions: { gap: 6 },
    primary: {
      minHeight: 48, borderRadius: 16, backgroundColor: Colors.primary,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    },
    primaryText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },
    link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
  }),
  check: V6Colors.successText,
  chat: Colors.link,
});
