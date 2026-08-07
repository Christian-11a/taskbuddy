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
 *
 * NOTE (Android/iOS time picker fix):
 * @react-native-community/datetimepicker behaves very differently per platform:
 *  - iOS: `display="spinner"` renders as a true inline view. It never closes on
 *    its own and just streams onChange events as the user scrolls the wheel,
 *    which is why wrapping it in our own bottom-sheet Modal with a "Done"
 *    button works well.
 *  - Android: mounting <DateTimePicker> triggers the OS's own native imperative
 *    dialog (with its own baked-in OK/Cancel), regardless of the `display`
 *    prop. That dialog expects the component to be UNMOUNTED after the user
 *    responds. If we keep it mounted (e.g. inside a Modal whose `visible` stays
 *    true), Android reopens the native dialog on every re-render, causing the
 *    "keeps popping back up" loop on both OK and Cancel.
 *
 * Fix: branch by Platform.OS.
 *  - Android: render <DateTimePicker> bare (no wrapping custom Modal), and
 *    unmount it (setShowTimePicker(false)) immediately inside onChange,
 *    regardless of whether the event was 'set' (OK) or 'dismissed' (Cancel).
 *  - iOS: keep the existing custom Modal + spinner + Done button flow.
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Modal,
  Image,
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
  Check,
} from 'lucide-react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';
import TermsAndConditions from '../../(auth)/screens/TermsAndConditions';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

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
  const [descriptionHeight, setDescriptionHeight] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [budget, setBudget] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [flexibility, setFlexibility] = useState('Exact time');
  const [paymentType, setPaymentType] = useState('Fixed Price');
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string; location?: string; date?: string; time?: string; budget?: string }>({});
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 5;
  const dateLabel = date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
  const timeLabel = time?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) ?? '';
  const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

  const isValidBudget = (value: string) => {
    const normalized = value.trim().replace(/,/g, '');
    if (normalized === '') return false;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return false;
    // allow at most 2 decimal places
    const parts = normalized.split('.');
    if (parts[1] && parts[1].length > 2) return false;
    return true;
  };

  const formatBudget = () => {
    if (!isValidBudget(budget)) return;
    setBudget(Number(budget.replace(/,/g, '')).toFixed(2));
  };

  const validateStep = (): string | null => {
    const errors: { title?: string; description?: string; location?: string; date?: string; time?: string; budget?: string } = {};

    if (step === 1 && !categoryId) {
      setFieldErrors({});
      return 'Please select a service.';
    }

    if (step === 2) {
      const t = title.trim();
      if (t.length < 5) errors.title = 'Title must be at least 5 characters.';
      else if (t.length > 120) errors.title = 'Title cannot exceed 120 characters.';

      const d = description.trim();
      if (d.length < 20) errors.description = 'Description must be at least 20 characters.';
      else if (d.length > 750) errors.description = 'Description cannot exceed 750 characters.';

      if (!location.trim()) errors.location = 'Please enter a location.';
    }

    if (step === 3) {
      // scheduled_at is optional on backend; only validate if user supplied a date/time
      if (date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
          errors.date = 'Preferred date cannot be before today.';
        }
        if (!time) {
          errors.time = 'Please select a preferred time.';
        }
      } else if (time && !date) {
        // time provided but no date
        errors.date = 'Please select a preferred date.';
      }
    }

    if (step === 4) {
      if (budget.trim()) {
        if (!isValidBudget(budget)) errors.budget = 'Please enter a valid budget greater than 0 and up to 2 decimal places.';
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // return the first error message so callers can optionally use it
      return Object.values(errors)[0] as string;
    }

    return null;
  };

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo library access to add job photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((current) => [...current, ...result.assets].slice(0, 10));
      setError(null);
    }
  };

  // Pre-request media library permission when entering step 2 so the app
  // asks for permission before attempting to access files.
  useEffect(() => {
    if (step === 2) {
      void (async () => {
        try {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [step]);

  /**
   * The picker collects a date and a time as two separate Date objects; the
   * backend stores one `timestamptz`. Combine them in the device's own time
   * zone so "9:00 AM" means 9:00 AM where the client is.
   */
  const combineDateAndTime = (day: Date, clock: Date) =>
    new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      clock.getHours(),
      clock.getMinutes(),
      0,
      0,
    ).toISOString();

  const submitJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Upload first: a failed upload should not leave a job with dead photos.
      const photo_urls = await Promise.all(
        photos.map((photo) => api.uploadImage('job-photos', photo.uri)),
      );

      await api.createJob({
        category_id: categoryId!,
        title: title.trim(),
        description: description.trim(),
        urgency: isUrgent ? 'urgent' : 'normal',
        address: location.trim(),
        latitude: profile?.latitude ?? FALLBACK_COORDS.latitude,
        longitude: profile?.longitude ?? FALLBACK_COORDS.longitude,
        budget: Number(budget.replace(/,/g, '')),
        scheduled_at: combineDateAndTime(date!, time!),
        photo_urls,
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
      return;
    }
    setError(null);
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void submitJob();
    }
  };

  const hasProgress = Boolean(
    categoryId || title.trim() || description.trim() || location.trim() || date || time ||
    budget.trim() || photos.length || isUrgent || termsAccepted,
  );

  const handleStepBack = () => {
    setError(null);
    if (step > 1 && step <= totalSteps) setStep((s) => s - 1);
  };

  const handleExit = () => {
    if (hasProgress) {
      setShowExitConfirmation(true);
      return;
    }
    onBack();
  };

  const openTimePicker = () => {
    setShowDatePicker(false);
    setTempTime(time ?? new Date());
    setShowTimePicker(true);
  };

  // Single onChange handler for both platforms.
  // Android: the native dialog is imperative and self-closing — we must
  // unmount (setShowTimePicker(false)) on ANY response (OK or Cancel),
  // otherwise the dialog re-triggers itself on every re-render.
  // iOS: the spinner is an inline view that stays open and just streams
  // intermediate values until the user taps our own "Done" button.
  const handleTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'set' && selectedTime) {
        setTime(selectedTime);
      }
      // event.type === 'dismissed' -> user tapped Cancel/back; keep old time.
      return;
    }
    // iOS
    if (selectedTime) setTempTime(selectedTime);
  };

  if (showTerms) {
    return (
      <TermsAndConditions
        onBack={() => setShowTerms(false)}
        onAccept={() => setTermsAccepted(true)}
      />
    );
  }

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
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(1)} activeOpacity={0.8}>
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
          <TouchableOpacity style={styles.backBtn} onPress={handleExit} activeOpacity={0.8}>
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
            <Text style={styles.stepTitle}>Select a Service<Text style={styles.requiredAsterisk}> *</Text></Text>
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
              <Text style={styles.inputLabel}>Job Title<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TextInput
                style={[styles.input, focusedField === 'title' && styles.inputFocused, fieldErrors.title && styles.inputError]}
                placeholder="e.g. 3-bedroom apartment deep clean"
                placeholderTextColor={Colors.muted}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }}
                onFocus={() => {
                  setFocusedField('title');
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }}
                onBlur={() => setFocusedField(null)}
              />
              {!!fieldErrors.title && <Text style={styles.inputErrorText}>{fieldErrors.title}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Photos (optional)</Text>
              <TouchableOpacity style={styles.photoPicker} onPress={() => void pickPhotos()} activeOpacity={0.8}>
                <Text style={styles.photoPickerTitle}>Add photos</Text>
                <Text style={styles.photoPickerHint}>Select up to 10 images to help providers understand the job.</Text>
              </TouchableOpacity>
              {photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoPreview}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      <TouchableOpacity
                        style={styles.removePhoto}
                        onPress={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
                        accessibilityLabel={`Remove photo ${index + 1}`}
                      >
                        <Text style={styles.removePhotoText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description<Text style={styles.requiredAsterisk}> *</Text></Text>
              <View style={styles.textAreaWrap}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    focusedField === 'description' && styles.inputFocused,
                    fieldErrors.description && styles.inputError,
                    descriptionHeight ? { height: descriptionHeight } : {},
                  ]}
                  placeholder="Describe the job in detail..."
                  placeholderTextColor={Colors.muted}
                  value={description}
                  onChangeText={(value) => {
                    setDescription(value);
                    if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined }));
                  }}
                  onFocus={() => {
                    setFocusedField('description');
                    if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined }));
                  }}
                  onBlur={() => setFocusedField(null)}
                  multiline
                  numberOfLines={3}
                  onContentSizeChange={(e) => {
                    const h = e.nativeEvent.contentSize.height;
                    // Ensure minimum height for ~3 lines; avoid shrinking below 3 lines
                    const minH = 20 * 3; // approx lineHeight 20
                    setDescriptionHeight(Math.max(h, minH));
                  }}
                  maxLength={750}
                />
                <Text style={styles.charCount}>{description.length}/750</Text>
              </View>
              {!!fieldErrors.description && <Text style={styles.inputErrorText}>{fieldErrors.description}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TextInput
                style={[styles.input, focusedField === 'location' && styles.inputFocused, fieldErrors.location && styles.inputError]}
                placeholder="Brgy. Sampaguita, Lipa City"
                placeholderTextColor={Colors.muted}
                value={location}
                onChangeText={(value) => {
                  setLocation(value);
                  if (fieldErrors.location) setFieldErrors((prev) => ({ ...prev, location: undefined }));
                }}
                onFocus={() => {
                  setFocusedField('location');
                  if (fieldErrors.location) setFieldErrors((prev) => ({ ...prev, location: undefined }));
                }}
                onBlur={() => setFocusedField(null)}
              />
              {!!fieldErrors.location && <Text style={styles.inputErrorText}>{fieldErrors.location}</Text>}
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
              <Text style={styles.inputLabel}>Preferred Date<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, showDatePicker && styles.inputFocused, fieldErrors.date && styles.inputError]}
                onPress={() => { setShowTimePicker(false); setShowDatePicker(true); if (fieldErrors.date) setFieldErrors((prev) => ({ ...prev, date: undefined })); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.pickerText, !date && styles.pickerPlaceholder]}>{dateLabel || 'Select a date'}</Text>
              </TouchableOpacity>
              {!!fieldErrors.date && <Text style={styles.inputErrorText}>{fieldErrors.date}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preferred Time<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, showTimePicker && styles.inputFocused, fieldErrors.time && styles.inputError]}
                onPress={() => { openTimePicker(); if (fieldErrors.time) setFieldErrors((prev) => ({ ...prev, time: undefined })); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.pickerText, !time && styles.pickerPlaceholder]}>{timeLabel || 'Select a time'}</Text>
              </TouchableOpacity>
              {!!fieldErrors.time && <Text style={styles.inputErrorText}>{fieldErrors.time}</Text>}
            </View>

            <Text style={styles.inputLabel}>Flexibility</Text>
            <View style={styles.flexibilityRow}>
              {['Exact time', 'Morning', 'Afternoon', 'Evening', 'Flexible'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.flexChip, flexibility === opt && styles.flexChipActive]}
                  onPress={() => setFlexibility(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.flexChipText, flexibility === opt && styles.flexChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Budget<Text style={styles.requiredAsterisk}> *</Text></Text>
            <Text style={styles.stepSubtitle}>Set your budget for this job</Text>

            <View style={[styles.budgetCard, focusedField === 'budget' && styles.budgetCardFocused, fieldErrors.budget && styles.inputError]}>
              <Text style={styles.budgetCurrency}>₱</Text>
              <TextInput
                style={styles.budgetInput}
                placeholder="0.00"
                placeholderTextColor={Colors.muted}
                value={budget}
                onChangeText={(value) => {
                  setBudget(value);
                  if (fieldErrors.budget) setFieldErrors((prev) => ({ ...prev, budget: undefined }));
                }}
                onFocus={() => {
                  setFocusedField('budget');
                  if (fieldErrors.budget) setFieldErrors((prev) => ({ ...prev, budget: undefined }));
                }}
                onBlur={() => { setFocusedField(null); formatBudget(); }}
                keyboardType="decimal-pad"
              />
            </View>
            {!!fieldErrors.budget && <Text style={styles.inputErrorText}>{fieldErrors.budget}</Text>}

            <Text style={styles.budgetHint}>
              Suggested: ₱500 – ₱1,200 for {categoryName || 'this service'}
            </Text>

            <Text style={styles.inputLabel}>Payment Type</Text>
            <View style={styles.paymentOptions}>
              {['Fixed Price', 'Hourly Rate', 'Negotiable'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.paymentChip, paymentType === opt && styles.paymentChipActive]}
                  onPress={() => setPaymentType(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.paymentChipText, paymentType === opt && styles.paymentChipTextActive]}>{opt}</Text>
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
                { label: 'Date', value: dateLabel || 'Flexible' },
                { label: 'Time', value: timeLabel || 'Flexible' },
                { label: 'Flexibility', value: flexibility },
                { label: 'Budget', value: budget ? peso(budget) : 'Not set' },
                { label: 'Payment Type', value: paymentType },
                { label: 'Photos', value: photos.length ? `${photos.length} selected` : 'None' },
                { label: 'Urgent', value: isUrgent ? 'Yes' : 'No' },
              ].map((item) => (
                <View key={item.label} style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{item.label}</Text>
                  <Text style={styles.reviewValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.termsRow}>
              <View style={[styles.termsCheck, termsAccepted && styles.termsCheckAccepted]}>
                {termsAccepted && <Check size={14} color={Colors.white} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>Terms & Conditions</Text><Text style={styles.requiredAsterisk}> *</Text> and understand that TaskBuddy holds payment until job completion.
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.footerActions}>
          {step > 1 && (
            <TouchableOpacity style={styles.previousBtn} onPress={handleStepBack} activeOpacity={0.85} disabled={submitting}>
              <Text style={styles.previousBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              step === 1 && styles.primaryBtnFullWidth,
              step > 1 && styles.primaryBtnWithBack,
              submitting && styles.primaryBtnDisabled,
            ]}
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

      <ConfirmationModal
        visible={showExitConfirmation}
        title="Discard job draft?"
        message="Returning to the home screen will delete the job details you have entered."
        confirmLabel="Discard & Exit"
        cancelLabel="Keep Editing"
        onCancel={() => setShowExitConfirmation(false)}
        onConfirm={() => {
          setShowExitConfirmation(false);
          onBack();
        }}
      />

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Select a date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} hitSlop={10}>
                <Text style={styles.calendarClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <Calendar
              current={date ? dateKey(date) : undefined}
              minDate={dateKey(new Date())}
              onDayPress={(day) => {
                const [year, month, dayOfMonth] = day.dateString.split('-').map(Number);
                setDate(new Date(year, month - 1, dayOfMonth));
                setShowDatePicker(false);
              }}
              markedDates={date ? { [dateKey(date)]: { selected: true, selectedColor: Colors.brandTeal } } : undefined}
              theme={{ todayTextColor: Colors.brandTeal, arrowColor: Colors.brandTeal, selectedDayBackgroundColor: Colors.brandTeal }}
            />
          </View>
        </View>
      </Modal>

      {/*
        TIME PICKER — platform-specific rendering.

        Android: DateTimePicker itself opens the native OS dialog imperatively
        as soon as it mounts. We render it bare (no custom Modal wrapper) and
        conditionally mount it only while showTimePicker is true. The
        handleTimeChange handler unmounts it (setShowTimePicker(false)) the
        instant it receives ANY event — 'set' (OK) or 'dismissed' (Cancel) —
        which is what prevents the native dialog from reappearing.
      */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={tempTime ?? new Date()}
          mode="time"
          display="spinner"
          onChange={handleTimeChange}
        />
      )}

      {/*
        iOS: the spinner is an inline view that never closes itself, so we
        keep it inside our own bottom-sheet Modal with a "Done" button that
        commits tempTime -> time.
      */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.calendarOverlay}>
            <View style={styles.calendarModal}>
              <View style={styles.calendarHeader}>
                <Text style={styles.calendarTitle}>Select a time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)} hitSlop={10}>
                  <Text style={styles.calendarClose}>Close</Text>
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={tempTime ?? new Date()}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 16 }]}
                onPress={() => {
                  if (tempTime) setTime(tempTime);
                  setShowTimePicker(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  inputError: { borderColor: Colors.error, borderWidth: 2 },
  inputErrorText: { color: Colors.error, fontSize: 13, marginTop: 8, fontFamily: 'Inter' },
  requiredAsterisk: { color: Colors.error, fontWeight: '800' },
  pickerInput: { justifyContent: 'center', minHeight: 48 },
  pickerText: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 15 },
  pickerPlaceholder: { color: Colors.muted },
  calendarOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  calendarModal: { backgroundColor: Colors.white, borderRadius: 24, padding: 20, ...Shadows.card },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarTitle: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  calendarClose: { color: Colors.brandTeal, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  textArea: { textAlignVertical: 'top', minHeight: 20 * 3 },
  textAreaWrap: { position: 'relative' },
  charCount: { position: 'absolute', right: 12, bottom: 8, color: Colors.muted, fontSize: 12 },
  photoPicker: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.brandTeal,
  },
  photoPickerTitle: { color: Colors.brandTeal, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  photoPickerHint: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter', lineHeight: 18 },
  photoList: { gap: 10, paddingTop: 12 },
  photoPreview: { width: 72, height: 72, borderRadius: 10, overflow: 'visible' },
  photoImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#E2E8F0' },
  removePhoto: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: Colors.white, fontSize: 18, lineHeight: 20, fontWeight: '700' },

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
  flexChipActive: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  flexChipText: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  flexChipTextActive: { color: Colors.white },

  budgetCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, borderWidth: 1, borderColor: 'transparent', ...Shadows.card,
  },
  budgetCardFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  budgetCurrency: { color: Colors.brandDark, fontSize: 32, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  budgetInput: { fontSize: 48, fontWeight: '800', fontFamily: 'Inter', color: Colors.brandDark, minWidth: 120 },
  budgetHint: { color: Colors.muted, fontSize: 13, fontFamily: 'Inter', textAlign: 'center', margin: 20 },
  paymentOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  paymentChip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)',
  },
  paymentChipActive: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  paymentChipText: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  paymentChipTextActive: { color: Colors.white },

  reviewCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, marginBottom: 16, ...Shadows.card },
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)',
  },
  reviewLabel: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter' },
  reviewValue: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', maxWidth: '55%', textAlign: 'right' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  termsCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: '#64748B', backgroundColor: '#CBD5E1', marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  termsCheckAccepted: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  termsText: { flex: 1, color: Colors.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 20 },
  termsLink: { color: Colors.brandTeal, fontWeight: '700', textDecorationLine: 'underline' },

  footer: { paddingHorizontal: Spacing.screenH, paddingVertical: 16, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: 'rgba(144,153,184,0.15)' },
  footerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  previousBtn: { width: '48%', height: 50, borderWidth: 1, borderColor: Colors.brandTeal, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  previousBtnText: { color: Colors.brandTeal, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  primaryBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 24, paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryBtnFullWidth: { width: '100%' },
  primaryBtnWithBack: { width: '48%', height: 50, paddingVertical: 0, justifyContent: 'center' },
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
