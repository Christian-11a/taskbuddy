/**
 * GoogleRoleSelectionScreen.tsx
 *
 * Shown to new Google OAuth users before they reach their dashboard.
 * They pick either "Homeowner" or "Service Provider".
 *
 * - Homeowner: calls completeGoogleProfile({ role: 'homeowner' }) and done.
 * - Provider:  navigates to GoogleSPDetailsScreen to collect the extra fields
 *   (category + consents) before completing.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import RoleChoiceCard from '../../../src/components/auth/RoleChoiceCard';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

interface GoogleRoleSelectionScreenProps {
  /** Called when the user picks Homeowner — no extra fields needed. */
  onSelectHomeowner: () => Promise<void>;
  /** Called when the user picks Service Provider — opens SP details form. */
  onSelectProvider: () => void;
  /** Displayed below the name — typically the Google account email. */
  email?: string | null;
}

export default function GoogleRoleSelectionScreen({
  onSelectHomeowner,
  onSelectProvider,
  email,
}: GoogleRoleSelectionScreenProps) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const layout = useAuthLayout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleHomeowner = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await onSelectHomeowner();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingBottom: layout.paddingBottom }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: layout.paddingTop }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.welcomeLabel}>Welcome to TaskBuddy</Text>
        {email ? (
          <Text style={styles.emailLabel} numberOfLines={1}>{email}</Text>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">How will you use TaskBuddy?</Text>
        <Text style={styles.subtitle}>You can't switch later, so pick the one that fits.</Text>

        <View accessibilityRole="radiogroup" style={styles.cards}>
          <RoleChoiceCard
            role="homeowner"
            selected={false}
            onSelect={handleHomeowner}
            disabled={loading}
            testID="google-role-homeowner"
          />
          <RoleChoiceCard
            role="provider"
            selected={false}
            onSelect={onSelectProvider}
            disabled={loading}
            testID="google-role-provider"
          />
        </View>

        {loading ? <ActivityIndicator color={V6Colors.link} style={styles.spinner} /> : null}
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.footerNote}>
          Your Google account ({email ?? 'email'}) will be linked to this role permanently.
        </Text>
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 600,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      justifyContent: 'center',
    },
    welcomeLabel: {
      color: V6Colors.link,
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    emailLabel: {
      color: V6Colors.ink500,
      fontFamily: 'Inter',
      fontSize: 14,
      marginBottom: 16,
    },
    title: {
      color: V6Colors.ink900,
      fontFamily: 'Inter',
      fontSize: 26,
      fontWeight: '800',
      lineHeight: 32,
      marginBottom: 6,
    },
    subtitle: {
      color: V6Colors.ink500,
      fontFamily: 'Inter',
      fontSize: 15,
      lineHeight: 20,
      marginBottom: 20,
    },
    cards: { gap: 12, marginBottom: 16 },
    spinner: { marginBottom: 12 },
    errorText: {
      color: V6Colors.dangerText,
      fontFamily: 'Inter',
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 12,
    },
    footerNote: {
      color: V6Colors.ink500,
      fontFamily: 'Inter',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 12,
    },
  });
  return { Colors, V6Colors, styles };
}
