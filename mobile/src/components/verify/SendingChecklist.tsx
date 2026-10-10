import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Circle, CircleCheck } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import type { ChecklistStatus } from '../../lib/verifyFlow';

export type SendingChecklistProps = {
  rows: readonly { key: string; label: string; status: ChecklistStatus }[];
};

/** How each state is read aloud, after the step's name. */
const WORDS: Record<ChecklistStatus, string> = { done: 'done', active: 'in progress', pending: 'waiting' };

/** The steps of the send, each drawn from what has really happened so far. */
export default function SendingChecklist({ rows }: SendingChecklistProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.card}>
      {rows.map((row) => (
        <View
          key={row.key}
          style={s.row}
          accessible
          accessibilityLabel={`${row.label}: ${WORDS[row.status]}`}
        >
          <View style={s.mark}>
            {row.status === 'done' && <CircleCheck size={20} color={c.done} />}
            {row.status === 'active' && <ActivityIndicator size="small" color={c.active} />}
            {row.status === 'pending' && <Circle size={20} color={c.todo} />}
          </View>
          <Text style={[s.text, row.status === 'pending' && s.textTodo]}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      gap: 14, padding: 16, borderRadius: 18, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    mark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    textTodo: { fontWeight: '500', color: V6Colors.ink500 },
  }),
  c: { done: Colors.successText, active: Colors.link, todo: V6Colors.ink500 },
});
