import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, CircleCheck } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import type { TimelineRow, TimelineState } from '../../lib/verifyFlow';

export type PendingTimelineProps = { rows: readonly TimelineRow[] };

/** How each state is read aloud, after the step's name. */
const WORDS: Record<TimelineState, string> = { done: 'done', current: 'now', upcoming: 'not yet' };

/** Where the review stands, one line per step. The step in progress is marked with a dot, not ticked. */
export default function PendingTimeline({ rows }: PendingTimelineProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.list}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={s.row}
          accessible
          accessibilityLabel={`${row.title}, ${WORDS[row.state]}. ${row.detail}`}
        >
          <View style={s.rail}>
            <View style={s.mark}>
              {row.state === 'done' && <CircleCheck size={20} color={c.done} />}
              {row.state === 'current' && <View style={s.dot} />}
              {row.state === 'upcoming' && <Circle size={20} color={c.todo} />}
            </View>
            {index < rows.length - 1 && <View style={s.line} />}
          </View>
          <View style={s.text}>
            <Text style={[s.title, row.state === 'upcoming' && s.titleLater]}>{row.title}</Text>
            <Text style={s.detail}>{row.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    list: { gap: 0 },
    row: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
    rail: { width: 22, alignItems: 'center' },
    mark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.link },
    line: { flex: 1, width: 2, marginVertical: 3, backgroundColor: V6Colors.line },
    text: { flex: 1, gap: 2, paddingTop: 1 },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    titleLater: { fontWeight: '500', color: V6Colors.ink700 },
    detail: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: V6Colors.ink500 },
  }),
  c: { done: Colors.successText, todo: V6Colors.ink500 },
});
