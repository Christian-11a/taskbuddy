import React, { useState } from 'react';
import TermsAndConditions from '../../app/(auth)/screens/TermsAndConditions';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { TERMS_VERSION } from '../lib/legalText';
import { showToast } from './Toast';

const PRIVACY_ONLY = { terms: false, privacy: true };

/**
 * Asks a signed-in user to accept the current Terms & Conditions when their
 * account accepted an older version. It cannot be dismissed: the new terms
 * cover payment release, so nobody hires or gets paid under the old ones.
 */
export default function TermsUpdatePrompt() {
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const visible = !!profile?.terms_update_required && !saving;

  const accept = async () => {
    setSaving(true);
    try {
      await api.acceptTerms(TERMS_VERSION);
      await refreshProfile();
    } catch {
      showToast('Could not save your acceptance. Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TermsAndConditions
      visible={visible}
      mode="terms"
      accepted={PRIVACY_ONLY}
      onAccept={() => void accept()}
      onBack={() => {}}
    />
  );
}
