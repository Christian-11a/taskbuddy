// Navigation type definitions used across the mobile app

export type Role = 'homeowner' | 'provider';

// Homeowner bottom tab keys
export type HOTabKey = 'Home' | 'My Jobs' | 'Create' | 'Wallet' | 'Profile';

// Provider bottom tab keys  
export type SPTabKey = 'Dashboard' | 'My Jobs' | 'Create' | 'Calendar' | 'Profile';

// Legacy alias for backward compatibility
export type BottomTabParamList = {
  Home: undefined;
  'My Jobs': undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type ScreenKey = keyof BottomTabParamList;

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Auth: undefined;
  App: { role?: Role } | undefined;
};

// Homeowner screen keys (for sub-navigation)
export type HOScreen =
  | 'Home'
  | 'My Jobs'
  | 'Create Job'
  | 'Wallet'
  | 'Profile'
  | 'Job Detail'
  | 'Job Applications'
  | 'Provider Profile'
  | 'Leave Review'
  | 'Chat'
  | 'Notifications'
  | 'Edit Profile'
  | 'Dispute Filing'
  | 'Settings';

// Provider screen keys
export type SPScreen =
  | 'Dashboard'
  | 'My Jobs'
  | 'Calendar'
  | 'Wallet'
  | 'Profile'
  | 'Job Detail'
  | 'Urgent Job'
  | 'Chat'
  | 'Notifications'
  | 'Edit Profile'
  | 'Verification';

export const DEFAULT_ROLE: Role = 'homeowner';

// Legacy
export const bottomTabs: ScreenKey[] = ['Home', 'My Jobs', 'Wallet', 'Profile'];
