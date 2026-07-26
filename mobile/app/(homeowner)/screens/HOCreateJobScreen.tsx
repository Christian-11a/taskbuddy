/**
 * HOCreateJobScreen.tsx
 *
 * Figma Source: "HO - Create Job Screen 1-5 + Success" (IDs: 46:814, 177:1669, 177:1823, 177:1963, 177:2222, 177:2424)
 *
 * Multi-step form for creating a new job posting.
 * Step 1: Service category selection
 * Step 2: Job details (title, description, location)
 * Step 3: Date & time scheduling
 * Step 4: Budget / pricing
 * Step 5: Review & post
 * Success: Confirmation screen
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  BrushCleaning,
  CheckCircle2,
  Hammer,
  Hand,
  Palette,
  Sparkles,
  Wrench,
} from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';

// Icon + blurb per real service category (the 5 seeded in the DB).
const CATEGORY_META: Record<string, { icon: typeof Wrench; desc: string }> = {
  Plumbing: { icon: Wrench, desc: 'Pipes, fixtures & repairs' },
  Cleaning: { icon: BrushCleaning, desc: 'Home & deep cleaning' },
  Handyman: { icon: Hammer, desc: 'Repairs & odd jobs' },
  Manicure: { icon: Sparkles, desc: 'Nail care & manicure' },
  Pedicure: { icon: Palette, desc: 'Foot care & pedicure' },
};

// Fallback coordinates (Metro Manila) when the client has no saved location.
const FALLBACK_COORDS = { latitude: 14.5995, longitude: 120.9842 };

interface HOCreateJobScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function HOCreateJobScreen({ onBack, onSuccess }: HOCreateJobScreenProps) {
  const { profile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);

  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [budget, setBudget] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 5;

  const validateStep = (): string | null => {
    if (step === 1 && !categoryId) return 'Please select a service.';
    if (step === 2) {
      if (title.trim().length < 5) return 'Title must be at least 5 characters.';
      if (description.trim().length < 20)
        return 'Description must be at least 20 characters.';
      if (!location.trim()) return 'Please enter a location.';
    }
    return null;
  };

  const submitJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createJob({
        category_id: categoryId!,
        title: title.trim(),
        description: description.trim(),
        urgency: isUrgent ? 'urgent' : 'normal',
        address: location.trim(),
        latitude: profile?.latitude ?? FALLBACK_COORDS.latitude,
        longitude: profile?.longitude ?? FALLBACK_COORDS.longitude,
      });
      setStep(6); // success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the job.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void submitJob();
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 1) {
      onBack();
    } else if (step === 6) {
      onSuccess();
    } else {
      setStep((s) => s - 1);
    }
  };

  if (step === 6) {
    // Success screen
    return (
      <View style={styles.screen}>
        <View style={styles.successScreen}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={44} color={Colors.brandTeal} />
          </View>
          <Text style={styles.successTitle}>Job Posted!</Text>
          <Text style={styles.successSubtitle}>
            Your job "{title || categoryName}" has been posted successfully. Service providers in your area will be notified.
          </Text>
          <View style={styles.successCard}>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Service</Text>
              <Text style={styles.successValue}>{categoryName}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Location</Text>
              <Text style={styles.successValue}>{location}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Urgency</Text>
              <Text style={styles.successValue}>{isUrgent ? 'Urgent' : 'Normal'}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={onSuccess} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>View My Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleBack} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Post Another Job</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post a Job</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` as any }]} />
        </View>
        <Text style={styles.stepText}>Step {step} of {totalSteps}</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Select a Service</Text>
            <Text style={styles.stepSubtitle}>What service do you need?</Text>
            {categories.loading && <Text style={styles.serviceDesc}>Loading services…</Text>}
            {!!categories.error && <Text style={styles.errorText}>{categories.error}</Text>}
            <View style={styles.serviceGrid}>
              {(categories.data ?? []).map((cat) => {
                const meta = CATEGORY_META[cat.name] ?? { icon: Hand, desc: '' };
                const Icon = meta.icon;
                const active = categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.serviceCard, active && styles.serviceCardActive]}
                    onPress={() => { setCategoryId(cat.id); setCategoryName(cat.name); }}
                    activeOpacity={0.85}
                  >
                    <Icon size={28} color={active ? Colors.brandTeal : Colors.brandDark} />
                    <Text style={[styles.serviceLabel, active && styles.serviceLabelActive]}>
                      {cat.name}
                    </Text>
                    <Text style={styles.serviceDesc}>{meta.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Job Details</Text>
            <Text style={styles.stepSubtitle}>Tell us more about the job</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Job Title</Text>
              <TextInput
                style={[styles.input, focusedField === 'title' && styles.inputFocused]}
                placeholder="e.g. 3-bedroom apartment deep clean"
                placeholderTextColor={Colors.muted}
                value={title}
                onChangeText={setTitle}
                onFocus={() => setFocusedField('title')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, focusedField === 'description' && styles.inputFocused]}
                placeholder="Describe the job in detail..."
                placeholderTextColor={Colors.muted}
                value={description}
                onChangeText={setDescription}
                onFocus={() => setFocusedField('description')}
                onBlur={() => setFocusedField(null)}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={[styles.input, focusedField === 'location' && styles.inputFocused]}
                placeholder="Brgy. Sampaguita, Lipa City"
                placeholderTextColor={Colors.muted}
                value={location}
                onChangeText={setLocation}
                onFocus={() => setFocusedField('location')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <TouchableOpacity
              style={[styles.urgentToggle, isUrgent && styles.urgentToggleActive]}
              onPress={() => setIsUrgent((u) => !u)}
              activeOpacity={0.85}
            >
              <AlertTriangle size={18} color={isUrgent ? Colors.brandTeal : Colors.slate} />
              <View style={styles.urgentInfo}>
                <Text style={[styles.urgentLabel, isUrgent && styles.urgentLabelActive]}>Mark as Urgent</Text>
                <Text style={styles.urgentDesc}>Get faster responses — providers are notified immediately</Text>
              </View>
              <View style={[styles.toggleSwitch, isUrgent && styles.toggleSwitchOn]}>
                <View style={[styles.toggleThumb, isUrgent && styles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Schedule</Text>
            <Text style={styles.stepSubtitle}>When do you need this done?</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preferred Date</Text>
              <TextInput
                style={[styles.input, focusedField === 'date' && styles.inputFocused]}
                placeholder="e.g. May 20, 2026"
                placeholderTextColor={Colors.muted}
                value={date}
                onChangeText={setDate}
                onFocus={() => setFocusedField('date')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preferred Time</Text>
              <TextInput
                style={[styles.input, focusedField === 'time' && styles.inputFocused]}
                placeholder="e.g. 10:00 AM"
                placeholderTextColor={Colors.muted}
                value={time}
                onChangeText={setTime}
                onFocus={() => setFocusedField('time')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <Text style={styles.inputLabel}>Flexibility</Text>
            <View style={styles.flexibilityRow}>
              {['Exact time', 'Morning', 'Afternoon', 'Evening', 'Flexible'].map((opt) => (
                <TouchableOpacity key={opt} style={styles.flexChip} activeOpacity={0.8}>
                  <Text style={styles.flexChipText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Budget</Text>
            <Text style={styles.stepSubtitle}>Set your budget for this job</Text>

            <View style={[styles.budgetCard, focusedField === 'budget' && styles.budgetCardFocused]}>
              <Text style={styles.budgetCurrency}>₱</Text>
              <TextInput
                style={styles.budgetInput}
                placeholder="0.00"
                placeholderTextColor={Colors.muted}
                value={budget}
                onChangeText={setBudget}
                onFocus={() => setFocusedField('budget')}
                onBlur={() => setFocusedField(null)}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.budgetHint}>
              Suggested: ₱500 – ₱1,200 for {categoryName || 'this service'}
            </Text>

            <Text style={styles.inputLabel}>Payment Type</Text>
            <View style={styles.paymentOptions}>
              {['Fixed Price', 'Hourly Rate', 'Negotiable'].map((opt) => (
                <TouchableOpacity key={opt} style={styles.paymentChip} activeOpacity={0.8}>
                  <Text style={styles.paymentChipText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>Review & Post</Text>
            <Text style={styles.stepSubtitle}>Review your job details before posting</Text>

            <View style={styles.reviewCard}>
              {[
                { label: 'Service', value: categoryName || 'Not selected' },
                { label: 'Title', value: title || 'Untitled' },
                { label: 'Location', value: location || 'Not set' },
                { label: 'Date', value: date || 'Flexible' },
                { label: 'Time', value: time || 'Flexible' },
                { label: 'Budget', value: budget ? peso(budget) : 'Not set' },
                { label: 'Urgent', value: isUrgent ? 'Yes' : 'No' },
              ].map((item) => (
                <View key={item.label} style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{item.label}</Text>
                  <Text style={styles.reviewValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.termsRow}>
              <View style={styles.termsCheck} />
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink}>Terms & Conditions</Text> and understand that TaskBuddy holds payment until job completion.
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.primaryBtnText}>
            {submitting ? 'Posting…' : step === totalSteps ? 'Post Job' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, marginBottom: 16,
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '700', fontFamily: 'Inter' },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: Colors.white, fontSize: 20, fontWeight: '600' },

  progressBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 8 },
  progressFill: { height: 4, backgroundColor: Colors.brandCyan, borderRadius: 2 },
  stepText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 24, paddingBottom: 20 },

  stepTitle: { color: Colors.brandDark, fontSize: 22, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
  stepSubtitle: { color: Colors.muted, fontSize: 14, fontFamily: 'Inter', marginBottom: 20 },

  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, borderWidth: 2, borderColor: 'transparent',
    ...Shadows.card,
  },
  serviceCardActive: { borderColor: Colors.brandTeal, backgroundColor: '#F0FAFF' },
  serviceIcon: { fontSize: 28, marginBottom: 8 },
  serviceLabel: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  serviceLabelActive: { color: Colors.brandTeal },
  serviceDesc: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },

  inputGroup: { marginBottom: 16 },
  inputLabel: { color: Colors.brandDark, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', marginBottom: 8 },
  input: {
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)',
    fontFamily: 'Inter', fontSize: 15, color: Colors.brandDark,
    ...Shadows.input,
  },
  inputFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  textArea: { height: 100, textAlignVertical: 'top' },

  urgentToggle: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: 16, padding: 16, borderWidth: 2, borderColor: 'transparent',
    ...Shadows.card, gap: 12,
  },
  urgentToggleActive: { borderColor: '#EF4444', backgroundColor: '#FFF5F5' },
  urgentIcon: { fontSize: 24 },
  urgentInfo: { flex: 1 },
  urgentLabel: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  urgentLabelActive: { color: '#EF4444' },
  urgentDesc: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  toggleSwitch: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(144,153,184,0.3)', justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleSwitchOn: { backgroundColor: '#EF4444' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.white },
  toggleThumbOn: { alignSelf: 'flex-end' },

  flexibilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  flexChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)',
  },
  flexChipText: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },

  budgetCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, borderWidth: 1, borderColor: 'transparent', ...Shadows.card,
  },
  budgetCardFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  budgetCurrency: { color: Colors.brandDark, fontSize: 32, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  budgetInput: { fontSize: 48, fontWeight: '800', fontFamily: 'Inter', color: Colors.brandDark, minWidth: 120 },
  budgetHint: { color: Colors.muted, fontSize: 13, fontFamily: 'Inter', textAlign: 'center', marginBottom: 20 },
  paymentOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  paymentChip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)',
  },
  paymentChipText: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },

  reviewCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, marginBottom: 16, ...Shadows.card },
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)',
  },
  reviewLabel: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter' },
  reviewValue: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', maxWidth: '55%', textAlign: 'right' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  termsCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(144,153,184,0.4)', backgroundColor: Colors.white, marginTop: 2 },
  termsText: { flex: 1, color: Colors.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 20 },
  termsLink: { color: Colors.brandTeal, fontWeight: '700', textDecorationLine: 'underline' },

  footer: { paddingHorizontal: Spacing.screenH, paddingVertical: 16, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: 'rgba(144,153,184,0.15)' },
  primaryBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 24, paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', letterSpacing: 0.3 },
  primaryBtnDisabled: { opacity: 0.7 },
  errorText: { color: Colors.error, fontSize: 13, fontFamily: 'Inter', marginBottom: 10, textAlign: 'center' },

  // Success
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  successIconText: { fontSize: 48 },
  successTitle: { color: Colors.brandDark, fontSize: 28, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12, textAlign: 'center' },
  successSubtitle: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  successCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, width: '100%', marginBottom: 28, ...Shadows.card },
  successRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  successLabel: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter' },
  successValue: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  secondaryBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 24,
    borderWidth: 1, borderColor: Colors.brandTeal, width: '100%',
  },
  secondaryBtnText: { color: Colors.brandTeal, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
});
