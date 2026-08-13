// Navigation type definitions used across the mobile app.
//
// App.tsx drives navigation with plain component state (hoScreen/spScreen +
// a back-stack), not React Navigation, so the only types anything actually
// imports are the two screen-key unions below.

// Homeowner screen keys (for sub-navigation)
export type HOScreen =
  | 'Home'
  | 'My Jobs'
  | 'Create Job'
  | 'Calendar'
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
  | 'Settings'
  | 'Help & Support';

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
  | 'Verification'
  | 'Settings'
  | 'Help & Support';
