/**
 * SPPayoutsScreen.tsx
 *
 * Where a provider connects a Stripe account to be paid into — Stripe Connect
 * Express, onboarded on Stripe's own hosted pages (BACKEND_SCHEMA.md §29).
 * Reached from Profile → Payouts.
 *
 * What it changes, stated on screen because it is not obvious: once the
 * account is active, a job the homeowner paid **by card** is sent to the
 * provider's Stripe account automatically when it completes, and Stripe pays
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

import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Clock,
  CreditCard,
  ExternalLink,
  Landmark,
  Wallet,
} from 'lucide-react-native';
import { api, type ConnectStatus } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;

interface SPPayoutsScreenProps {
  onBack: () => void;
}

const COPY: Record<
  ConnectStatus['state'],
  { title: string; body: string; action: string | null; tone: 'neutral' | 'pending' | 'warning' | 'good' }
> = {
  not_started: {
    title: 'Get paid straight to your bank',
    body: 'Connect a Stripe account and jobs paid by card are sent to it automatically when they are completed.',
    action: 'Set up payouts',
    tone: 'neutral',
  },
  onboarding: {
    title: 'Finish setting up payouts',
    body: 'You started connecting a Stripe account but have not finished. It only takes a few minutes.',
    action: 'Continue setup',
    tone: 'pending',
  },
  restricted: {
    title: 'Stripe needs something from you',
    body: 'Your account is connected, but Stripe cannot send you money until you update your details.',
    action: 'Update details',
    tone: 'warning',
  },
  active: {
    title: 'Payouts are on',
    body: 'Card-paid jobs are sent to your Stripe account as soon as the client confirms completion.',
    action: null,
    tone: 'good',
  },
};

export default function SPPayoutsScreen({ onBack }: SPPayoutsScreenProps) {
  const { data: status, loading, error, reload } = useAsyncData<ConnectStatus>(
    () => api.connectStatus(),
    [],
  );
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [synced, setSynced] = useState<ConnectStatus | null>(null);

  const current = synced ?? status;

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
    setSynced(await api.connectSync());
  };

  const startOrContinue = async () => {
    setWorking(true);
    setActionError(null);
    try {
      await openOnboarding();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not open Stripe.');
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
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not open the Stripe dashboard.');
    } finally {
      setWorking(false);
    }
  };

  const refresh = async () => {
    setWorking(true);
    setActionError(null);
    try {
      setSynced(await api.connectSync());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not refresh.');
    } finally {
      setWorking(false);
    }
  };

  const copy = current ? COPY[current.state] : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
      </View>

      {loading && !current && <ActivityIndicator style={{ marginTop: 24 }} color={C.cyan700} />}
      {!!error && !current && (
        <View style={styles.centered}>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity onPress={reload} activeOpacity={0.8}>
            <Text style={styles.link}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {current && copy && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={[styles.statusCard, TONE[copy.tone].card]} testID={`payouts-status-${current.state}`}>
            <View style={[styles.statusIcon, TONE[copy.tone].icon]}>
              <StatusIcon state={current.state} />
            </View>
            <Text style={styles.statusTitle}>{copy.title}</Text>
            <Text style={styles.statusBody}>{copy.body}</Text>

            {current.state === 'restricted' && current.requirements_due.length > 0 && (
              <Text style={styles.requirements}>
                Stripe is asking for {current.requirements_due.length} more detail
                {current.requirements_due.length === 1 ? '' : 's'}.
              </Text>
            )}

            {!!actionError && <Text style={styles.actionError}>{actionError}</Text>}

            {copy.action && (
              <TouchableOpacity
                style={[styles.primaryBtn, working && styles.disabled]}
                onPress={startOrContinue}
                disabled={working}
                activeOpacity={0.85}
                testID="payouts-primary"
              >
                {working ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{copy.action}</Text>
                )}
              </TouchableOpacity>
            )}

            {current.details_submitted && (
              <TouchableOpacity
                style={[styles.outlineBtn, working && styles.disabled]}
                onPress={openDashboard}
                disabled={working}
                activeOpacity={0.85}
                testID="payouts-dashboard"
              >
                <ExternalLink size={15} color={C.ink700} />
                <Text style={styles.outlineBtnText}>Open Stripe dashboard</Text>
              </TouchableOpacity>
            )}

            {current.state !== 'not_started' && (
              <TouchableOpacity onPress={refresh} disabled={working} activeOpacity={0.8}>
                <Text style={styles.link}>Refresh status</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionTitle}>How you get paid</Text>
          <View style={styles.explainRow}>
            <CreditCard size={18} color={C.cyan700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.explainTitle}>Client paid by card</Text>
              <Text style={styles.explainBody}>
                {current.state === 'active'
                  ? 'Sent to your Stripe account when the job is completed, then paid to your bank by Stripe.'
                  : 'Lands in your TaskBuddy wallet until payouts are set up.'}
              </Text>
            </View>
          </View>
          <View style={styles.explainRow}>
            <Wallet size={18} color={C.cyan700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.explainTitle}>Client paid from their wallet</Text>
              <Text style={styles.explainBody}>
                Lands in your TaskBuddy wallet. Withdraw it from the Wallet tab as usual.
              </Text>
            </View>
          </View>
          <Text style={styles.footnote}>
            Your bank details are entered on Stripe's pages and never reach TaskBuddy.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function StatusIcon({ state }: { state: ConnectStatus['state'] }) {
  if (state === 'active') return <BadgeCheck size={22} color={C.green600} />;
  if (state === 'restricted') return <CircleAlert size={22} color={C.amber700} />;
  if (state === 'onboarding') return <Clock size={22} color={C.cyan700} />;
  return <Landmark size={22} color={C.cyan700} />;
}

const TONE = {
  neutral: StyleSheet.create({ card: {}, icon: { backgroundColor: C.cyan50 } }),
  pending: StyleSheet.create({ card: {}, icon: { backgroundColor: C.cyan50 } }),
  warning: StyleSheet.create({ card: { borderColor: '#fde68a' }, icon: { backgroundColor: '#fef3c7' } }),
  good: StyleSheet.create({ card: { borderColor: '#bbf7d0' }, icon: { backgroundColor: '#dcfce7' } }),
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 32 },
  centered: { alignItems: 'center', marginTop: 30, gap: 10 },
  stateText: { color: C.ink500, fontSize: 15, fontFamily: 'Inter', textAlign: 'center' },

  statusCard: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 18, alignItems: 'center', gap: 8,
  },
  statusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: C.ink900, fontSize: 17, fontWeight: '800', fontFamily: 'Inter', textAlign: 'center' },
  statusBody: { color: C.ink500, fontSize: 13.5, lineHeight: 19, fontFamily: 'Inter', textAlign: 'center' },
  requirements: { color: C.amber700, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter' },
  actionError: { color: C.red700, fontSize: 12.5, fontFamily: 'Inter', textAlign: 'center' },

  primaryBtn: {
    alignSelf: 'stretch', marginTop: 6,
    backgroundColor: C.cyan700, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnText: { color: C.white, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineBtn: {
    alignSelf: 'stretch', flexDirection: 'row', gap: 6, justifyContent: 'center',
    borderWidth: 1, borderColor: C.fieldBorder, borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  outlineBtnText: { color: C.ink700, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  link: { color: C.cyan700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter', marginTop: 4 },
  disabled: { opacity: 0.6 },

  sectionTitle: {
    color: C.ink800, fontSize: 14, fontWeight: '800', fontFamily: 'Inter',
    marginTop: 22, marginBottom: 10,
  },
  explainRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 14, padding: 13, marginBottom: 9,
  },
  explainTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
  explainBody: { color: C.ink500, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter', marginTop: 2 },
  footnote: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 10 },
});
