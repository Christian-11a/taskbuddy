/**
 * GoogleRoleSelectionScreen.tsx
 *
 * Shown to new Google OAuth users before they reach their dashboard.
 * They pick either "Homeowner" or "Service Provider".
 *
 * Picking a card opens a confirm sheet first, because the role cannot be
 * changed later. Only "Yes" runs the real action, once:
 * - Homeowner: calls completeGoogleProfile({ role: 'homeowner' }) and done.
 * - Provider:  navigates to GoogleSPDetailsScreen to collect the extra fields
 *   (category + consents) before completing.
 * "Choose again" closes the sheet and saves nothing.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import RoleChoiceCard from '../../../src/components/auth/RoleChoiceCard';
import RoleConfirmSheet from '../../../src/components/auth/RoleConfirmSheet';
import { confirmRoleChoice, type GoogleRole } from '../../../src/components/auth/roleConfirm';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

interface GoogleRoleSelectionScreenProps {
  /** Called when the user confirms Homeowner — no extra fields needed. */
  onSelectHomeowner: () => Promise<void>;
  /** Called when the user confirms Service Provider — opens SP details form. */
  onSelectProvider: () => void;
  /** Displayed in the sheet — the Google account email. */
  email?: string | null;
}

export default function GoogleRoleSelectionScreen({
  onSelectHomeowner,
  onSelectProvider,
  email,
}: GoogleRoleSelectionScreenProps) {
  const { styles } = useThemedStyles(createThemedStyles);
  const layout = useAuthLayout();
  const [sheetOpen, setSheetOpen] = useState(false);
  // The role the sheet is about. Kept after the sheet closes so the text does
  // not change while it fades out.
  const [sheetRole, setSheetRole] = useState<GoogleRole>('homeowner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state, so a second "Yes" in the same frame sees the first one.
  const savingRef = useRef(false);

  const pick = (role: GoogleRole) => {
    if (savingRef.current) return;
    setError(null);
    setSheetRole(role);
    setSheetOpen(true);
  };

  const handleConfirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await confirmRoleChoice(sheetRole, {
        saveHomeowner: onSelectHomeowner,
        continueToProvider: onSelectProvider,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSheetOpen(false);
    }
  };

  const handleChooseAgain = () => {
    if (savingRef.current) return;
    setSheetOpen(false);
  };

  return (
    <View style={[styles.screen, { paddingBottom: layout.paddingBottom }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: layout.paddingTop }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.welcomeLabel}>Welcome to TaskBuddy</Text>
        {email ? (
          <Text style={styles.emailLabel}>{email}</Text>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">How will you use TaskBuddy?</Text>
        <Text style={styles.subtitle}>You can't switch later, so pick the one that fits.</Text>

        <View accessibilityRole="radiogroup" style={styles.cards}>
          <RoleChoiceCard
            role="homeowner"
            selected={sheetOpen && sheetRole === 'homeowner'}
            onSelect={() => pick('homeowner')}
            disabled={saving}
            testID="google-role-homeowner"
          />
          <RoleChoiceCard
            role="provider"
            selected={sheetOpen && sheetRole === 'provider'}
            onSelect={() => pick('provider')}
            disabled={saving}
            testID="google-role-provider"
          />
        </View>

        {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}

        <Text style={styles.footerNote}>
          {email
            ? `Your Google account (${email}) will be linked to this role permanently.`
            : 'Your Google account will be linked to this role permanently.'}
        </Text>
      </ScrollView>

      <RoleConfirmSheet
        visible={sheetOpen}
        role={sheetRole}
        email={email}
        busy={saving}
        onConfirm={handleConfirm}
        onChooseAgain={handleChooseAgain}
      />
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
