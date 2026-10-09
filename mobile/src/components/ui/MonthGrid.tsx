/**
 * The parts of a month calendar that the screens draw themselves: the weekday
 * names over the grid, and one day cell (a 36 dp circle that is filled when it
 * is picked and ringed when it is today, with a dot under it when something
 * falls on that day). The library draws the grid around them, with its own
 * header hidden.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DateData } from 'react-native-calendars';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import { dayLabel } from '../../lib/jobCalendar';
import Tap from './Tap';

/** The weekday names over the grid. The grid starts on Sunday (firstDay 0). */
const WEEKDAYS: readonly { letter: string; name: string }[] = [
  { letter: 'S', name: 'Sunday' },
  { letter: 'M', name: 'Monday' },
  { letter: 'T', name: 'Tuesday' },
  { letter: 'W', name: 'Wednesday' },
  { letter: 'T', name: 'Thursday' },
  { letter: 'F', name: 'Friday' },
  { letter: 'S', name: 'Saturday' },
];

/**
 * The weekday names above the grid. The calendar's own header, which would draw
 * them, is hidden, so this row draws them: seven equal columns in the grid's
 * inset, so each name sits over its column.
 */
export function CalendarWeekdays() {
  const { styles } = useThemedStyles(createWeekdayStyles);
  return (
    <View style={styles.row} testID="calendar-weekdays">
      {WEEKDAYS.map((day) => (
        <Text key={day.name} style={styles.name} accessibilityLabel={day.name}>
          {day.letter}
        </Text>
      ))}
    </View>
  );
}

function createWeekdayStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const styles = StyleSheet.create({
    // The library lays the grid out inside 5 dp of padding, so the names use the same inset.
    row: { flexDirection: 'row', marginHorizontal: 5, marginBottom: 7 },
    name: {
      flex: 1, textAlign: 'center', color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 12, fontWeight: '600',
    },
  });
  return { styles };
}

export type CalendarDayProps = {
  date?: DateData;
  marking?: { marked?: boolean; selected?: boolean; today?: boolean };
  onPress?: (date?: DateData) => void;
};

/**
 * One day in the month grid: a 36 dp circle (filled when picked, ringed when it
 * is today) with a dot under it when something falls on that day.
 */
export function CalendarDay({ date, marking, onPress }: CalendarDayProps) {
  const { styles } = useThemedStyles(createDayStyles);
  if (!date) return <View style={styles.cell} />;
  const selected = !!marking?.selected;
  const today = !!marking?.today;
  const hasItems = !!marking?.marked;
  const label = `${dayLabel(date.dateString)}${today ? ', today' : ''}${hasItems ? ', has jobs' : ''}`;
  return (
    <Tap
      style={styles.cell}
      onPress={() => onPress?.(date)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <View
        testID={`calendar-day-circle-${date.dateString}`}
        style={[styles.circle, selected && styles.circleSelected, today && !selected && styles.circleToday]}
      >
        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{date.day}</Text>
      </View>
      <View style={[styles.dot, !hasItems && styles.dotHidden]} />
    </Tap>
  );
}

function createDayStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    cell: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
    circle: {
      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: V6Colors.surface,
    },
    circleSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    circleToday: { borderColor: Colors.link },
    dayText: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 15, fontWeight: '500' },
    dayTextSelected: { color: Colors.onPrimary, fontWeight: '700' },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: Colors.link },
    dotHidden: { backgroundColor: V6Colors.surface },
  });
  return { styles };
}
