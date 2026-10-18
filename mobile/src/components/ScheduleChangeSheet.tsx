/**
 * ScheduleChangeSheet.tsx
 *
 * "Change date or time" for a booked job. Either side can open it; the other
 * side then accepts or declines (see ScheduleChangeCard). The server decides
 * whether the job still allows a change, so its message (for example that a
 * request is already waiting) is shown as-is.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import TextField from './ui/TextField';
import { api, type JobChangeRequest } from '../lib/api';
import { friendlyError } from '../lib/format';
import { dateKey } from '../lib/localDate';
import { combineDateAndTime } from '../lib/postJobRules';
import { SCHEDULE_REASON_MAX, scheduleChangeErrors, scheduleLabel } from '../lib/scheduleChange';

interface ScheduleChangeSheetProps {
  visible: boolean;
  jobId: string;
  /** The job's current scheduled_at (ISO), or null for "as soon as possible". */
  currentScheduledAt: string | null;
  onClose: () => void;
  /** Called with the new pending request after the server accepts it. Reload the job's requests here. */
  onSent: (request: JobChangeRequest) => void;
}

export default function ScheduleChangeSheet({ visible, jobId, currentScheduledAt, onClose, onSent }: ScheduleChangeSheetProps) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const reasonRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDate(null); setTime(null); setTempTime(null); setReason('');
      setShowDate(false); setShowTime(false); setSubmitted(false); setSending(false); setServerError(null);
    }
  }, [visible]);

  const when = date && time ? combineDateAndTime(date, time) : null;
  const errors = scheduleChangeErrors(when, !!date, !!time, reason, new Date());
  const shownErrors = submitted ? errors : {};

  const send = async () => {
    setSubmitted(true);
    setServerError(null);
    const found = scheduleChangeErrors(when, !!date, !!time, reason, new Date());
    if (found.date || found.time) return; // the pickers sit at the top of the sheet, already in view
    if (found.reason) { reasonRef.current?.focus(); return; }
    if (!when || sending) return;
    setSending(true);
    try {
      const created = await api.proposeScheduleChange(jobId, { newScheduledAt: when.toISOString(), reason: reason.trim() });
      onSent(created);
      onClose();
    } catch (err) {
      setServerError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSending(false);
    }
  };

  const onTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowTime(false);
      if (event.type === 'set' && selected) setTime(selected);
      return;
    }
    if (selected) setTempTime(selected);
  };

  const current = scheduleLabel(currentScheduledAt) || 'As soon as possible';

  return (
    <>
      <SheetFrame visible={visible} onClose={sending ? undefined : onClose} contentStyle={styles.sheet} cardProps={{ testID: 'schedule-change-sheet' }}>
        <Text style={styles.title} accessibilityRole="header">Change date or time</Text>
        <View style={styles.currentBox}>
          <Text style={styles.currentLabel}>Current schedule</Text>
          <Text style={styles.currentValue}>{current}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>New date</Text>
            <Tap
              style={[styles.picker, !!shownErrors.date && styles.pickerError]}
              onPress={() => { setShowTime(false); setShowDate(true); }}
              accessibilityRole="button"
              accessibilityLabel="New date"
            >
              <Text style={[styles.pickerText, !date && styles.placeholder]}>
                {date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a date'}
              </Text>
            </Tap>
            {!!shownErrors.date && <Text style={styles.error} accessibilityRole="alert">{shownErrors.date}</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>New time</Text>
            <Tap
              style={[styles.picker, !!shownErrors.time && styles.pickerError]}
              onPress={() => { setShowDate(false); setTempTime(time ?? new Date()); setShowTime(true); }}
              accessibilityRole="button"
              accessibilityLabel="New time"
            >
              <Text style={[styles.pickerText, !time && styles.placeholder]}>
                {time ? time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Pick a time'}
              </Text>
            </Tap>
            {!!shownErrors.time && <Text style={styles.error} accessibilityRole="alert">{shownErrors.time}</Text>}
          </View>
        </View>

        <TextField
          ref={reasonRef}
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Why do you need a different time?"
          counter={`${reason.length}/${SCHEDULE_REASON_MAX}`}
          error={errors.reason}
          submitted={submitted}
          multiline
          maxLength={SCHEDULE_REASON_MAX}
          editable={!sending}
          keyboardAppearance={appearance}
        />

        {!!serverError && <Text style={styles.error} accessibilityRole="alert">{serverError}</Text>}

        <Tap
          style={[styles.sendBtn, sending && styles.dimmed]}
          onPress={send}
          disabled={sending}
          scale
          accessibilityRole="button"
          accessibilityLabel="Send request"
        >
          {sending ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.sendText}>Send request</Text>}
        </Tap>
        <Tap style={styles.cancelBtn} onPress={onClose} disabled={sending} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </Tap>
      </SheetFrame>

      <SheetFrame visible={visible && showDate} onClose={() => setShowDate(false)} dismissible={false} contentStyle={styles.pickerSheet}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Select a date</Text>
          <Tap onPress={() => setShowDate(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close date picker">
            <Text style={styles.pickerClose}>Close</Text>
          </Tap>
        </View>
        <Calendar
          key={appearance}
          current={date ? dateKey(date) : undefined}
          minDate={dateKey(new Date())}
          onDayPress={(day) => {
            const [y, m, d] = day.dateString.split('-').map(Number);
            setDate(new Date(y, m - 1, d));
            setShowDate(false);
          }}
          markedDates={date ? { [dateKey(date)]: { selected: true, selectedColor: Colors.brandTeal } } : undefined}
          renderArrow={(dir: 'left' | 'right') => (dir === 'left'
            ? <ChevronLeft size={22} color={V6Colors.link} />
            : <ChevronRight size={22} color={V6Colors.link} />)}
          theme={{ calendarBackground: V6Colors.surface, dayTextColor: V6Colors.ink900, monthTextColor: V6Colors.ink900, textDisabledColor: V6Colors.ink400, todayTextColor: V6Colors.link, arrowColor: V6Colors.link, selectedDayBackgroundColor: V6Colors.primary, textSectionTitleColor: V6Colors.ink700 }}
        />
      </SheetFrame>

      {Platform.OS === 'android' && visible && showTime && (
        <DateTimePicker themeVariant={appearance} value={tempTime ?? new Date()} mode="time" display="spinner" onChange={onTimeChange} />
      )}
      {Platform.OS === 'ios' && (
        <SheetFrame visible={visible && showTime} onClose={() => setShowTime(false)} dismissible={false} contentStyle={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select a time</Text>
            <Tap onPress={() => setShowTime(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close time picker">
              <Text style={styles.pickerClose}>Close</Text>
            </Tap>
          </View>
          <DateTimePicker themeVariant={appearance} value={tempTime ?? new Date()} mode="time" display="spinner" onChange={onTimeChange} />
          <Tap
            style={styles.sendBtn}
            onPress={() => { if (tempTime) setTime(tempTime); setShowTime(false); }}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.sendText}>Done</Text>
          </Tap>
        </SheetFrame>
      )}
    </>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    sheet: { paddingHorizontal: 20, gap: 12 },
    title: { color: C.ink900, fontSize: 20, fontWeight: '700', lineHeight: 26, fontFamily: 'Inter' },
    currentBox: { backgroundColor: C.ink100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
    currentLabel: { color: C.ink500, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },
    currentValue: { color: C.ink900, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    row: { flexDirection: 'row', gap: 12 },
    col: { flex: 1, gap: 6 },
    fieldLabel: { color: C.ink700, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    picker: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.ink200, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: Colors.surface },
    pickerError: { borderColor: Colors.dangerText },
    pickerText: { color: C.ink900, fontSize: 15, fontFamily: 'Inter' },
    placeholder: { color: Colors.muted },
    error: { color: Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    sendBtn: { height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
    sendText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    dimmed: { opacity: 0.6 },
    cancelBtn: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    cancelText: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    pickerSheet: { backgroundColor: Colors.surface, borderRadius: 24, padding: 20, gap: 8 },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    pickerTitle: { color: C.ink900, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
    pickerClose: { color: C.link, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
