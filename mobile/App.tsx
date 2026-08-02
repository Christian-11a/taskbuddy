/**
 * App.tsx — Root navigation controller
 *
 * Architecture:
 *   not signed in → Onboarding → Login / Register
 *   'homeowner'   → HO screens with the shared BottomNavBar
 *   'provider'    → SP screens with the shared BottomNavBar
 *
 * Authentication is real: the auth screens call the NestJS backend through
 * AuthContext, which persists the session and resolves the account's role.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { CalendarDays, CirclePlus, ClipboardList, Home, LayoutDashboard, UserRound, Wallet } from 'lucide-react-native';
import RootLayout from './app/layout';

// ── Auth screens ──────────────────────────────────────────────────────────────
import SplashScreenComponent from './app/SplashScreen';
import OnboardingScreen from './app/(auth)/screens/OnboardingScreen';
import LoginScreen from './app/(auth)/screens/LoginScreen';
import ForgotPasswordScreen from './app/(auth)/screens/ForgotPasswordScreen';
import RegisterScreen from './app/(auth)/screens/RegisterScreen';

// ── Homeowner screens ─────────────────────────────────────────────────────────
import HOHomeScreen from './app/(homeowner)/screens/HOHomeScreen';
import MyJobs from './app/(homeowner)/screens/HOMyJobs';
import Profile from './app/(homeowner)/screens/HOProfile';
import HOWalletScreen from './app/(homeowner)/screens/HOWalletScreen';
import HOCreateJobScreen from './app/(homeowner)/screens/HOCreateJobScreen';
import HOJobDetailScreen from './app/(homeowner)/screens/HOJobDetailScreen';
import HOChatScreen from './app/(homeowner)/screens/HOChatScreen';
import HONotificationsScreen from './app/(homeowner)/screens/HONotificationsScreen';
import HOEditProfileScreen from './app/(homeowner)/screens/HOEditProfileScreen';
import HOSettingsScreen from './app/(homeowner)/screens/HOSettingsScreen';
import HODisputeFilingScreen from './app/(homeowner)/screens/HODisputeFilingScreen';

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

// ── Shared navigation components ──────────────────────────────────────────────
import BottomNavBar, { BottomNavItem } from './src/components/BottomNavBar';

// ── Types ─────────────────────────────────────────────────────────────────────
import { HOScreen, SPScreen } from './src/types/navigation';

// ── Auth ───────────────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from './src/context/AuthContext';

const HOMEOWNER_TABS: readonly BottomNavItem<HOScreen>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList },
  { key: 'Create Job', label: 'Create job', icon: CirclePlus, primary: true },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
  { key: 'Profile', label: 'Profile', icon: UserRound },
];

const PROVIDER_TABS: readonly BottomNavItem<SPScreen>[] = [
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList },
  { key: 'Calendar', label: 'Calendar', icon: CalendarDays, primary: true },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
  { key: 'Profile', label: 'Profile', icon: UserRound },
];

// ─────────────────────────────────────────────────────────────────────────────
// Root app state
// ─────────────────────────────────────────────────────────────────────────────

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

type PreAuthScreen = 'onboarding' | 'login' | 'forgotPassword' | 'register';

function AppContent() {
  const { initializing, isAuthenticated, role, signIn, signUp, signOut } = useAuth();

  // Which pre-auth screen to show while the user is signed out.
  const [preAuth, setPreAuth] = useState<PreAuthScreen>('onboarding');
  // The splash plays for a minimum duration; we also wait for session restore.
  const [minSplashDone, setMinSplashDone] = useState(false);

  const handleLogout = () => {
    void signOut();
    setPreAuth('login');
  };

  // ── HO navigation state ───────────────────────────────────────────────────
  const [hoTab, setHOTab] = useState<HOScreen>('Home');
  const [hoScreen, setHOScreen] = useState<HOScreen>('Home'); // for non-tab sub-screens
  const [hoJobId, setHOJobId] = useState<string | null>(null); // selected job/chat context

  // ── SP navigation state ───────────────────────────────────────────────────
  const [spTab, setSPTab] = useState<SPScreen>('Dashboard');
  const [spScreen, setSPScreen] = useState<SPScreen>('Dashboard');
  const [spUrgentJob, setSPUrgentJob] = useState(false);
  const [spJobId, setSPJobId] = useState<string | null>(null);

  // ── HO helpers ────────────────────────────────────────────────────────────
  const hoNavigate = (screen: HOScreen, jobId?: string) => {
    if (jobId !== undefined) setHOJobId(jobId);
    const TAB_SCREENS: HOScreen[] = ['Home', 'My Jobs', 'Wallet', 'Profile'];
    if (TAB_SCREENS.includes(screen)) {
      setHOTab(screen);
      setHOScreen(screen);
    } else {
      setHOScreen(screen);
    }
  };

  // ── SP helpers ────────────────────────────────────────────────────────────
  const spNavigate = (screen: SPScreen, jobId?: string) => {
    if (jobId !== undefined) setSPJobId(jobId);
    const TAB_SCREENS: SPScreen[] = ['Dashboard', 'My Jobs', 'Calendar', 'Wallet', 'Profile'];
    if (TAB_SCREENS.includes(screen)) {
      setSPTab(screen);
      setSPScreen(screen);
    } else {
      if (screen === 'Urgent Job') setSPUrgentJob(true);
      setSPScreen(screen);
    }
  };

  const spBack = () => {
    setSPUrgentJob(false);
    setSPScreen(spTab);
  };

  const hoBack = () => {
    setHOScreen(hoTab);
  };

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setMinSplashDone(true);
      ExpoSplashScreen.hideAsync().catch(() => {});
    }, 2200);

    return () => clearTimeout(splashTimer);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Auth flow
  // ─────────────────────────────────────────────────────────────────────────

  // Hold on the splash until the minimum time has elapsed AND any persisted
  // session has finished restoring, so we never flash the login screen first.
  if (!minSplashDone || initializing) {
    return <SplashScreenComponent />;
  }

  if (!isAuthenticated) {
    if (preAuth === 'onboarding') {
      return (
        <OnboardingScreen
          onFinish={() => setPreAuth('login')}
          onLogin={() => setPreAuth('login')}
        />
      );
    }

    if (preAuth === 'login') {
      return (
        <LoginScreen
          onLogin={signIn}
          onSignUp={() => setPreAuth('register')}
          onForgotPassword={() => setPreAuth('forgotPassword')}
        />
      );
    }

    if (preAuth === 'forgotPassword') {
      return (
        <ForgotPasswordScreen
          onBackToLogin={() => setPreAuth('login')}
          onResetPassword={() => setPreAuth('login')}
        />
      );
    }

    // preAuth === 'register'
    return (
      <RegisterScreen
        onRegister={signUp}
        onLogin={() => setPreAuth('login')}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authenticated — Homeowner
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'homeowner') {
    // Non-tab sub-screens (no bottom nav)
    if (hoScreen === 'Job Detail') {
      return (
        <View style={styles.screen}>
          <HOJobDetailScreen jobId={hoJobId} onBack={hoBack} onNavigate={hoNavigate} />
        </View>
      );
    }
    if (hoScreen === 'Chat') {
      return (
        <View style={styles.screen}>
          <HOChatScreen jobId={hoJobId} onBack={hoBack} onViewJob={() => hoNavigate('Job Detail')} />
        </View>
      );
    }
    if (hoScreen === 'Dispute Filing') {
      return (
        <View style={styles.screen}>
          <HODisputeFilingScreen jobId={hoJobId} onBack={hoBack} onSubmitted={hoBack} />
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
    if (hoScreen === 'Create Job') {
      return (
        <View style={styles.screen}>
          <HOCreateJobScreen
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

    // Tab screens (with bottom nav)
    const renderHOTabContent = () => {
      switch (hoTab) {
        case 'Home':
          return <HOHomeScreen onNavigate={hoNavigate} />;
        case 'My Jobs':
          return <MyJobs onNavigate={hoNavigate} />;
        case 'Wallet':
          return <HOWalletScreen />;
        case 'Profile':
          return <Profile onNavigate={hoNavigate} onLogout={handleLogout} />;
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
  if (spScreen === 'Verification') {
    return (
      <View style={styles.screen}>
        <SPVerificationScreen onBack={spBack} />
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
        return <SPCalendarScreen />;
      case 'Wallet':
        return <SPWalletScreen />;
      case 'Profile':
        return <SPProfileScreen onNavigate={spNavigate} onLogout={handleLogout} />;
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
