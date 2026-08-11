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

import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Home, Wrench } from 'lucide-react-native';
import type { MobileRole } from '../../../src/lib/api';
import { Colors } from '../../../src/constants/theme';

const C = {
  ...Colors,
  bg: '#F8FAFC',
  dark: '#1E1E1E',
  slate: '#64748B',
  cardBorder: 'rgba(144,153,184,0.2)',
} as const;

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
    <View style={styles.screen}>
      {/* Teal header accent */}
      <View style={styles.headerAccent} />

      <View style={styles.content}>
        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.welcomeLabel}>Welcome to TaskBuddy</Text>
          {email ? (
            <Text style={styles.emailLabel} numberOfLines={1}>{email}</Text>
          ) : null}
          <Text style={styles.title}>How will you use TaskBuddy?</Text>
          <Text style={styles.subtitle}>
            Choose your role. You can only have one role per account.
          </Text>
        </View>

        {/* Role cards */}
        <View style={styles.cardsRow}>
          {/* Homeowner */}
          <TouchableOpacity
            style={[styles.card, styles.cardLeft]}
            onPress={handleHomeowner}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={[styles.iconCircle, styles.iconCircleHO]}>
              <Home size={28} color={C.brandTeal} />
            </View>
            <Text style={styles.cardTitle}>Homeowner</Text>
            <Text style={styles.cardDesc}>
              Post jobs and hire trusted local service providers.
            </Text>
            {loading ? (
              <ActivityIndicator color={C.brandTeal} style={{ marginTop: 16 }} />
            ) : (
              <View style={[styles.cardBadge, styles.cardBadgeHO]}>
                <Text style={[styles.cardBadgeText, styles.cardBadgeTextHO]}>I need help</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Service Provider */}
          <TouchableOpacity
            style={[styles.card, styles.cardRight]}
            onPress={onSelectProvider}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={[styles.iconCircle, styles.iconCircleSP]}>
              <Wrench size={28} color={C.white} />
            </View>
            <Text style={styles.cardTitle}>Service Provider</Text>
            <Text style={styles.cardDesc}>
              Offer your skills and grow your client base.
            </Text>
            <View style={[styles.cardBadge, styles.cardBadgeSP]}>
              <Text style={[styles.cardBadgeText, styles.cardBadgeTextSP]}>I provide services</Text>
            </View>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.footerNote}>
          Your Google account ({email ?? 'email'}) will be linked to this role permanently.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  headerAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 220,
    backgroundColor: C.brandDark,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  titleBlock: { marginBottom: 32, alignItems: 'center' },
  welcomeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emailLabel: {
    color: C.white,
    fontFamily: 'Inter',
    fontSize: 13,
    marginBottom: 24,
    opacity: 0.85,
  },
  title: {
    color: C.dark,
    fontFamily: 'Inter',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: C.slate,
    fontFamily: 'Inter',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  cardsRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },

  card: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
    shadowColor: '#063D4D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  cardLeft: {},
  cardRight: {},

  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  iconCircleHO: { backgroundColor: 'rgba(9,110,139,0.10)' },
  iconCircleSP: { backgroundColor: C.brandTeal },

  cardTitle: {
    color: C.dark,
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardDesc: {
    color: C.slate,
    fontFamily: 'Inter',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },

  cardBadge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  cardBadgeHO: { backgroundColor: 'rgba(9,110,139,0.10)' },
  cardBadgeSP: { backgroundColor: C.brandTeal },
  cardBadgeText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700' },
  cardBadgeTextHO: { color: C.brandTeal },
  cardBadgeTextSP: { color: C.white },

  errorText: {
    color: Colors.error ?? Colors.brandRed,
    fontFamily: 'Inter',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },

  footerNote: {
    color: C.muted,
    fontFamily: 'Inter',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 12,
  },
});
