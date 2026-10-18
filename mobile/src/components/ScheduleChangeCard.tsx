/**
 * ScheduleChangeCard.tsx
 *
 * A pending "move this job" request, shown on the job screen. The person who
 * asked can withdraw it; the other side can accept or decline. A request that
 * is no longer pending renders as a one-line result.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import Tap from './ui/Tap';
import { api, type JobChangeDecision, type JobChangeRequest } from '../lib/api';
import { friendlyError } from '../lib/format';
import { scheduleChangeActions, scheduleChangeResult, scheduleChangeText } from '../lib/scheduleChange';

interface ScheduleChangeCardProps {
  request: JobChangeRequest;
  /** Signed-in user's profile id. */
  userId: string | null | undefined;
  /** The other participant's name (client or provider), for "Ana asked to...". */
  otherName: string | null | undefined;
  /** Called after the server records a decision; reload the job and its requests here. */
  onDecided: (updated: JobChangeRequest) => void;
}

export default function ScheduleChangeCard({ request, userId, otherName, onDecided }: ScheduleChangeCardProps) {
  const { styles, Colors } = useThemedStyles(createThemedStyles);
  const [busy, setBusy] = useState<JobChangeDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { canWithdraw, canDecide } = scheduleChangeActions(request, userId);

  const decide = async (decision: JobChangeDecision) => {
    if (busy) return;
    setBusy(decision);
    setError(null);
    try {
      const updated = await api.decideJobChange(request.id, decision);
      onDecided(updated);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  };

  if (request.status !== 'pending') {
    return (
      <View style={styles.card} testID="schedule-change-card">
        <Text style={styles.text}>{scheduleChangeResult(request.status)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="schedule-change-card">
      <Text style={styles.text}>{scheduleChangeText(request, userId, otherName)}</Text>
      <Text style={styles.reason}>{`Reason: ${request.reason}`}</Text>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      <View style={styles.actions}>
        {canDecide && (
          <>
            <Tap style={[styles.primary, !!busy && styles.dimmed]} onPress={() => decide('accepted')} disabled={!!busy} scale accessibilityRole="button" accessibilityLabel="Accept">
              {busy === 'accepted' ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.primaryText}>Accept</Text>}
            </Tap>
            <Tap style={[styles.secondary, !!busy && styles.dimmed]} onPress={() => decide('declined')} disabled={!!busy} scale accessibilityRole="button" accessibilityLabel="Decline">
              {busy === 'declined' ? <ActivityIndicator color={Colors.link} /> : <Text style={styles.secondaryText}>Decline</Text>}
            </Tap>
          </>
        )}
        {canWithdraw && (
          <Tap style={[styles.secondary, !!busy && styles.dimmed]} onPress={() => decide('withdrawn')} disabled={!!busy} scale accessibilityRole="button" accessibilityLabel="Withdraw">
            {busy === 'withdrawn' ? <ActivityIndicator color={Colors.link} /> : <Text style={styles.secondaryText}>Withdraw</Text>}
          </Tap>
        )}
      </View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    card: { backgroundColor: V6Colors.warningSurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
    text: { fontFamily: 'Inter', fontSize: 14, lineHeight: 19, fontWeight: '600', color: V6Colors.warningText },
    reason: { fontFamily: 'Inter', fontSize: 14, lineHeight: 19, color: V6Colors.warningText },
    error: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: Colors.dangerText },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    primary: { flex: 1, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
    primaryText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    secondary: { flex: 1, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: V6Colors.warningText },
    secondaryText: { color: V6Colors.warningText, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    dimmed: { opacity: 0.6 },
  });
  return { Colors, V6Colors, styles };
}
