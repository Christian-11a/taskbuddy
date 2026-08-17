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

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { CalendarDays, CirclePlus, ClipboardList, Home, Search, Wallet } from 'lucide-react-native';
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
import HOWalletScreen from './app/(homeowner)/screens/HOWalletScreen';
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

// ── Provider screens ──────────────────────────────────────────────────────────
import SPHomeScreen from './app/(provider)/screens/SPHomeScreen';
import SPMyJobsScreen from './app/(provider)/screens/SPMyJobsScreen';
import SPProfileScreen from './app/(provider)/screens/SPProfileScreen';
import SPWalletScreen from './app/(provider)/screens/SPWalletScreen';
import SPCalendarScreen from './app/(provider)/screens/SPCalendarScreen';
import SPJobDetailScreen from './app/(provider)/screens/SPJobDetailScreen';
import SPChatScreen from './app/(provider)/screens/SPChatScreen';
import SPNotificationsScreen from './app/(provider)/screens/SPNotificationsScreen';
import SPEditProfileScreen from './app/(provider)/screens/SPEditProfileScreen';
import SPVerificationScreen from './app/(provider)/screens/SPVerificationScreen';
import SPSettingsScreen from './app/(provider)/screens/SPSettingsScreen';

// ── Shared navigation components ──────────────────────────────────────────────
import BottomNavBar, { BottomNavItem } from './src/components/BottomNavBar';
import HelpSupportScreen from './src/components/HelpSupportScreen';

// ── Types ─────────────────────────────────────────────────────────────────────
import { HOScreen, SPScreen } from './src/types/navigation';

// ── Auth ───────────────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { hasCompletedOnboarding, markOnboardingCompleted } from './src/lib/onboarding';

const HOMEOWNER_TABS: readonly BottomNavItem<HOScreen>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList },
  { key: 'Create Job', label: 'Create job', icon: CirclePlus, primary: true },
  { key: 'Calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
];

// Matches the mockup's sp-dashboard nav exactly: 4 plain tabs, no FAB (providers
// browse/claim jobs, they don't post them) and no Profile tab (reached via the
// avatar button in Feed's header instead, same pattern as the homeowner side).
const PROVIDER_TABS: readonly BottomNavItem<SPScreen>[] = [
  { key: 'Dashboard', label: 'Feed', icon: Search },
  { key: 'My Jobs', label: 'My Work', icon: ClipboardList },
  { key: 'Calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
];

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

function AppContent() {
  const {
    initializing, isAuthenticated, isGoogleSignupPending,
    role, profile,
    signIn, signUp, signOut, signInWithGoogle, completeGoogleProfile,
    refreshProfile,
  } = useAuth();

  // Which pre-auth screen to show while the user is signed out.
  const [preAuth, setPreAuth] = useState<PreAuthScreen>('login');
  // null = still reading the flag for this account; true = show the slides.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // The splash plays for a minimum duration; we also wait for session restore.
  const [minSplashDone, setMinSplashDone] = useState(false);
  // Sub-screen within the Google signup pending gate (role → SP details)
  const [googleSubScreen, setGoogleSubScreen] = useState<'role' | 'sp-details'>('role');

  const handleLogout = () => {
    void signOut();
    setPreAuth('login');
    setShowOnboarding(null);
    setHOTab('Home');
    setHOScreen('Home');
    setHOStack([]);
    setSPTab('Dashboard');
    setSPScreen('Dashboard');
    setSPStack([]);
  };

  // ── HO navigation state ───────────────────────────────────────────────────
  const [hoTab, setHOTab] = useState<HOScreen>('Home');
  const [hoScreen, setHOScreen] = useState<HOScreen>('Home'); // for non-tab sub-screens
  const [hoSelectedId, setHOSelectedId] = useState<string | null>(null); // selected job/provider context
  const [hoStack, setHOStack] = useState<HOStackEntry[]>([]); // non-tab screens navigated away from

  // ── SP navigation state ───────────────────────────────────────────────────
  const [spTab, setSPTab] = useState<SPScreen>('Dashboard');
  const [spScreen, setSPScreen] = useState<SPScreen>('Dashboard');
  const [spUrgentJob, setSPUrgentJob] = useState(false);
  const [spJobId, setSPJobId] = useState<string | null>(null);
  const [spStack, setSPStack] = useState<SPStackEntry[]>([]); // non-tab screens navigated away from

  const HO_TAB_SCREENS: HOScreen[] = ['Home', 'My Jobs', 'Calendar', 'Wallet'];
  const SP_TAB_SCREENS: SPScreen[] = ['Dashboard', 'My Jobs', 'Calendar', 'Wallet'];

  // ── HO helpers ────────────────────────────────────────────────────────────
  // Jumping to a tab (or the Create Job flow, which has its own onBack/onSuccess
  // that reset the tab directly) is a "root" navigation — it clears the back
  // stack rather than pushing onto it, same as tapping a tab in a native app.
  const hoNavigate = (screen: HOScreen, id?: string) => {
    if (HO_TAB_SCREENS.includes(screen)) {
      setHOStack([]);
      setHOTab(screen);
      setHOScreen(screen);
      if (id !== undefined) setHOSelectedId(id);
      return;
    }
    if (screen === 'Create Job') {
      setHOStack([]);
      // `id` here is a category id from Home's "Book a Job" strip. Always
      // assign it — including clearing it when the flow is opened from the FAB
      // — so a previous tile's category can't leak into the next job.
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
  // (and on restore of a persisted session), so the slides appear exactly once
  // per account: right after the first successful login, never again.
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!profileId) {
      setShowOnboarding(null);
      return;
    }
    let mounted = true;
    void hasCompletedOnboarding(profileId).then((done) => {
      if (mounted) setShowOnboarding(!done);
    });
    return () => {
      mounted = false;
    };
  }, [profileId]);

  const finishOnboarding = () => {
    if (profileId) void markOnboardingCompleted(profileId);
    setShowOnboarding(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Auth flow
  // ─────────────────────────────────────────────────────────────────────────

  // Hold on the splash until the minimum time has elapsed AND any persisted
  // session has finished restoring, so we never flash the login screen first.
  if (!minSplashDone || initializing) {
    return <SplashScreenComponent />;
  }

  if (!isAuthenticated) {
    if (preAuth === 'login') {
      return (
        <LoginScreen
          onLogin={signIn}
          onGoogleSignIn={signInWithGoogle}
          onSignUp={() => setPreAuth('register')}
          onForgotPassword={() => setPreAuth('forgotPassword')}
        />
      );
    }

    if (preAuth === 'forgotPassword') {
      return (
        // A successful reset returns a session, so the screen finishes signed
        // in and the isAuthenticated branch above takes over — there is no
        // "done" callback to route on.
        <ForgotPasswordScreen onBackToLogin={() => setPreAuth('login')} />
      );
    }

    // preAuth === 'register'
    return (
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
          consentedBiometric: input.consentedBiometric,
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
    if (googleSubScreen === 'sp-details') {
      return (
        <GoogleSPDetailsScreen
          onBack={() => setGoogleSubScreen('role')}
          onComplete={async (input) => {
            await completeGoogleProfile({
              role: 'provider',
              categoryId: input.categoryId,
              consentedTerms: input.consentedTerms,
              consentedPrivacy: input.consentedPrivacy,
              consentedDataCollection: input.consentedDataCollection,
              consentedBiometric: input.consentedBiometric,
            });
            // After success the flag is cleared; the SP verification gate
            // (below) will take over automatically via re-render.
          }}
        />
      );
    }

    return (
      <GoogleRoleSelectionScreen
        email={profile?.email as string | null | undefined}
        onSelectHomeowner={async () => {
          await completeGoogleProfile({ role: 'homeowner' });
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
    return <SplashScreenComponent />;
  }
  if (showOnboarding) {
    // Post-login there is nowhere to "skip to" but the dashboard, so Skip and
    // Get Started do the same thing — both count as having seen them.
    return <OnboardingScreen onFinish={finishOnboarding} onLogin={finishOnboarding} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authenticated — Homeowner
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'homeowner') {
    // Non-tab sub-screens (no bottom nav)
    if (hoScreen === 'Job Detail') {
      return (
        <View style={styles.screen}>
          <HOJobDetailScreen jobId={hoSelectedId} onBack={hoBack} onNavigate={hoNavigate} />
        </View>
      );
    }
    if (hoScreen === 'Job Applications') {
      return (
        <View style={styles.screen}>
          <HOJobApplicationsScreen jobId={hoSelectedId} onBack={hoBack} onNavigate={hoNavigate} />
        </View>
      );
    }
    if (hoScreen === 'Provider Profile') {
      return (
        <View style={styles.screen}>
          <HOProviderProfileScreen id={hoSelectedId ?? ''} onBack={hoBack} onNavigate={hoNavigate} />
        </View>
      );
    }
    if (hoScreen === 'Leave Review') {
      return (
        <View style={styles.screen}>
          <HOLeaveReviewScreen jobId={hoSelectedId ?? ''} onSubmitted={hoBack} onBack={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Chat') {
      return (
        <View style={styles.screen}>
          <HOChatScreen jobId={hoSelectedId} onBack={hoBack} onViewJob={() => hoNavigate('Job Detail')} />
        </View>
      );
    }
    if (hoScreen === 'Dispute Filing') {
      return (
        <View style={styles.screen}>
          <HODisputeFilingScreen jobId={hoSelectedId} onBack={hoBack} onSubmitted={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Dispute Status') {
      return (
        <View style={styles.screen}>
          <HODisputeStatusScreen jobId={hoSelectedId} onBack={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Notifications') {
      return (
        <View style={styles.screen}>
          <HONotificationsScreen onBack={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Edit Profile') {
      return (
        <View style={styles.screen}>
          <HOEditProfileScreen onBack={hoBack} onSave={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Settings') {
      return (
        <View style={styles.screen}>
          <HOSettingsScreen onBack={hoBack} onLogout={handleLogout} />
        </View>
      );
    }
    if (hoScreen === 'Help & Support') {
      return (
        <View style={styles.screen}>
          <HelpSupportScreen role="homeowner" onBack={hoBack} />
        </View>
      );
    }
    if (hoScreen === 'Create Job') {
      return (
        <View style={styles.screen}>
          <HOCreateJobScreen
            initialCategoryId={Number.isFinite(Number(hoSelectedId)) ? Number(hoSelectedId) : null}
            onBack={() => {
              setHOTab('Home');
              setHOScreen('Home');
            }}
            onSuccess={() => {
              setHOTab('My Jobs');
              setHOScreen('My Jobs');
            }}
          />
        </View>
      );
    }
    if (hoScreen === 'Profile') {
      // Not a bottom-nav tab (matches the mockup — Profile is reached via
      // Home's avatar button, see hero avatarCircle in HOHomeScreen).
      return (
        <View style={styles.screen}>
          <Profile onNavigate={hoNavigate} onLogout={handleLogout} onBack={hoBack} />
        </View>
      );
    }

    // Tab screens (with bottom nav)
    const renderHOTabContent = () => {
      switch (hoTab) {
        case 'Home':
          return <HOHomeScreen onNavigate={hoNavigate} />;
        case 'My Jobs':
          return <MyJobs onNavigate={hoNavigate} />;
        case 'Calendar':
          return <HOCalendarScreen onNavigate={hoNavigate} />;
        case 'Wallet':
          return <HOWalletScreen />;
        default:
          return <HOHomeScreen onNavigate={hoNavigate} />;
      }
    };

    return (
      <View style={styles.screen}>
        <View style={styles.tabContent}>{renderHOTabContent()}</View>
        <BottomNavBar activeTab={hoTab} tabs={HOMEOWNER_TABS} onTabPress={hoNavigate} />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authenticated — Service Provider
  // ─────────────────────────────────────────────────────────────────────────

  // Non-tab sub-screens (no bottom nav)
  if (spScreen === 'Job Detail' || spScreen === 'Urgent Job') {
    return (
      <View style={styles.screen}>
        <SPJobDetailScreen
          jobId={spJobId}
          onBack={spBack}
          onNavigate={spNavigate}
          isUrgent={spUrgentJob}
        />
      </View>
    );
  }
  if (spScreen === 'Chat') {
    return (
      <View style={styles.screen}>
        <SPChatScreen jobId={spJobId} onBack={spBack} onViewJob={() => spNavigate('Job Detail')} />
      </View>
    );
  }
  if (spScreen === 'Notifications') {
    return (
      <View style={styles.screen}>
        <SPNotificationsScreen onBack={spBack} />
      </View>
    );
  }
  if (spScreen === 'Edit Profile') {
    return (
      <View style={styles.screen}>
        <SPEditProfileScreen onBack={spBack} onSave={spBack} />
      </View>
    );
  }
  if (spScreen === 'Settings') {
    return (
      <View style={styles.screen}>
        <SPSettingsScreen onBack={spBack} onLogout={handleLogout} />
      </View>
    );
  }
  if (spScreen === 'Help & Support') {
    return (
      <View style={styles.screen}>
        <HelpSupportScreen role="provider" onBack={spBack} />
      </View>
    );
  }
  if (spScreen === 'Verification') {
    return (
      <View style={styles.screen}>
        <SPVerificationScreen
          onBack={spBack}
          onVerified={async () => {
            await refreshProfile();
            spBack();
          }}
        />
      </View>
    );
  }
  if (spScreen === 'Profile') {
    // Not a bottom-nav tab (matches the mockup — Profile is reached via
    // Feed's avatar button, see hero avatar in SPHomeScreen).
    return (
      <View style={styles.screen}>
        <SPProfileScreen onNavigate={spNavigate} onLogout={handleLogout} onBack={spBack} />
      </View>
    );
  }

  // Tab screens (with bottom nav)
  const renderSPTabContent = () => {
    switch (spTab) {
      case 'Dashboard':
        return <SPHomeScreen onNavigate={spNavigate} />;
      case 'My Jobs':
        return <SPMyJobsScreen onNavigate={spNavigate} />;
      case 'Calendar':
        return <SPCalendarScreen onNavigate={spNavigate} />;
      case 'Wallet':
        return <SPWalletScreen />;
      default:
        return <SPHomeScreen onNavigate={spNavigate} />;
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabContent}>{renderSPTabContent()}</View>
      <BottomNavBar activeTab={spTab} tabs={PROVIDER_TABS} onTabPress={spNavigate} />
    </View>
  );
}

/** Every route above is rendered inside the shared responsive root layout. */
export default function App() {
  return (
    <AuthProvider>
      <RootLayout>
        <AppContent />
      </RootLayout>
    </AuthProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  tabContent: {
    flex: 1,
  },
});
