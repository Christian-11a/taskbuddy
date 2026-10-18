import TermsUpdatePrompt from './src/components/TermsUpdatePrompt';
import { ThemeProvider, useTheme, useThemedStyles, type Palette as ThemePalette } from './src/context/ThemeContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
/**
 * App.tsx — Root navigation controller
 *
 * Architecture:
 *   not signed in → Login / Register
 *   just signed in, first time on this account → Onboarding (once)
 *   'homeowner'   → HO screens with the shared BottomNavBar
 *   'provider'    → SP screens with the shared BottomNavBar
 *
 * Authentication is real: the auth screens call the NestJS backend through
 * AuthContext, which persists the session and resolves the account's role.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, LogBox, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isBackBlockedByScreen } from './src/hooks/useLeaveGuard';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

// The LogBox notification renders over the bottom of the screen and, in dev
// builds, intercepts the bottom navigation bar's touches (BUG-002) — breaking
// navigation for both human developers and the Maestro e2e suite. Any warning
// re-shows it (push-registration failures in FCM-less environments, third-party
// deprecations, etc.), so disable the in-app notification overlay in dev.
// Warnings still print to the Metro console and uncaught errors still redbox;
// this only removes the touch-blocking toast. No-op in production (LogBox is
// dev-only).
if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { ClipboardList, Home, MessageCircle, Search, User } from 'lucide-react-native';
import RootLayout from './app/layout';

// ── Auth screens ──────────────────────────────────────────────────────────────
import SplashScreenComponent from './app/SplashScreen';
import OnboardingScreen from './app/(auth)/screens/OnboardingScreen';
import LoginScreen from './app/(auth)/screens/LoginScreen';
import ForgotPasswordScreen from './app/(auth)/screens/ForgotPasswordScreen';
import RegisterScreen from './app/(auth)/screens/RegisterScreen';
import GoogleRoleSelectionScreen from './app/(auth)/screens/GoogleRoleSelectionScreen';
import GoogleSPDetailsScreen from './app/(auth)/screens/GoogleSPDetailsScreen';

// ── Homeowner screens ─────────────────────────────────────────────────────────
import HOHomeScreen from './app/(homeowner)/screens/HOHomeScreen';
import MyJobs from './app/(homeowner)/screens/HOMyJobs';
import Profile from './app/(homeowner)/screens/HOProfile';
import { useChatUnread } from './src/hooks/useChatUnread';
import ConversationsScreen from './src/components/ConversationsScreen';
import HOCalendarScreen from './app/(homeowner)/screens/HOCalendarScreen';
import HOCreateJobScreen from './app/(homeowner)/screens/HOCreateJobScreen';
import HOJobDetailScreen from './app/(homeowner)/screens/HOJobDetailScreen';
import HOChatScreen from './app/(homeowner)/screens/HOChatScreen';
import HOJobApplicationsScreen from './app/(homeowner)/screens/HOJobApplicationsScreen';
import HOProviderProfileScreen from './app/(homeowner)/screens/HOProviderProfileScreen';
import HOLeaveReviewScreen from './app/(homeowner)/screens/HOLeaveReviewScreen';
import HONotificationsScreen from './app/(homeowner)/screens/HONotificationsScreen';
import HOEditProfileScreen from './app/(homeowner)/screens/HOEditProfileScreen';
import HOSettingsScreen from './app/(homeowner)/screens/HOSettingsScreen';
import HODisputeFilingScreen from './app/(homeowner)/screens/HODisputeFilingScreen';
import HODisputeStatusScreen from './app/(homeowner)/screens/HODisputeStatusScreen';
import HOPaymentsScreen from './app/(homeowner)/screens/HOPaymentsScreen';

// ── Provider screens ──────────────────────────────────────────────────────────
import SPHomeScreen from './app/(provider)/screens/SPHomeScreen';
import SPMyJobsScreen from './app/(provider)/screens/SPMyJobsScreen';
import SPProfileScreen from './app/(provider)/screens/SPProfileScreen';
import SPCalendarScreen from './app/(provider)/screens/SPCalendarScreen';
import SPJobDetailScreen from './app/(provider)/screens/SPJobDetailScreen';
import SPChatScreen from './app/(provider)/screens/SPChatScreen';
import SPNotificationsScreen from './app/(provider)/screens/SPNotificationsScreen';
import SPEditProfileScreen from './app/(provider)/screens/SPEditProfileScreen';
import SPVerificationScreen from './app/(provider)/screens/SPVerificationScreen';
import SPPayoutAccountScreen from './app/(provider)/screens/SPPayoutAccountScreen';
import SPEarningsScreen from './app/(provider)/screens/SPEarningsScreen';
import SPSettingsScreen from './app/(provider)/screens/SPSettingsScreen';
import SPPortfolioScreen from './app/(provider)/screens/SPPortfolioScreen';
import SPCredentialsScreen from './app/(provider)/screens/SPCredentialsScreen';
import SPSkillRequestScreen from './app/(provider)/screens/SPSkillRequestScreen';

// ── Shared navigation components ──────────────────────────────────────────────
import BottomNavBar, { BottomNavItem } from './src/components/BottomNavBar';
import HelpSupportScreen from './src/components/HelpSupportScreen';
import TourFinishCard from './src/components/tour/TourFinishCard';
import {
  TourProvider, useTour, hasCompletedTour, hasDismissedTourOffer, markTourCompleted, markTourOfferDismissed,
} from './src/components/tour';
import ScreenFrame from './src/components/ScreenFrame';

import { ToastHost, showToast } from './src/components/Toast';
import ScreenTransition, { useTransitionDirection } from './src/components/ui/ScreenTransition';
import ViewSwitch from './src/components/ui/ViewSwitch';
import { clearRetainedState } from './src/hooks/useRetainedState';

// ── Types ─────────────────────────────────────────────────────────────────────
import { HOScreen, SPScreen } from './src/types/navigation';

// ── Auth ───────────────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { hasCompletedOnboarding, markOnboardingCompleted } from './src/lib/onboarding';
import { firstNameFrom, tourSteps, type FinishAction } from './src/lib/tourContent';
import {
  firstRunKind, homeContentReady, idleTourFlow, nextTourFlow, shouldOfferTour, shouldStartTour, TOUR_CONTENT_POLL_MS,
  welcomeHoldsPushes, type TourFlow,
} from './src/lib/tourFlow';
import { api } from './src/lib/api';
import { consumeLastNotificationTap, subscribeToNotificationTaps } from './src/lib/pushNotifications';
import { resolveNotificationTarget } from './src/lib/notificationRouting';
import { warmUpServer } from './src/lib/warmUp';
import { profileReadyToVerify } from './src/lib/verifyReady';

/** The tab list with the unread-chat count on the Messages tab. */
export function withMessagesBadge<T extends string>(
  tabs: readonly BottomNavItem<T>[],
  unread: number,
): BottomNavItem<T>[] {
  return tabs.map((tab) => (tab.key === 'Messages' ? { ...tab, badge: unread } : tab));
}

export const HOMEOWNER_TABS: readonly BottomNavItem<HOScreen>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList, tourId: 'jobs' },
  { key: 'Messages', label: 'Messages', icon: MessageCircle },
  { key: 'Profile', label: 'Profile', icon: User },
];

// Plain tabs and no floating button: providers browse and claim jobs, they
// don't post them. Calendar is a view of My Work (see JobsView below).
export const PROVIDER_TABS: readonly BottomNavItem<SPScreen>[] = [
  { key: 'Dashboard', label: 'Feed', icon: Search },
  { key: 'My Jobs', label: 'My Work', icon: ClipboardList, tourId: 'work' },
  { key: 'Messages', label: 'Messages', icon: MessageCircle },
  { key: 'Profile', label: 'Profile', icon: User },
];

// My Jobs / My Work show the job list, or the calendar behind the List/Calendar
// switch. Calendar is not a tab: navigating to 'Calendar' opens My Jobs / My
// Work in calendar view. The view survives tab switches and resets on logout.
type JobsView = 'list' | 'calendar';
const JOBS_VIEW_OPTIONS = [
  { key: 'list', label: 'List' },
  { key: 'calendar', label: 'Calendar' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Root app state
// ─────────────────────────────────────────────────────────────────────────────

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

type PreAuthScreen = 'login' | 'forgotPassword' | 'register';

/**
 * Both roles' `*Back()` used to just jump to the active bottom-nav tab,
 * regardless of how the current screen was reached — so e.g. Profile → Edit
 * Profile → back landed on the tab (Feed/Home), skipping Profile entirely.
 * These stacks record the screen (and its selected-id context) navigated
 * away FROM each time a non-tab screen opens, so back can unwind properly.
 */
interface HOStackEntry { screen: HOScreen; id: string | null }
interface SPStackEntry { screen: SPScreen; id: string | null; urgent: boolean }

/** The signed-in app and its welcome tour. TourProvider sits above every screen, so a tour can cover any of them. */
function AppContent() {
  return (
    <TourProvider>
      <AppFlow />
    </TourProvider>
  );
}

function AppFlow() {
  const { error: themeError } = useTheme();
  useEffect(() => { if (themeError) showToast(`Appearance: ${themeError}`, 'error'); }, [themeError]);
  const { V6Colors, styles } = useThemedStyles(createThemedStyles);
  const {
    initializing, isAuthenticated, isGoogleSignupPending,
    role, profile, providerProfile, isVerified,
    signIn, signUp, signOut, signInWithGoogle, completeGoogleProfile,
    refreshProfile, authError, clearAuthError,
  } = useAuth();
  // Unread chat messages for the Messages tab badge; chat stays out of Notifications.
  const chatUnread = useChatUnread(isAuthenticated && !isGoogleSignupPending);

  // Which pre-auth screen to show while the user is signed out.
  const [preAuth, setPreAuth] = useState<PreAuthScreen>('login');
  // null = still reading the flag for this account; true = show the slides.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // The welcome flow after the intro cards (see tourFlow.ts), and whether the take-the-tour card is offered.
  const [tourFlow, setTourFlow] = useState<TourFlow>(idleTourFlow);
  const [tourOfferOpen, setTourOfferOpen] = useState(false);
  const { startTour, stopTour, anchorState } = useTour();
  // A tapped notification waits for the whole welcome (see welcomeHoldsPushes).
  const pushHeld = welcomeHoldsPushes(tourFlow);
  const firstName = firstNameFrom(profile?.full_name);
  // The splash plays for a minimum duration; we also wait for session restore.
  const [minSplashDone, setMinSplashDone] = useState(false);
  // Sub-screen within the Google signup pending gate (role → SP details)
  const [googleSubScreen, setGoogleSubScreen] = useState<'role' | 'sp-details' | 'client-details'>('role');

  const handleLogout = () => {
    void signOut();
    clearRetainedState();
    stopTour();
    setTourFlow(idleTourFlow);
    setTourOfferOpen(false);
    setPreAuth('login');
    setShowOnboarding(null);
    setHOTab('Home');
    setHOScreen('Home');
    setHOStack([]);
    setHOJobsView('list');
    setSPTab('Dashboard');
    setSPScreen('Dashboard');
    setSPStack([]);
    setSPJobsView('list');
  };

  // ── HO navigation state ───────────────────────────────────────────────────
  const [hoTab, setHOTab] = useState<HOScreen>('Home');
  const [hoScreen, setHOScreen] = useState<HOScreen>('Home'); // for non-tab sub-screens
  const [hoSelectedId, setHOSelectedId] = useState<string | null>(null); // selected job/provider context
  const [hoStack, setHOStack] = useState<HOStackEntry[]>([]); // non-tab screens navigated away from
  const [hoJobsView, setHOJobsView] = useState<JobsView>('list'); // My Jobs: list or calendar

  // ── SP navigation state ───────────────────────────────────────────────────
  const [spTab, setSPTab] = useState<SPScreen>('Dashboard');
  const [spScreen, setSPScreen] = useState<SPScreen>('Dashboard');
  const [spUrgentJob, setSPUrgentJob] = useState(false);
  const [spJobId, setSPJobId] = useState<string | null>(null);
  const [spStack, setSPStack] = useState<SPStackEntry[]>([]); // non-tab screens navigated away from
  const [spJobsView, setSPJobsView] = useState<JobsView>('list'); // My Work: list or calendar

  const HO_TAB_SCREENS: HOScreen[] = ['Home', 'My Jobs', 'Messages', 'Profile'];
  const SP_TAB_SCREENS: SPScreen[] = ['Dashboard', 'My Jobs', 'Messages', 'Profile'];

  // ── HO helpers ────────────────────────────────────────────────────────────
  // Jumping to a tab is a "root" navigation — it clears the back stack rather
  // than pushing onto it, same as tapping a tab in a native app. Create Job is
  // the one exception: it pushes onto the stack like an ordinary screen (so
  // "My Jobs" → New → back returns to My Jobs, not Home), and its own
  // onBack/onSuccess handlers land it on the right tab when the flow ends.
  const hoNavigate = (screen: HOScreen, id?: string) => {
    // Calendar is a view of My Jobs, not a tab of its own.
    if (screen === 'Calendar') {
      setHOJobsView('calendar');
      hoNavigate('My Jobs', id);
      return;
    }
    if (HO_TAB_SCREENS.includes(screen)) {
      setHOStack([]);
      setHOTab(screen);
      setHOScreen(screen);
      if (id !== undefined) setHOSelectedId(id);
      return;
    }
    if (screen === 'Create Job') {
      setHOStack((prev) => [...prev, { screen: hoScreen, id: hoSelectedId }]);
      // `id` here is a category id from Home's "Book a Job" strip. Always
      // assign it — including clearing it when the flow is opened without one
      // (My Jobs' "New" button) — so a previous tile's category can't leak
      // into the next job.
      setHOSelectedId(id ?? null);
      setHOScreen(screen);
      return;
    }
    setHOStack((prev) => [...prev, { screen: hoScreen, id: hoSelectedId }]);
    if (id !== undefined) setHOSelectedId(id);
    setHOScreen(screen);
  };

  const hoBack = () => {
    setHOStack((prev) => {
      if (prev.length === 0) {
        setHOScreen(hoTab);
        return prev;
      }
      const last = prev[prev.length - 1];
      setHOScreen(last.screen);
      setHOSelectedId(last.id);
      return prev.slice(0, -1);
    });
  };

  // ── SP helpers ────────────────────────────────────────────────────────────
  const spNavigate = (screen: SPScreen, jobId?: string) => {
    // Calendar is a view of My Work, not a tab of its own.
    if (screen === 'Calendar') {
      setSPJobsView('calendar');
      spNavigate('My Jobs', jobId);
      return;
    }
    if (SP_TAB_SCREENS.includes(screen)) {
      setSPStack([]);
      setSPUrgentJob(false);
      setSPTab(screen);
      setSPScreen(screen);
      if (jobId !== undefined) setSPJobId(jobId);
      return;
    }
    setSPStack((prev) => [...prev, { screen: spScreen, id: spJobId, urgent: spUrgentJob }]);
    if (jobId !== undefined) setSPJobId(jobId);
    if (screen === 'Urgent Job') setSPUrgentJob(true);
    setSPScreen(screen);
  };

  const spBack = () => {
    setSPStack((prev) => {
      if (prev.length === 0) {
        setSPUrgentJob(false);
        setSPScreen(spTab);
        return prev;
      }
      const last = prev[prev.length - 1];
      setSPScreen(last.screen);
      setSPJobId(last.id);
      setSPUrgentJob(last.urgent);
      return prev.slice(0, -1);
    });
  };

  // BUG-003: the app has no BackHandler, so Android's hardware/gesture back
  // falls through to its default behavior (exit the Activity) from any nested
  // screen instead of popping one level like the in-app back arrows do.
  // Reuses the same hoBack/spBack/hoNavigate/spNavigate the in-app arrows call
  // — hardware back gets identical behavior, not a separate nav path. Returning
  // `false` only when already on a role's home/dashboard tab (or the login
  // screen) lets the OS's real exit happen where it should.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // A form with unsaved changes is asking about leaving (useLeaveGuard). Step aside so its question wins.
      if (isBackBlockedByScreen()) return false;
      if (!isAuthenticated) {
        if (preAuth !== 'login') {
          setPreAuth('login');
          return true;
        }
        return false;
      }

      if (isGoogleSignupPending) {
        if (googleSubScreen === 'sp-details' || googleSubScreen === 'client-details') {
          setGoogleSubScreen('role');
          return true;
        }
        return false;
      }

      if (showOnboarding) {
        return false;
      }

      if (role === 'homeowner') {
        if (hoStack.length > 0 || hoScreen !== hoTab) {
          hoBack();
          return true;
        }
        if (hoTab !== 'Home') {
          hoNavigate('Home');
          return true;
        }
        return false;
      }

      if (role === 'provider') {
        if (spStack.length > 0 || spScreen !== spTab) {
          spBack();
          return true;
        }
        if (spTab !== 'Dashboard') {
          spNavigate('Dashboard');
          return true;
        }
        return false;
      }

      return false;
    });

    return () => sub.remove();
  }, [
    isAuthenticated, preAuth,
    isGoogleSignupPending, googleSubScreen,
    showOnboarding,
    role, hoScreen, hoTab, hoStack,
    spScreen, spTab, spStack,
  ]);

  // ── Push-tap routing ──────────────────────────────────────────────────────
  // A tapped push can land before auth/onboarding gates have settled (cold
  // start especially), so the payload is parked here and only acted on once
  // the second effect below sees a stable, signed-in, fully-onboarded state.
  const [pendingPushTarget, setPendingPushTarget] = useState<Record<string, string> | null>(null);
  const handledNotificationIds = useRef(new Set<string>());
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const profileIdRef = useRef(profile?.id);
  profileIdRef.current = profile?.id;
  const hoNavigateRef = useRef(hoNavigate);
  hoNavigateRef.current = hoNavigate;
  const spNavigateRef = useRef(spNavigate);
  spNavigateRef.current = spNavigate;

  const acceptTap = useCallback((data: Record<string, string>) => {
    if (!isAuthenticatedRef.current || data.recipient_id !== profileIdRef.current) return;
    const id = data.notification_id;
    if (id && handledNotificationIds.current.has(id)) return;
    if (id) handledNotificationIds.current.add(id);
    setPendingPushTarget(data);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    void subscribeToNotificationTaps(acceptTap).then((unsub) => {
      if (disposed) unsub();
      else unsubscribe = unsub;
    }).catch((err: Error) => showToast(err.message, 'error'));
    return () => { disposed = true; unsubscribe(); };
  }, [acceptTap]);

  useEffect(() => {
    if (!isAuthenticated || !profile?.id) return;
    let active = true;
    void consumeLastNotificationTap().then((data) => {
      if (active && data) acceptTap(data);
    }).catch((err: Error) => showToast(err.message, 'error'));
    return () => { active = false; };
  }, [isAuthenticated, profile?.id, acceptTap]);

  useEffect(() => {
    if (!pendingPushTarget || pendingPushTarget.recipient_id !== profile?.id) return;
    // The welcome holds the push until it is over, so its tour and finish card never sit over the screen the push opens.
    if (!isAuthenticated || isGoogleSignupPending || showOnboarding !== false || !role || pushHeld) return;

    const target = resolveNotificationTarget(role, pendingPushTarget, pendingPushTarget.target);
    if (target.kind === 'proposals') {
      hoNavigateRef.current('Job Applications', target.jobId);
    } else if (target.kind === 'chat' || target.kind === 'dispute') {
      const screen = target.kind === 'chat' ? 'Chat' : 'Dispute Status';
      if (role === 'homeowner') hoNavigateRef.current(screen, target.jobId);
      else spNavigateRef.current(screen, target.jobId);
    } else if (target.kind === 'services') {
      spNavigateRef.current('My Services');
    } else if (target.kind === 'payouts') {
      spNavigateRef.current('Payout Account');
    } else if (target.kind === 'verification') {
      spNavigateRef.current('Verification');
    } else if (target.kind === 'job') {
      if (role === 'homeowner') hoNavigateRef.current('Job Detail', target.jobId);
      else spNavigateRef.current('Job Detail', target.jobId);
    } else {
      if (role === 'homeowner') hoNavigateRef.current('Notifications');
      else spNavigateRef.current('Notifications');
    }

    const notificationId = pendingPushTarget.notification_id;
    if (notificationId) void api.markNotificationRead(notificationId).catch((err: Error) => showToast(err.message, 'error'));
    setPendingPushTarget(null);
  }, [pendingPushTarget, isAuthenticated, isGoogleSignupPending, showOnboarding, role, profile?.id, pushHeld]);

  useEffect(() => {
    // Pre-warm the browser on Android so Google OAuth opens instantly.
    WebBrowser.warmUpAsync().catch(() => {});

    // 500 ms is enough to show the splash brand mark; session restore
    // runs in parallel and will hold the gate if it takes longer.
    const splashTimer = setTimeout(() => {
      setMinSplashDone(true);
      ExpoSplashScreen.hideAsync().catch(() => {});
    }, 500);

    return () => {
      clearTimeout(splashTimer);
      WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);

  // Read the onboarding flag for whoever is signed in. Runs on every sign-in
  // (and on restore of a persisted session). Only a new account gets the slides,
  // right after its first login. An older account on a device with no flags (a new
  // phone, a reinstall, Expo Go) is marked done here and sees only the tour offer
  // (see firstRunKind in tourFlow.ts).
  const profileId = profile?.id ?? null;
  const profileCreatedAt = profile?.created_at ?? null;
  useEffect(() => {
    if (!profileId) {
      setShowOnboarding(null);
      setTourOfferOpen(false);
      // The session can end on its own (a rejected token, see AuthContext). Then the welcome ends with it, the
      // same as a sign-out, so no tour is left up over Login.
      stopTour();
      setTourFlow(idleTourFlow);
      return;
    }
    let mounted = true;
    // Read once per sign-in, so the take-the-tour card only ever means an existing account (not this session's first run).
    void Promise.all([
      hasCompletedOnboarding(profileId),
      hasCompletedTour(profileId),
      hasDismissedTourOffer(profileId),
    ]).then(([done, toured, dismissed]) => {
      if (!mounted) return;
      const kind = firstRunKind({ onboardingDone: done, createdAt: profileCreatedAt, now: Date.now() });
      if (kind === 'offerOnly') void markOnboardingCompleted(profileId);
      setShowOnboarding(kind === 'full');
      setTourOfferOpen(shouldOfferTour({ onboardingDone: kind !== 'full', tourDone: toured, offerDismissed: dismissed }));
    });
    return () => {
      mounted = false;
    };
  }, [profileId, profileCreatedAt]);

  // ── Welcome flow: intro cards, then the spotlight tour, then the finish card (phases in tourFlow.ts) ──
  // "Show me around" on the last intro card of a first run. The tour starts once Home is on screen.
  const finishOnboarding = () => {
    if (profileId) void markOnboardingCompleted(profileId);
    setShowOnboarding(false);
    setTourFlow((flow) => nextTourFlow(flow, { type: 'introDone', firstRun: true }));
  };

  // Ends the flow early (Skip, Android Back, sign-out): the tour counts as done for this account and no finish card follows.
  const endTourFlow = () => {
    if (profileId) void markTourCompleted(profileId);
    setTourOfferOpen(false);
    setTourFlow((flow) => nextTourFlow(flow, { type: 'ended' }));
  };

  // Skip on a first run's intro cards: the onboarding and the tour are both done for this account.
  const skipOnboarding = () => {
    if (profileId) void markOnboardingCompleted(profileId);
    setShowOnboarding(false);
    endTourFlow();
  };

  // Opens the welcome walkthrough again, from Help or the Home card: the intro cards first, then the tour.
  const openTutorial = () => {
    setTourOfferOpen(false);
    setTourFlow(idleTourFlow);
    if (role === 'homeowner') hoNavigate('Tutorial');
    else spNavigate('Tutorial');
  };

  // The replay's intro cards are done: back to the first tab, where the tour starts. No confetti on a replay.
  const finishReplay = () => {
    if (role === 'homeowner') hoNavigate('Home');
    else spNavigate('Dashboard');
    setTourFlow((flow) => nextTourFlow(flow, { type: 'introDone', firstRun: false }));
  };

  // Skip (Close) on a replay: back to the first tab with no tour.
  const skipReplay = () => {
    endTourFlow();
    if (role === 'homeowner') hoNavigate('Home');
    else spNavigate('Dashboard');
  };

  // The take-the-tour card: taking it counts as dismissing it, so it never comes back.
  const startTourFromOffer = () => {
    if (profileId) void markTourOfferDismissed(profileId);
    openTutorial();
  };
  const dismissTourOffer = () => {
    if (profileId) void markTourOfferDismissed(profileId);
    setTourOfferOpen(false);
  };
  const tourOffer = tourOfferOpen ? { onStart: startTourFromOffer, onDismiss: dismissTourOffer } : undefined;

  // The finish card's buttons close it for good, then go where the button points.
  const handleFinishAction = (action: FinishAction) => {
    endTourFlow();
    if (action === 'postJob' && role === 'homeowner') hoNavigate('Create Job');
    if (action === 'getVerified' && role === 'provider') spNavigate('Verification');
    if (action === 'setupProfile' && role === 'provider') spNavigate('Edit Profile');
    if (action === 'linkPayout' && role === 'provider') spNavigate('Payout Account');
  };

  // Home is on screen: the tour is due once Home's real content is up (its controls rendered, not still behind the
  // loading skeleton). The check is polled lightly, and the wait ends after TOUR_CONTENT_WAIT_MS whatever the state.
  const onHome = showOnboarding === false && !!role && (role === 'homeowner' ? hoScreen === 'Home' : spScreen === 'Dashboard');
  useEffect(() => {
    if (tourFlow.phase !== 'waiting' || !onHome || !role) return;
    const steps = tourSteps(role, isVerified);
    const waitedFrom = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const ready = homeContentReady(steps.map((step) => anchorState(step.anchorId)));
      if (shouldStartTour(ready, Date.now() - waitedFrom)) {
        setTourFlow((flow) => nextTourFlow(flow, { type: 'homeReady' }));
      } else {
        timer = setTimeout(check, TOUR_CONTENT_POLL_MS);
      }
    };
    check();
    return () => clearTimeout(timer);
    // Only the phase and Home's visibility matter here: the tour controls are rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourFlow.phase, onHome]);

  // The phase turns to touring once, so the tour starts once. Its own callbacks move the flow on.
  useEffect(() => {
    if (tourFlow.phase !== 'touring' || !role) return;
    startTour({
      steps: tourSteps(role, isVerified),
      onFinish: () => setTourFlow((flow) => nextTourFlow(flow, { type: 'tourFinished' })),
      onSkip: endTourFlow,
    });
    // Only the phase matters here: startTour and endTourFlow are rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourFlow.phase]);

  // Whether a provider has a payout account, for the finish card's last step. A failed lookup is "unknown",
  // treated as linked so nothing new shows.
  const [hasPayoutAccount, setHasPayoutAccount] = useState(true);
  const finishingAsProvider = tourFlow.phase === 'finishing' && isAuthenticated && role === 'provider';
  useEffect(() => {
    if (!finishingAsProvider) return;
    let cancelled = false;
    (async () => {
      try {
        const account = await api.payoutAccount();
        if (!cancelled) setHasPayoutAccount(!!account);
      } catch {
        if (!cancelled) setHasPayoutAccount(true);
      }
    })();
    return () => { cancelled = true; };
  }, [finishingAsProvider]);

  // The finish card, once the tour is over. It is drawn beside whichever screen is up (see wrap).
  const tourFinish = tourFlow.phase === 'finishing' && isAuthenticated && role ? (
    <TourFinishCard
      role={role}
      verified={isVerified}
      hasServiceProfile={profileReadyToVerify(profile, providerProfile)}
      hasPayoutAccount={hasPayoutAccount}
      firstName={firstName}
      firstRun={tourFlow.firstRun}
      onAction={handleFinishAction}
    />
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Auth flow
  // ─────────────────────────────────────────────────────────────────────────

  // ── Screen transition (visual only) ─────────────────────────────────────
  // Mirrors the branch order below to name the screen being shown and how
  // deep it is, so the wrapper can slide forward/back. It reads state only;
  // tab screens share one key so switching tabs never animates.
  const transitionKey =
    !minSplashDone || initializing ? 'splash'
      : !isAuthenticated ? `auth:${preAuth}`
      : isGoogleSignupPending ? `google:${googleSubScreen}`
      : showOnboarding === null ? 'splash'
      : showOnboarding ? 'onboarding'
      : role === 'homeowner'
        ? (HO_TAB_SCREENS.includes(hoScreen) ? 'ho:tabs' : `ho:${hoScreen}`)
        : (SP_TAB_SCREENS.includes(spScreen) ? 'sp:tabs' : `sp:${spScreen === 'Urgent Job' ? 'Job Detail' : spScreen}`);
  const transitionDepth =
    !isAuthenticated ? (preAuth === 'login' ? 0 : 1)
      : isGoogleSignupPending ? (googleSubScreen === 'role' ? 0 : 1)
      : role === 'homeowner' ? (HO_TAB_SCREENS.includes(hoScreen) ? 0 : hoStack.length + 1)
      : (SP_TAB_SCREENS.includes(spScreen) ? 0 : spStack.length + 1);
  const transitionDirection = useTransitionDirection(transitionKey, transitionDepth);
  // Every screen goes through here, with the finish card beside it, so the card shows whichever screen the tour ends on.
  const wrap = (screen: React.ReactElement) => (
    <>
      <ScreenTransition screenKey={transitionKey} direction={transitionDirection}>{screen}</ScreenTransition>
      {tourFinish}
    </>
  );

  // Hold on the splash until the minimum time has elapsed AND any persisted
  // session has finished restoring, so we never flash the login screen first.
  if (!minSplashDone || initializing) {
    return wrap(<SplashScreenComponent />);
  }

  if (!isAuthenticated) {
    if (preAuth === 'login') {
      return wrap(
        <LoginScreen
          onLogin={signIn}
          onGoogleSignIn={signInWithGoogle}
          onSignUp={() => setPreAuth('register')}
          onForgotPassword={() => setPreAuth('forgotPassword')}
          signInError={authError}
          onClearSignInError={clearAuthError}
        />
      );
    }

    if (preAuth === 'forgotPassword') {
      return wrap(
        // A successful reset returns a session, so the screen finishes signed
        // in and the isAuthenticated branch above takes over — there is no
        // "done" callback to route on.
        <ForgotPasswordScreen onBackToLogin={() => setPreAuth('login')} />
      );
    }

    // preAuth === 'register'
    return wrap(
      <RegisterScreen
        onRegister={(input) => signUp({
          email: input.email,
          password: input.password,
          fullName: input.fullName,
          role: input.role,
          categoryId: input.categoryId,
          consentedTerms: input.consentedTerms,
          consentedPrivacy: input.consentedPrivacy,
          consentedDataCollection: input.consentedDataCollection,
        })}
        onGoogleSignIn={signInWithGoogle}
        onLogin={() => setPreAuth('login')}
      />
    );
  }

  // ── Google signup pending gate ────────────────────────────────────
  // New Google OAuth users haven't chosen a role yet. Show the role selection
  // screen (and SP details screen if they pick Service Provider) before any
  // dashboard routing. Once completeGoogleProfile() clears the flag the gate
  // disappears automatically.
  if (isAuthenticated && isGoogleSignupPending) {
    if (googleSubScreen === 'client-details') {
      return wrap(
        <GoogleSPDetailsScreen
          role="client"
          onBack={() => setGoogleSubScreen('role')}
          onComplete={async (input) => {
            await completeGoogleProfile({
              role: 'homeowner',
              consentedTerms: input.consentedTerms,
              consentedPrivacy: input.consentedPrivacy,
              consentedDataCollection: input.consentedDataCollection,
            });
          }}
        />
      );
    }

    if (googleSubScreen === 'sp-details') {
      return wrap(
        <GoogleSPDetailsScreen
          onBack={() => setGoogleSubScreen('role')}
          onComplete={async (input) => {
            await completeGoogleProfile({
              role: 'provider',
              categoryId: input.categoryId,
              consentedTerms: input.consentedTerms,
              consentedPrivacy: input.consentedPrivacy,
              consentedDataCollection: input.consentedDataCollection,
            });
            // After success the flag is cleared; the SP verification gate
            // (below) will take over automatically via re-render.
          }}
        />
      );
    }

    return wrap(
      <GoogleRoleSelectionScreen
        email={profile?.email as string | null | undefined}
        onSelectHomeowner={async () => {
          // A client accepts the same three consents as a provider before the profile is saved.
          setGoogleSubScreen('client-details');
        }}
        onSelectProvider={() => setGoogleSubScreen('sp-details')}
      />
    );
  }

  // ── First-run onboarding gate ─────────────────────────────────────────────
  // Placed after the Google gate so an OAuth user picks their role first — the
  // slides are the last thing between a finished account and its dashboard.
  // While the flag is still being read we hold on the splash rather than
  // flashing the dashboard and then covering it with the slides.
  if (showOnboarding === null) {
    return wrap(<SplashScreenComponent />);
  }
  if (showOnboarding) {
    // "Show me around" starts the spotlight tour on Home. Skip leaves the welcome
    // for good: no tour and no finish card.
    return wrap(<OnboardingScreen role={role} firstName={firstName} onFinish={finishOnboarding} onLogin={skipOnboarding} />);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authenticated — Homeowner
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'homeowner') {
    // Non-tab sub-screens (no bottom nav)
    if (hoScreen === 'Job Detail') {
      return wrap(
        <ScreenFrame bottomColor={V6Colors.surface}>
          <HOJobDetailScreen key={hoSelectedId ?? 'none'} jobId={hoSelectedId} onBack={hoBack} onNavigate={hoNavigate} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Job Applications') {
      return wrap(
        <ScreenFrame>
          <HOJobApplicationsScreen jobId={hoSelectedId} onBack={hoBack} onNavigate={hoNavigate} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Provider Profile') {
      return wrap(
        <ScreenFrame>
          <HOProviderProfileScreen id={hoSelectedId ?? ''} onBack={hoBack} onNavigate={hoNavigate} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Leave Review') {
      return wrap(
        <ScreenFrame bottomColor={V6Colors.surface}>
          <HOLeaveReviewScreen jobId={hoSelectedId ?? ''} onSubmitted={hoBack} onBack={hoBack} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Chat') {
      return wrap(
        <ScreenFrame bottomColor={V6Colors.surface}>
          <HOChatScreen
            jobId={hoSelectedId}
            onBack={hoBack}
            onViewJob={() => {
              setHOStack([]);
              setHOScreen('Job Detail');
            }}
          />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Dispute Filing') {
      return wrap(
        <ScreenFrame bottomColor={V6Colors.surface}>
          <HODisputeFilingScreen jobId={hoSelectedId} onBack={hoBack} onSubmitted={hoBack} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Dispute Status') {
      return wrap(
        <ScreenFrame>
          <HODisputeStatusScreen jobId={hoSelectedId} onBack={hoBack} onMessage={() => hoNavigate('Chat', hoSelectedId ?? undefined)} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Payments') {
      return wrap(
        <ScreenFrame>
          <HOPaymentsScreen onBack={hoBack} onOpenJob={(jobId) => hoNavigate('Job Detail', jobId)} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Notifications') {
      return wrap(
        <ScreenFrame>
          <HONotificationsScreen
            onBack={hoBack}
            onOpenJob={(jobId) => hoNavigate('Job Detail', jobId)}
            onOpenProposals={(jobId) => hoNavigate('Job Applications', jobId)}
            onOpenChat={(jobId) => hoNavigate('Chat', jobId)}
            onOpenDispute={(jobId) => hoNavigate('Dispute Status', jobId)}
          />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Edit Profile') {
      return wrap(
        <ScreenFrame>
          <HOEditProfileScreen onBack={hoBack} onSave={hoBack} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Settings') {
      return wrap(
        <ScreenFrame>
          <HOSettingsScreen onBack={hoBack} onLogout={handleLogout} />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Help & Support') {
      return wrap(
        <ScreenFrame>
          <HelpSupportScreen
            role="homeowner"
            onBack={hoBack}
            onReplayTour={openTutorial}
          />
        </ScreenFrame>
      );
    }
    if (hoScreen === 'Tutorial') {
      return wrap(
        <OnboardingScreen role="homeowner" firstName={firstName} replay onFinish={finishReplay} onLogin={skipReplay} />,
      );
    }
    if (hoScreen === 'Create Job') {
      return wrap(
        <View style={styles.screen}>
          <HOCreateJobScreen
            initialCategoryId={Number.isFinite(Number(hoSelectedId)) ? Number(hoSelectedId) : null}
            onBack={hoBack}
            onSuccess={() => {
              setHOStack([]);
              setHOTab('My Jobs');
              setHOScreen('My Jobs');
            }}
          />
        </View>
      );
    }
    // The List/Calendar switch sits at the right end of the My Jobs title row.
    const hoJobsSwitch = (
      <ViewSwitch options={JOBS_VIEW_OPTIONS} value={hoJobsView} onChange={setHOJobsView} />
    );

    // Tab screens (with bottom nav)
    const renderHOTabContent = () => {
      switch (hoTab) {
        case 'Home':
          return <HOHomeScreen onNavigate={hoNavigate} tourOffer={tourOffer} />;
        case 'My Jobs':
          return hoJobsView === 'calendar'
            ? <HOCalendarScreen title="My Jobs" headerRight={hoJobsSwitch} onNavigate={hoNavigate} />
            : <MyJobs headerRight={hoJobsSwitch} onNavigate={hoNavigate} />;
        case 'Messages':
          return <ConversationsScreen onOpenChat={(jobId) => hoNavigate('Chat', jobId)} />;
        case 'Profile':
          // No onBack: the Profile tab has no back arrow. Edit Profile and the
          // other pushed screens still return here through the back stack.
          return <Profile onNavigate={hoNavigate} onLogout={handleLogout} />;
        default:
          return <HOHomeScreen onNavigate={hoNavigate} tourOffer={tourOffer} />;
      }
    };

    return wrap(
      // Not ScreenFrame: BottomNavBar already pads insets.bottom itself
      // (BUG-002), so wrapping in ScreenFrame double-padded the bottom on
      // every homeowner tab screen. SP tabs below already avoid this.
      <View style={styles.screen}>
        <View style={styles.tabContent}>{renderHOTabContent()}</View>
        <BottomNavBar
          activeTab={hoTab}
          tabs={withMessagesBadge(HOMEOWNER_TABS, chatUnread)}
          onTabPress={hoNavigate}
        />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authenticated — Service Provider
  // ─────────────────────────────────────────────────────────────────────────

  // Non-tab sub-screens (no bottom nav)
  if (spScreen === 'Job Detail' || spScreen === 'Urgent Job') {
    return wrap(
      <ScreenFrame bottomColor={V6Colors.surface}>
        <SPJobDetailScreen
          key={spJobId ?? 'none'}
          jobId={spJobId}
          onBack={spBack}
          onNavigate={spNavigate}
          isUrgent={spUrgentJob}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Dispute Filing') {
    return wrap(<ScreenFrame bottomColor={V6Colors.surface}><HODisputeFilingScreen jobId={spJobId} onBack={spBack} onSubmitted={spBack} /></ScreenFrame>);
  }
  if (spScreen === 'Dispute Status') {
    return wrap(<ScreenFrame bottomColor={V6Colors.surface}><HODisputeStatusScreen jobId={spJobId} onBack={spBack} onMessage={() => spNavigate('Chat', spJobId ?? undefined)} /></ScreenFrame>);
  }
  if (spScreen === 'Chat') {
    return wrap(
      <ScreenFrame bottomColor={V6Colors.surface}>
        <SPChatScreen
          jobId={spJobId}
          onBack={spBack}
          onViewJob={() => {
            setSPStack([]);
            setSPScreen('Job Detail');
          }}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Notifications') {
    return wrap(
      <ScreenFrame>
        <SPNotificationsScreen
          onBack={spBack}
          onOpenJob={(jobId) => spNavigate('Job Detail', jobId)}
          onOpenChat={(jobId) => spNavigate('Chat', jobId)}
          onOpenDispute={(jobId) => spNavigate('Dispute Status', jobId)}
          onOpenServices={() => spNavigate('My Services')}
          onOpenPayouts={() => spNavigate('Payout Account')}
          onOpenVerification={() => spNavigate('Verification')}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Edit Profile') {
    return wrap(
      <ScreenFrame>
        <SPEditProfileScreen
          onBack={spBack}
          onSave={spBack}
          onManageServices={() => spNavigate('My Services')}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Settings') {
    return wrap(
      <ScreenFrame>
        <SPSettingsScreen onBack={spBack} onLogout={handleLogout} />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Help & Support') {
    return wrap(
      <ScreenFrame>
        <HelpSupportScreen
          role="provider"
          onBack={spBack}
          onReplayTour={openTutorial}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Tutorial') {
    return wrap(
      <OnboardingScreen role="provider" firstName={firstName} replay onFinish={finishReplay} onLogin={skipReplay} />,
    );
  }
  if (spScreen === 'Verification') {
    return wrap(
      <ScreenFrame>
        <SPVerificationScreen
          onBack={() => {
            // A verification may have completed on this visit even if the
            // provider leaves with back instead of "Go to Dashboard".
            void refreshProfile();
            spBack();
          }}
          // The same destination as the finish card's "Finish my profile" (setupProfile).
          onEditProfile={() => spNavigate('Edit Profile')}
          onVerified={async () => {
            await refreshProfile();
            spBack();
          }}
        />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Portfolio') return wrap(<ScreenFrame bottomColor={V6Colors.surface}><SPPortfolioScreen onBack={spBack}/></ScreenFrame>);
  if (spScreen === 'Credentials') return wrap(<ScreenFrame bottomColor={V6Colors.surface}><SPCredentialsScreen onBack={spBack}/></ScreenFrame>);
  if (spScreen === 'My Services') {
    return wrap(
      <ScreenFrame bottomColor={V6Colors.surface}>
        <SPSkillRequestScreen onBack={spBack} />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Earnings') {
    return wrap(
      <ScreenFrame bottomColor={V6Colors.surface}>
        <SPEarningsScreen onBack={spBack} onOpenJob={(jobId) => spNavigate('Job Detail', jobId)} />
      </ScreenFrame>
    );
  }
  if (spScreen === 'Payout Account') {
    return wrap(
      <ScreenFrame bottomColor={V6Colors.surface}>
        <SPPayoutAccountScreen onBack={spBack} />
      </ScreenFrame>
    );
  }
  // The List/Calendar switch sits at the right end of the My Work title row.
  const spJobsSwitch = (
    <ViewSwitch options={JOBS_VIEW_OPTIONS} value={spJobsView} onChange={setSPJobsView} />
  );

  // Tab screens (with bottom nav)
  const renderSPTabContent = () => {
    switch (spTab) {
      case 'Dashboard':
        return <SPHomeScreen onNavigate={spNavigate} tourOffer={tourOffer} />;
      case 'My Jobs':
        return spJobsView === 'calendar'
          ? <SPCalendarScreen title="My Work" headerRight={spJobsSwitch} onNavigate={spNavigate} />
          : <SPMyJobsScreen headerRight={spJobsSwitch} onNavigate={spNavigate} />;
      case 'Messages':
        return <ConversationsScreen onOpenChat={(jobId) => spNavigate('Chat', jobId)} />;
      case 'Profile':
        // No onBack: the Profile tab has no back arrow. Edit Profile and the
        // other pushed screens still return here through the back stack.
        return <SPProfileScreen onNavigate={spNavigate} onLogout={handleLogout} />;
      default:
        return <SPHomeScreen onNavigate={spNavigate} tourOffer={tourOffer} />;
    }
  };

  return wrap(
    <View style={styles.screen}>
      <View style={styles.tabContent}>{renderSPTabContent()}</View>
      <BottomNavBar activeTab={spTab} tabs={withMessagesBadge(PROVIDER_TABS, chatUnread)} onTabPress={spNavigate} />
    </View>
  );
}

/** Every route above is rendered inside the shared responsive root layout. */
export default function App() {
  // Wakes the API server while the person is still on the first screen, before they log in (see warmUp.ts).
  useEffect(() => {
    warmUpServer();
  }, []);

  return (
    <GestureHandlerRootView style={rootStyles.fill}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <NotificationsProvider>
              <BottomSheetModalProvider>
                <RootLayout>
                  <AppContent />
                  <TermsUpdatePrompt />
                  <ToastHost />
                </RootLayout>
              </BottomSheetModalProvider>
            </NotificationsProvider>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const rootStyles = StyleSheet.create({ fill: { flex: 1 } });

// ─────────────────────────────────────────────────────────────────────────────

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: V6Colors.canvas,
    },
    tabContent: {
      flex: 1,
    },
  });
  return { Colors, V6Colors, styles };
}
