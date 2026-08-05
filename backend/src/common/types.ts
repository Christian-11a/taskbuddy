export type UserRole = 'client' | 'provider' | 'admin';
export type JobUrgency = 'urgent' | 'normal' | 'flexible';
export type JobStatus =
  | 'open'
  | 'recommending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type ApplicationStatus =
  'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type WalletTxnDirection = 'credit' | 'debit';
export type WalletTxnStatus = 'pending' | 'completed' | 'failed';
export type BookingStatus = 'scheduled' | 'completed' | 'cancelled';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type VerificationMethod = 'manual' | 'stripe_identity';
export type DevicePlatform = 'ios' | 'android' | 'web';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedRequest extends Request {
  user: Profile;
  accessToken: string;
}
