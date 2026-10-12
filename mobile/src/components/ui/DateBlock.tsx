import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** When a job happens, at a glance. Empty date = dashed amber "NO DATE". */
export default function DateBlock({ date }: { date?: Date | string | null }) {
  const s = useThemedStyles(createStyles);
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return (
      <View style={[s.box, s.empty]} accessible accessibilityLabel="No date yet">
        <Text style={s.emptyText}>NO</Text>
        <Text style={s.emptyText}>DATE</Text>
      </View>
    );
  }
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <View style={[s.box, s.dated]} accessible accessibilityLabel={label}>
      <Text style={s.weekday}>{DAYS[d.getDay()]}</Text>
      <Text style={s.day}>{d.getDate()}</Text>
    </View>
  );
}

const createStyles = ({ Colors }: Palette) => StyleSheet.create({
  box: { width: 46, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dated: { backgroundColor: Colors.primaryTonal },
  weekday: { fontFamily: 'Inter', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.link },
  day: { fontFamily: 'Inter', fontSize: 18, fontWeight: '700', lineHeight: 20, color: Colors.primaryDeep },
  empty: { backgroundColor: Colors.warningSurface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.warningBorder },
  emptyText: { fontFamily: 'Inter', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.warningText },
});
