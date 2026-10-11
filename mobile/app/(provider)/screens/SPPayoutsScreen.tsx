/**
 * SPPayoutsScreen.tsx
 *
 * Where a provider connects a Stripe account to be paid into — Stripe Connect
 * Express, onboarded on Stripe's own hosted pages (BACKEND_SCHEMA.md §29).
 * Reached from Profile → Payouts.
 *
 * What it changes, stated on screen because it is not obvious: once the
 * account is active, a job the homeowner paid **by card** is sent to the
 * provider's Stripe account automatically after the three-day warranty ends without an open complaint, and Stripe pays
 * it out to their bank. A job paid from the homeowner's wallet still lands in
 * the TaskBuddy wallet and is withdrawn the usual way. The split is Stripe's,
 * not ours: pesos can only be sent on from the card charge that brought them in.
 *
 * Onboarding runs in a browser (`openAuthSessionAsync`), and the backend
 * bounces Stripe's return back to this app's deep link:
 *
 *   ?connect=return  — the provider left Stripe's form. Finished or not; the
 *                      only way to know is to ask, so the screen syncs.
 *   ?connect=refresh — the link expired or was reused. A fresh one is fetched
 *                      and opened once, automatically.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import StatusCard, { type StatusCardTone } from '../../../src/components/ui/StatusCard';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Check, CreditCard, ExternalLink, Lock, Wallet } from 'lucide-react-native';
import { api, type ConnectStatus } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

interface SPPayoutsScreenProps {
  onBack: () => void;
}

export interface PayoutsCopy {
  tone: StatusCardTone;
  overline: string;
  title: string;
  body: string;
  /** Label of the bottom action, or null when the state needs none. */
  action: string | null;
}

/** What the status card and the bottom action say for each Stripe state. */
export function payoutsCopy(state: ConnectStatus['state']): PayoutsCopy {
  switch (state) {
    case 'not_started':
      return {
        tone: 'attention',
        overline: 'Not set up',
        title: 'Get paid straight to your bank',
        body: 'Connect a Stripe account to receive card-funded earnings after the three-day warranty ends, unless a complaint is open.',
        action: 'Set up payouts',
      };
    case 'onboarding':
      return {
        tone: 'attention',
        overline: 'Setup not finished',
        title: 'Finish setting up payouts',
        body: 'You started connecting a Stripe account but have not finished. It only takes a few minutes.',
        action: 'Continue setup',
      };
    case 'restricted':
      return {
        tone: 'attention',
        overline: 'Action needed',
        title: 'Stripe needs something from you',
        body: 'Your account is connected, but Stripe cannot send you money until you update your details.',
        action: 'Update details',
      };
    case 'active':
      return {
        tone: 'done',
        overline: 'Payouts on',
        title: 'Payouts are on',
        body: 'Card-funded earnings become eligible for transfer after the three-day warranty ends without an open complaint. Stripe then processes the bank payout.',
        action: null,
      };
  }
}

/** What a provider needs ready before Stripe's form. Stripe asks for both on its own pages. */
const NEEDED = ['A valid ID', 'Your bank account details'];

export default function SPPayoutsScreen({ onBack }: SPPayoutsScreenProps) {
  const { styles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { data: current, loading, error, reload } = useAsyncData<ConnectStatus>(
    () => api.connectSync(),
    [],
  );
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useRefreshOnForeground(reload, !working);

  /**
   * Opens Stripe's onboarding and handles the way back. `retryOnRefresh`
   * lets an expired link be replaced once without the provider noticing;
   * a second refresh in a row is a real problem and is shown as one.
   */
  const openOnboarding = async (retryOnRefresh = true): Promise<void> => {
    // exp://[ip]:8081/--/payouts in Expo Go, taskbuddy://payouts in a build —
    // the backend allowlists both.
    const appRedirect = AuthSession.makeRedirectUri({ scheme: 'taskbuddy', path: 'payouts' });
    const link = await api.connectOnboardingLink({ app_redirect: appRedirect });
    const result = await openRedirectSession(link.url, appRedirect);

    const leg =
      result.type === 'success'
        ? new URLSearchParams(result.url.split('?')[1] ?? '').get('connect')
        : null;

    if (leg === 'refresh' && retryOnRefresh) return openOnboarding(false);
    if (leg === 'refresh') {
      setActionError('The setup link expired. Please try again.');
      return;
    }
    // Returned, or dismissed the browser: either way Stripe may have what it
    // needs now, and only Stripe can say.
    reload();
  };

  const startOrContinue = async () => {
    setWorking(true);
    setActionError(null);
    try {
      await openOnboarding();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not open Stripe.';
      setActionError(message.includes("You can only create new accounts if you've signed up for Connect")
        ? 'Card payout setup is unavailable for this platform. Contact TaskBuddy support.'
        : message);
    } finally {
      setWorking(false);
    }
  };

  const openDashboard = async () => {
    setWorking(true);
    setActionError(null);
    try {
      const { url } = await api.connectDashboardLink();
      await WebBrowser.openBrowserAsync(url);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not open the Stripe dashboard.');
    } finally {
      setWorking(false);
    }
  };

  const refresh = () => {
    setActionError(null);
    reload();
  };

  const copy = current ? payoutsCopy(current.state) : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Payouts</Text>
      </View>

      {loading && !current && <ContentSkeleton variant="list" />}
      {!!error && !current && (
        <View style={styles.errorWrap}>
          <LoadErrorCard title="Couldn't load payouts" message={error} onRetry={reload} />
        </View>
      )}

      {current && copy && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View testID={`payouts-status-${current.state}`}>
              <StatusCard tone={copy.tone} overline={copy.overline} title={copy.title} body={copy.body}>
                {current.state === 'restricted' && current.requirements_due.length > 0 && (
                  <Text style={styles.requirements}>
                    Stripe is asking for {current.requirements_due.length} more detail
                    {current.requirements_due.length === 1 ? '' : 's'}.
                  </Text>
                )}
                {loading && <Text style={styles.note}>Refreshing payout status…</Text>}
                {!!error && <Text style={styles.actionError} accessibilityLiveRegion="polite">{error}</Text>}
                {!!actionError && <Text style={styles.actionError} accessibilityLiveRegion="polite">{actionError}</Text>}

                {current.details_submitted && (
                  <Tap
                    style={[styles.outlineBtn, working && styles.disabled]}
                    onPress={openDashboard}
                    disabled={working || loading}
                    activeOpacity={0.85}
                    testID="payouts-dashboard"
                    accessibilityRole="button"
                    accessibilityLabel="Open Stripe dashboard"
                  >
                    <ExternalLink size={15} color={V6Colors.ink700} />
                    <Text style={styles.outlineBtnText}>Open Stripe dashboard</Text>
                  </Tap>
                )}

                {current.state !== 'not_started' && (
                  <Tap
                    onPress={refresh}
                    disabled={working || loading}
                    activeOpacity={0.8}
                    hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh status"
                  >
                    <Text style={styles.link}>Refresh status</Text>
                  </Tap>
                )}
              </StatusCard>
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">How you get paid</Text>
            <View style={styles.card}>
              <View style={styles.explainRow}>
                <View style={styles.tile}>
                  <CreditCard size={18} color={V6Colors.ink700} />
                </View>
                <View style={styles.explainText}>
                  <Text style={styles.explainTitle}>Card-paid jobs → your bank</Text>
                  <Text style={styles.explainBody}>
                    {current.state === 'active'
                      ? 'Eligible for transfer after the three-day warranty ends without an open complaint; Stripe then processes your bank payout.'
                      : 'After the three-day warranty ends without an open complaint, earnings stay in your TaskBuddy wallet if Stripe payouts are not ready.'}
                  </Text>
                </View>
              </View>
              <View style={styles.explainRow}>
                <View style={styles.tile}>
                  <Wallet size={18} color={V6Colors.ink700} />
                </View>
                <View style={styles.explainText}>
                  <Text style={styles.explainTitle}>Wallet-paid jobs → your TaskBuddy wallet</Text>
                  <Text style={styles.explainBody}>
                    Withdraw it from the Wallet tab as usual.
                  </Text>
                </View>
              </View>
            </View>

            {current.state !== 'active' && (
              <>
                <Text style={styles.sectionTitle} accessibilityRole="header">You'll need</Text>
                <View style={styles.card}>
                  {NEEDED.map((item) => (
                    <View key={item} style={styles.checkRow}>
                      <Check size={16} color={V6Colors.ink700} />
                      <Text style={styles.checkText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.hint}>Setup takes a few minutes on Stripe's pages.</Text>
              </>
            )}

            <View style={styles.footnote}>
              <Lock size={14} color={V6Colors.ink500} />
              <Text style={styles.footnoteText}>
                Your bank details are entered on Stripe's pages and never reach TaskBuddy.
              </Text>
            </View>
          </ScrollView>

          {copy.action && (
            <BottomActionBar
              primaryLabel={copy.action}
              onPrimary={() => void startOrContinue()}
              busy={working}
              primaryDisabled={loading}
            />
          )}
        </>
      )}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: V6Colors.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.hairline,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: V6Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    scroll: { flex: 1 },
    body: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 24 },
    errorWrap: { paddingHorizontal: Spacing.screenH, paddingTop: 16 },

    requirements: { color: Colors.warningText, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    note: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    actionError: { color: Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    outlineBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line,
      backgroundColor: V6Colors.surface, marginTop: 4,
    },
    outlineBtnText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    disabled: { opacity: 0.5 },
    link: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },

    sectionTitle: {
      color: V6Colors.ink900, fontSize: 17, fontWeight: '700', lineHeight: 22, fontFamily: 'Inter',
      marginTop: 22, marginBottom: 10,
    },
    card: {
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      borderRadius: 18, padding: 14, gap: 14,
    },
    explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    tile: {
      width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.skeleton,
      alignItems: 'center', justifyContent: 'center',
    },
    explainText: { flex: 1, gap: 2 },
    explainTitle: { color: V6Colors.ink900, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    explainBody: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkText: { color: V6Colors.ink900, fontSize: 15, fontWeight: '500', lineHeight: 20, fontFamily: 'Inter' },
    hint: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', marginTop: 8 },
    footnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 18 },
    footnoteText: { flex: 1, color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
