/**
 * HOCreateJobScreen.tsx
 *
 * The guided five-step job creation flow (Fig 3.20):
 *
 *   1. Service   — which of the seeded categories this job belongs to
 *   2. Location  — where the work happens (prefilled from the saved address)
 *   3. Tasks     — what needs doing, as a checklist, plus the details/photos
 *   4. Urgency   — how soon, plus the schedule and budget that go with it
 *   5. Review    — everything above, then post
 *
 * The step names are the product's, not the backend's: the API takes one flat
 * CreateJobDto, and this screen decides how to gather it. Two consequences
 * worth knowing before rearranging anything:
 *
 *   The checklist from step 3 is real data, not a UI nicety. It is stored as
 *   job_tasks (migration 0019) and becomes the provider's task list on their
 *   job screen — which is the only progress signal this app has, since
 *   completion is homeowner-triggered.
 *
 *   Urgency is genuinely three-valued. `urgency` sets the job's
 *   recommendation deadline by DB trigger (urgent 5 min / normal 10 /
 *   flexible 15) — how long organic applications get before the ML engine
 *   steps in — so the wording in step 4 describes what actually happens.
 *
 * A past date is refused here as well as by the API: the backend rejects
 * `scheduled_at` in the past (CreateJobDto), but a homeowner should not have
 * to submit the whole form to hear it, so step 4 checks the combined date and
 * time on the way out and shows the error against the offending field.
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

import React, { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import {
  ArrowLeft,
  BrushCleaning,
  Check,
  CheckCircle2,
  Clock,
  Hammer,
  Hand,
  MapPin,
  Palette,
  Plus,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import { Sizes, Spacing, V6Colors, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';
import TermsAndConditions from '../../(auth)/screens/TermsAndConditions';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

const Colors = {
  ...V6Colors,
  background: V6Colors.canvas,
  brandDark: V6Colors.cyan900,
  brandTeal: V6Colors.cyan700,
  brandCyan: V6Colors.cyan600,
  slate: V6Colors.ink500,
  muted: V6Colors.ink400,
  error: '#ef4444',
} as const;
const Shadows = { card: V6Shadows.sm, input: V6Shadows.sm };

// Icon + blurb per real service category (the 5 seeded in the DB).
const CATEGORY_META: Record<string, { icon: typeof Wrench; desc: string }> = {
  Plumbing: { icon: Wrench, desc: 'Pipes, fixtures & repairs' },
  Cleaning: { icon: BrushCleaning, desc: 'Home & deep cleaning' },
  Handyman: { icon: Hammer, desc: 'Repairs & odd jobs' },
  Manicure: { icon: Sparkles, desc: 'Nail care & manicure' },
  Pedicure: { icon: Palette, desc: 'Foot care & pedicure' },
};

/**
 * Suggested tasks per category. Deliberately client-side: these are a starting
 * point for the homeowner, and what gets stored is the label they ended up
 * with, never a reference to this list — so it can be reworded or reordered
 * without touching jobs already posted. Anything missing goes in through
 * "Add your own".
 */
const TASK_PRESETS: Record<string, string[]> = {
  Plumbing: [
    'Fix leaking faucet',
    'Unclog drain',
    'Repair or replace pipes',
    'Fix toilet',
    'Install new fixture',
    'Check water heater',
  ],
  Cleaning: [
    'General house cleaning',
    'Deep clean',
    'Kitchen cleaning',
    'Bathroom cleaning',
    'Window cleaning',
    'Laundry and ironing',
  ],
  Handyman: [
    'Assemble furniture',
    'Mount TV or shelves',
    'Repair door or lock',
    'Paint touch-up',
    'Replace light fixture',
    'Minor carpentry',
  ],
  Manicure: [
    'Basic manicure',
    'Gel polish',
    'Nail art',
    'Polish removal',
    'Hand spa',
  ],
  Pedicure: [
    'Basic pedicure',
    'Foot spa',
    'Callus removal',
    'Gel polish (toes)',
    'Nail art (toes)',
  ],
};

/** The three real `job_urgency` values, with what each one actually does. */
const URGENCY_OPTIONS = [
  {
    value: 'urgent' as const,
    label: 'Urgent',
    blurb: 'Needed right away — providers are matched after 5 minutes.',
    icon: Zap,
    accent: '#ef4444',
  },
  {
    value: 'normal' as const,
    label: 'Normal',
    blurb: 'Within the next few days — matched after 10 minutes.',
    icon: Clock,
    accent: V6Colors.cyan700,
  },
  {
    value: 'flexible' as const,
    label: 'Flexible',
    blurb: 'No rush — the widest choice of providers, matched after 15 minutes.',
    icon: CheckCircle2,
    accent: '#0f766e',
  },
];

// Fallback coordinates (Metro Manila) when the client has no saved location.
const FALLBACK_COORDS = { latitude: 14.5995, longitude: 120.9842 };

const MAX_TASKS = 20;

type FieldErrors = Partial<
  Record<
    'title' | 'description' | 'location' | 'tasks' | 'date' | 'time' | 'budget' | 'terms',
    string
  >
>;

interface HOCreateJobScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  /**
   * Set when the flow was opened by tapping a category on Home's "Book a Job"
   * strip. That tap has already answered step 1, so the flow preselects the
   * category and opens on step 2 instead of asking the same question twice.
   * Step 1 stays reachable with Back if they picked the wrong tile.
   */
  initialCategoryId?: number | null;
}

export default function HOCreateJobScreen({
  onBack,
  onSuccess,
  initialCategoryId = null,
}: HOCreateJobScreenProps) {
  const { profile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);

  const [step, setStep] = useState(initialCategoryId ? 2 : 1);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [customTask, setCustomTask] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [budget, setBudget] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [urgency, setUrgency] = useState<'urgent' | 'normal' | 'flexible'>('normal');
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  // Which half of the submit is running — photo upload usually dominates the
  // wait, so saying so beats a single undifferentiated "Posting…".
  const [submitPhase, setSubmitPhase] = useState<'uploading' | 'posting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 5;
  const STEP_LABELS = ['Service', 'Location', 'Tasks', 'Urgency', 'Review'];
  const dateLabel = date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
  const timeLabel = time?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) ?? '';
  const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const presets = TASK_PRESETS[categoryName] ?? [];

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
    );

  const scheduledAt = date && time ? combineDateAndTime(date, time) : null;

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

  /**
   * Resolve the category tapped on Home once the list arrives. The name (not
   * just the id) is what drives the task presets and the drafted title, so we
   * wait for the fetch rather than guessing it. If the id isn't in the list —
   * a stale tile after a category is retired — fall back to asking on step 1
   * rather than posting the job under nothing.
   */
  const preselectApplied = useRef(false);
  useEffect(() => {
    // Once only: "Post another job" clears the form back to step 1, and it
    // would be wrong for the tile tapped on Home three screens ago to reappear.
    if (!initialCategoryId || preselectApplied.current || !categories.data) return;
    preselectApplied.current = true;
    const match = categories.data.find((c) => c.id === initialCategoryId);
    if (match) {
      setCategoryId(match.id);
      setCategoryName(match.name);
    } else {
      setStep(1);
    }
  }, [initialCategoryId, categories.data]);

  /** Prefill the address from the saved profile — most jobs are at home. */
  useEffect(() => {
    if (!location && profile?.address) setLocation(profile.address);
  }, [profile?.address]);

  /**
   * Draft the title and description from what the homeowner has picked, until
   * they write their own. The backend needs a title of 5+ and a description of
   * 20+ characters, and re-typing what the checklist already says is busywork
   * — but the moment they edit either field it is theirs and this stops.
   */
  useEffect(() => {
    if (!categoryName) return;
    if (!titleTouched) {
      setTitle(tasks.length ? `${categoryName}: ${tasks[0]}` : `${categoryName} service`);
    }
    if (!descriptionTouched) {
      setDescription(
        tasks.length
          ? `${categoryName} service needed. Tasks: ${tasks.join(', ')}.`
          : '',
      );
    }
  }, [categoryName, tasks, titleTouched, descriptionTouched]);

  const toggleTask = (label: string) => {
    clearError('tasks');
    setTasks((current) =>
      current.includes(label)
        ? current.filter((t) => t !== label)
        : current.length >= MAX_TASKS
          ? current
          : [...current, label],
    );
  };

  const addCustomTask = () => {
    const label = customTask.trim();
    if (!label || tasks.includes(label) || tasks.length >= MAX_TASKS) return;
    clearError('tasks');
    setTasks((current) => [...current, label.slice(0, 120)]);
    setCustomTask('');
  };

  const validateStep = (): boolean => {
    const errors: FieldErrors = {};

    if (step === 1 && !categoryId) {
      setFieldErrors({});
      setError('Please select a service.');
      return false;
    }

    if (step === 2 && !location.trim()) {
      errors.location = 'Please enter where the job is.';
    }

    if (step === 3) {
      if (tasks.length === 0) {
        errors.tasks = 'Pick at least one task so providers know what the job involves.';
      }
      const t = title.trim();
      if (t.length < 5) errors.title = 'Title must be at least 5 characters.';
      else if (t.length > 120) errors.title = 'Title cannot exceed 120 characters.';

      const d = description.trim();
      if (d.length < 20) errors.description = 'Description must be at least 20 characters.';
      else if (d.length > 750) errors.description = 'Description cannot exceed 750 characters.';
    }

    if (step === 4) {
      if (!date) errors.date = 'Please select a preferred date.';
      if (!time) errors.time = 'Please select a preferred time.';
      // A booking in the past is the one thing the API will refuse outright,
      // so it is caught here against the field that caused it.
      if (date && time && combineDateAndTime(date, time).getTime() < Date.now()) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (date < startOfToday) {
          errors.date = 'That date has already passed. Choose today or later.';
        } else {
          errors.time = 'That time has already passed today. Choose a later time.';
        }
      }
      if (!budget.trim()) errors.budget = 'Please set a budget for this job.';
      else if (!isValidBudget(budget)) {
        errors.budget = 'Enter a valid amount greater than 0, up to 2 decimal places.';
      }
    }

    if (step === 5 && !termsAccepted) {
      errors.terms = 'Please accept the Terms & Conditions to post this job.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(null);
      return false;
    }
    return true;
  };

  const pickPhotos = async () => {
    // The permission prompt and the picker itself can both take a beat to
    // appear on a cold gallery; without this the tile looks like a dead tap.
    setPickingPhotos(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo library access to add job photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 0.8,
      });
      if (!result.canceled) {
        // CreateJobDto caps photo_urls at 6 — trimming here beats a 400 later.
        setPhotos((current) => [...current, ...result.assets].slice(0, 6));
        setError(null);
      }
    } finally {
      setPickingPhotos(false);
    }
  };

  // Pre-request media library permission when entering the step that offers
  // photos, so the prompt arrives before the picker does.
  useEffect(() => {
    if (step === 3) {
      void (async () => {
        try {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        } catch {
          // The picker asks again at use time; nothing to recover here.
        }
      })();
    }
  }, [step]);

  const submitJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Upload first: a failed upload should not leave a job with dead photos.
      setSubmitPhase(photos.length ? 'uploading' : 'posting');
      const photo_urls = await Promise.all(
        photos.map((photo) => api.uploadImage('job-photos', photo.uri)),
      );

      setSubmitPhase('posting');
      await api.createJob({
        category_id: categoryId!,
        title: title.trim(),
        description: description.trim(),
        urgency,
        address: location.trim(),
        latitude: profile?.latitude ?? FALLBACK_COORDS.latitude,
        longitude: profile?.longitude ?? FALLBACK_COORDS.longitude,
        budget: Number(budget.replace(/,/g, '')),
        scheduled_at: scheduledAt!.toISOString(),
        photo_urls,
        tasks,
      });
      setStep(6); // success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the job.');
    } finally {
      setSubmitting(false);
      setSubmitPhase(null);
    }
  };

  /**
   * Whether the step on screen is still waiting on something of its own, which
   * is not the same as the form being submitted. Only two steps ever are:
   * step 1 has nothing to choose from until the categories arrive, and step 3
   * is handing off to the system photo picker. The other steps are pure local
   * input and are never "loading" — giving them a spinner would be theatre.
   */
  const stepBusy =
    (step === 1 && categories.loading) || (step === 3 && pickingPhotos);

  const handleNext = () => {
    if (!validateStep()) return;
    setError(null);
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void submitJob();
    }
  };

  const hasProgress = Boolean(
    categoryId || titleTouched || descriptionTouched || location.trim() || tasks.length ||
    date || time || budget.trim() || photos.length || termsAccepted,
  );

  const handleStepBack = () => {
    setError(null);
    if (step > 1 && step <= totalSteps) setStep((s) => s - 1);
  };

  /**
   * Back to step 1 with nothing carried over. Posting another job from the
   * success screen used to keep the previous job's answers, which is a good
   * way to post the same job twice by accident.
   */
  const startAnother = () => {
    setCategoryId(null);
    setCategoryName('');
    setTitle('');
    setTitleTouched(false);
    setDescription('');
    setDescriptionTouched(false);
    setTasks([]);
    setCustomTask('');
    setDate(null);
    setTime(null);
    setBudget('');
    setPhotos([]);
    setUrgency('normal');
    setTermsAccepted(false);
    setFieldErrors({});
    setError(null);
    setStep(1);
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
        clearError('time');
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
        onAccept={() => {
          setTermsAccepted(true);
          clearError('terms');
        }}
      />
    );
  }

  if (step === 6) {
    // Success screen
    return (
      <View style={styles.screen}>
        <View style={styles.successScreen}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={48} color={Colors.brandTeal} />
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
              <Text style={styles.successLabel}>Tasks</Text>
              <Text style={styles.successValue}>{tasks.length}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Urgency</Text>
              <Text style={styles.successValue}>
                {URGENCY_OPTIONS.find((o) => o.value === urgency)?.label}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnFullWidth]} onPress={onSuccess} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>View My Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={startAnother} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Post Another Job</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a dark hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleExit} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post a Job</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Stepper — matches .stepper/.step: 5 equal pills, filled for done/current */}
      <View style={styles.stepperWrap}>
        <View style={styles.stepper}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View key={i} style={[styles.step, i < step && styles.stepDone]} />
          ))}
        </View>
        <Text style={styles.stepperLabel}>
          Step {step} of {totalSteps} · {STEP_LABELS[step - 1]}
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1 · Service ─────────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Select a Service<Text style={styles.requiredAsterisk}> *</Text></Text>
            <Text style={styles.stepSubtitle}>What service do you need?</Text>
            {/* Skeleton tiles in the grid's own shape, so the step doesn't
                jump from a line of text to a two-column grid on arrival. */}
            {categories.loading && (
              <View style={styles.serviceGrid} accessibilityLabel="Loading services">
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={[styles.serviceCard, styles.serviceCardSkeleton]} />
                ))}
              </View>
            )}
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
                    onPress={() => {
                      if (cat.id !== categoryId) {
                        // Tasks belong to the category they were picked from.
                        setTasks([]);
                      }
                      setCategoryId(cat.id);
                      setCategoryName(cat.name);
                      setError(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Icon size={31} color={active ? Colors.brandTeal : Colors.brandDark} />
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

        {/* ── Step 2 · Location ────────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Location</Text>
            <Text style={styles.stepSubtitle}>Where does the work need to happen?</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TextInput
                style={[styles.input, styles.addressInput, focusedField === 'location' && styles.inputFocused, fieldErrors.location && styles.inputError]}
                placeholder="Brgy. Sampaguita, Lipa City"
                placeholderTextColor={Colors.muted}
                value={location}
                onChangeText={(value) => {
                  setLocation(value);
                  clearError('location');
                }}
                onFocus={() => {
                  setFocusedField('location');
                  clearError('location');
                }}
                onBlur={() => setFocusedField(null)}
                multiline
              />
              {!!fieldErrors.location && <Text style={styles.inputErrorText}>{fieldErrors.location}</Text>}
            </View>

            {!!profile?.address && profile.address !== location && (
              <TouchableOpacity
                style={styles.savedAddressBtn}
                onPress={() => {
                  setLocation(profile.address!);
                  clearError('location');
                }}
                activeOpacity={0.8}
              >
                <MapPin size={16} color={Colors.brandTeal} />
                <Text style={styles.savedAddressText} numberOfLines={1}>
                  Use my saved address — {profile.address}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                Providers see this address on the job and use the coordinates saved on
                your profile to work out how far away you are. Update them in Edit
                Profile if the map distance looks wrong.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 3 · Tasks ───────────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>What Needs Doing<Text style={styles.requiredAsterisk}> *</Text></Text>
            <Text style={styles.stepSubtitle}>
              Pick the tasks for this job. Your provider ticks these off as they work.
            </Text>

            <View style={styles.taskList}>
              {presets.map((preset) => {
                const selected = tasks.includes(preset);
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.taskChip, selected && styles.taskChipActive]}
                    onPress={() => toggleTask(preset)}
                    activeOpacity={0.85}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <View style={[styles.taskCheck, selected && styles.taskCheckActive]}>
                      {selected && <Check size={13} color={Colors.white} strokeWidth={3} />}
                    </View>
                    <Text style={[styles.taskChipText, selected && styles.taskChipTextActive]}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tasks the homeowner added themselves — shown apart so they can
                be removed even though they are not in the preset list. */}
            {tasks.filter((t) => !presets.includes(t)).length > 0 && (
              <View style={styles.customList}>
                {tasks
                  .filter((t) => !presets.includes(t))
                  .map((t) => (
                    <View key={t} style={styles.customTaskRow}>
                      <View style={[styles.taskCheck, styles.taskCheckActive]}>
                        <Check size={13} color={Colors.white} strokeWidth={3} />
                      </View>
                      <Text style={styles.customTaskText}>{t}</Text>
                      <TouchableOpacity onPress={() => toggleTask(t)} hitSlop={10}>
                        <Text style={styles.removeTaskText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            )}

            <View style={styles.addTaskRow}>
              <TextInput
                style={[styles.input, styles.addTaskInput, focusedField === 'customTask' && styles.inputFocused]}
                placeholder="Add your own task"
                placeholderTextColor={Colors.muted}
                value={customTask}
                onChangeText={setCustomTask}
                onFocus={() => setFocusedField('customTask')}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={addCustomTask}
                returnKeyType="done"
                maxLength={120}
              />
              <TouchableOpacity
                style={[styles.addTaskBtn, !customTask.trim() && styles.addTaskBtnDisabled]}
                onPress={addCustomTask}
                activeOpacity={0.85}
                disabled={!customTask.trim()}
              >
                <Plus size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.taskCount}>
              {tasks.length}/{MAX_TASKS} tasks selected
            </Text>
            {!!fieldErrors.tasks && <Text style={styles.inputErrorText}>{fieldErrors.tasks}</Text>}

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Job Title<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TextInput
                style={[styles.input, focusedField === 'title' && styles.inputFocused, fieldErrors.title && styles.inputError]}
                placeholder="e.g. 3-bedroom apartment deep clean"
                placeholderTextColor={Colors.muted}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setTitleTouched(true);
                  clearError('title');
                }}
                onFocus={() => {
                  setFocusedField('title');
                  clearError('title');
                }}
                onBlur={() => setFocusedField(null)}
                maxLength={120}
              />
              {!!fieldErrors.title && <Text style={styles.inputErrorText}>{fieldErrors.title}</Text>}
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
                    setDescriptionTouched(true);
                    clearError('description');
                  }}
                  onFocus={() => {
                    setFocusedField('description');
                    clearError('description');
                  }}
                  onBlur={() => setFocusedField(null)}
                  multiline
                  numberOfLines={3}
                  onContentSizeChange={(e) => {
                    const h = e.nativeEvent.contentSize.height;
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
              <Text style={styles.inputLabel}>Photos (optional)</Text>
              <TouchableOpacity
                style={styles.photoPicker}
                onPress={() => void pickPhotos()}
                activeOpacity={0.8}
                disabled={pickingPhotos}
              >
                {pickingPhotos ? (
                  <>
                    <ActivityIndicator size="small" color={Colors.brandTeal} />
                    <Text style={styles.photoPickerHint}>Opening your photo library…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.photoPickerTitle}>Add photos</Text>
                    <Text style={styles.photoPickerHint}>Up to 6 images to help providers understand the job.</Text>
                  </>
                )}
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
          </View>
        )}

        {/* ── Step 4 · Urgency, schedule & budget ──────────────────────── */}
        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>How Soon?</Text>
            <Text style={styles.stepSubtitle}>
              Urgency decides how long providers get to apply before we match you
              automatically.
            </Text>

            {URGENCY_OPTIONS.map((option) => {
              const active = urgency === option.value;
              const Icon = option.icon;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.urgencyCard, active && { borderColor: option.accent, backgroundColor: '#f8fdff' }]}
                  onPress={() => setUrgency(option.value)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={22} color={active ? option.accent : Colors.slate} />
                  <View style={styles.urgencyInfo}>
                    <Text style={[styles.urgencyLabel, active && { color: option.accent }]}>
                      {option.label}
                    </Text>
                    <Text style={styles.urgencyBlurb}>{option.blurb}</Text>
                  </View>
                  <View style={[styles.radio, active && { borderColor: option.accent }]}>
                    {active && <View style={[styles.radioDot, { backgroundColor: option.accent }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Preferred Date<Text style={styles.requiredAsterisk}> *</Text></Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, showDatePicker && styles.inputFocused, fieldErrors.date && styles.inputError]}
                onPress={() => { setShowTimePicker(false); setShowDatePicker(true); clearError('date'); }}
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
                onPress={() => { openTimePicker(); clearError('time'); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.pickerText, !time && styles.pickerPlaceholder]}>{timeLabel || 'Select a time'}</Text>
              </TouchableOpacity>
              {!!fieldErrors.time && <Text style={styles.inputErrorText}>{fieldErrors.time}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Budget<Text style={styles.requiredAsterisk}> *</Text></Text>
              <View style={[styles.budgetCard, focusedField === 'budget' && styles.budgetCardFocused, !!fieldErrors.budget && styles.inputError]}>
                <Text style={styles.budgetCurrency}>₱</Text>
                <TextInput
                  style={styles.budgetInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.muted}
                  value={budget}
                  onChangeText={(value) => {
                    setBudget(value);
                    clearError('budget');
                  }}
                  onFocus={() => {
                    setFocusedField('budget');
                    clearError('budget');
                  }}
                  onBlur={() => { setFocusedField(null); formatBudget(); }}
                  keyboardType="decimal-pad"
                />
              </View>
              {!!fieldErrors.budget && <Text style={styles.inputErrorText}>{fieldErrors.budget}</Text>}
              <Text style={styles.budgetHint}>
                Held in escrow when you hire someone, released when you mark the job complete.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 5 · Review ──────────────────────────────────────────── */}
        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>Review & Post</Text>
            <Text style={styles.stepSubtitle}>Check everything before posting</Text>

            <View style={styles.reviewCard}>
              {[
                { label: 'Service', value: categoryName || 'Not selected' },
                { label: 'Title', value: title || 'Untitled' },
                { label: 'Location', value: location || 'Not set' },
                { label: 'Date', value: dateLabel || 'Not set' },
                { label: 'Time', value: timeLabel || 'Not set' },
                { label: 'Urgency', value: URGENCY_OPTIONS.find((o) => o.value === urgency)?.label ?? '' },
                { label: 'Budget', value: budget ? peso(budget) : 'Not set' },
                { label: 'Photos', value: photos.length ? `${photos.length} selected` : 'None' },
              ].map((item) => (
                <View key={item.label} style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{item.label}</Text>
                  <Text style={styles.reviewValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.reviewSectionTitle}>Tasks ({tasks.length})</Text>
            <View style={styles.reviewCard}>
              {tasks.map((t) => (
                <View key={t} style={styles.reviewTaskRow}>
                  <Check size={15} color={Colors.brandTeal} strokeWidth={3} />
                  <Text style={styles.reviewTaskText}>{t}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => {
                setTermsAccepted((accepted) => !accepted);
                clearError('terms');
              }}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
            >
              <View style={[styles.termsCheck, termsAccepted && styles.termsCheckAccepted]}>
                {termsAccepted && <Check size={15} color={Colors.white} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>Terms & Conditions</Text><Text style={styles.requiredAsterisk}> *</Text> and understand that TaskBuddy holds payment until job completion.
              </Text>
            </TouchableOpacity>
            {!!fieldErrors.terms && <Text style={styles.inputErrorText}>{fieldErrors.terms}</Text>}
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
              (submitting || stepBusy) && styles.primaryBtnDisabled,
            ]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={submitting || stepBusy}
          >
            <View style={styles.primaryBtnInner}>
              {(submitting || stepBusy) && <ActivityIndicator size="small" color={Colors.white} />}
              <Text style={styles.primaryBtnText}>
                {submitPhase === 'uploading'
                  ? 'Uploading photos…'
                  : submitPhase === 'posting'
                    ? 'Posting…'
                    : step === totalSteps
                      ? 'Post Job'
                      : 'Next'}
              </Text>
            </View>
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
              // Past days are not selectable at all — the inline error below is
              // for the case the calendar cannot catch: today, but a time that
              // has already gone.
              minDate={dateKey(new Date())}
              onDayPress={(day) => {
                const [year, month, dayOfMonth] = day.dateString.split('-').map(Number);
                setDate(new Date(year, month - 1, dayOfMonth));
                clearError('date');
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
                  if (tempTime) {
                    setTime(tempTime);
                    clearError('time');
                  }
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
    backgroundColor: Colors.white,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  headerTitle: { color: Colors.ink900, fontSize: 18.5, fontWeight: '800', fontFamily: 'Inter' },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },

  // Stepper — matches .stepper/.step (5 equal pills)
  stepperWrap: { backgroundColor: Colors.white, paddingHorizontal: Spacing.screenH, paddingVertical: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.ink100 },
  stepDone: { backgroundColor: Colors.cyan600 },
  stepperLabel: { color: Colors.muted, fontSize: 12.5, fontFamily: 'Inter', marginTop: 8 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 24, paddingBottom: 20 },

  stepTitle: { color: Colors.brandDark, fontSize: 26.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
  stepSubtitle: { color: Colors.muted, fontSize: 16.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 21 },

  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, borderWidth: 2, borderColor: 'transparent',
    ...Shadows.card,
  },
  serviceCardActive: { borderColor: Colors.brandTeal, backgroundColor: '#F0FAFF' },
  // Same footprint as a real service card so the grid doesn't reflow on load.
  serviceCardSkeleton: { height: 118, backgroundColor: Colors.ink100 },
  serviceLabel: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  serviceLabelActive: { color: Colors.brandTeal },
  serviceDesc: { color: Colors.slate, fontSize: 14.5, fontFamily: 'Inter' },

  inputGroup: { marginBottom: 16 },
  inputLabel: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '600', fontFamily: 'Inter', marginBottom: 8 },
  input: {
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
    borderWidth: 1, borderColor: '#dce3e9',
    fontFamily: 'Inter', fontSize: 16.5, color: Colors.ink900,
  },
  addressInput: { minHeight: 70, paddingTop: 12, textAlignVertical: 'top' },
  inputFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  inputError: { borderColor: Colors.error, borderWidth: 2 },
  inputErrorText: { color: Colors.error, fontSize: 15.5, marginTop: 8, fontFamily: 'Inter' },
  requiredAsterisk: { color: Colors.error, fontWeight: '800' },
  pickerInput: { justifyContent: 'center', minHeight: 48 },
  pickerText: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 18.5 },
  pickerPlaceholder: { color: Colors.muted },

  savedAddressBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.cyan100, backgroundColor: '#f2fbfd',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  savedAddressText: { flex: 1, color: Colors.brandTeal, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
  noteCard: { backgroundColor: Colors.ink50, borderRadius: 14, padding: 14 },
  noteText: { color: Colors.slate, fontSize: 14, lineHeight: 19, fontFamily: 'Inter' },

  calendarOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  calendarModal: { backgroundColor: Colors.white, borderRadius: 24, padding: 20, ...Shadows.card },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarTitle: { color: Colors.brandDark, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  calendarClose: { color: Colors.brandTeal, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },

  textArea: { textAlignVertical: 'top', minHeight: 20 * 3, paddingTop: 12 },
  textAreaWrap: { position: 'relative' },
  charCount: { position: 'absolute', right: 12, bottom: 8, color: Colors.muted, fontSize: 14.5 },

  // Task selection
  taskList: { gap: 9 },
  taskChip: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#e6ecf1',
  },
  taskChipActive: { borderColor: Colors.brandTeal, backgroundColor: '#F5FCFF' },
  taskCheck: {
    width: 21, height: 21, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckActive: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  taskChipText: { flex: 1, color: Colors.ink800, fontSize: 15.5, fontFamily: 'Inter' },
  taskChipTextActive: { color: Colors.brandDark, fontWeight: '700' },

  customList: { marginTop: 9, gap: 9 },
  customTaskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#F5FCFF', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.brandTeal,
  },
  customTaskText: { flex: 1, color: Colors.brandDark, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  removeTaskText: { color: Colors.error, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

  addTaskRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  addTaskInput: { flex: 1 },
  addTaskBtn: {
    width: 48, borderRadius: 12, backgroundColor: Colors.brandTeal,
    alignItems: 'center', justifyContent: 'center',
  },
  addTaskBtnDisabled: { opacity: 0.4 },
  taskCount: { color: Colors.muted, fontSize: 13.5, fontFamily: 'Inter', marginTop: 8 },

  divider: { height: 1, backgroundColor: '#e6ecf1', marginVertical: 22 },

  photoPicker: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.brandTeal,
  },
  photoPickerTitle: { color: Colors.brandTeal, fontSize: 18.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  photoPickerHint: { color: Colors.slate, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 18 },
  photoList: { gap: 10, paddingTop: 12 },
  photoPreview: { width: 72, height: 72, borderRadius: 10, overflow: 'visible' },
  photoImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#E2E8F0' },
  removePhoto: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: Colors.white, fontSize: 21.5, lineHeight: 20, fontWeight: '700' },

  // Urgency
  urgencyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: 'transparent', marginBottom: 10,
    ...Shadows.card,
  },
  urgencyInfo: { flex: 1 },
  urgencyLabel: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  urgencyBlurb: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', lineHeight: 18 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },

  budgetCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent', ...Shadows.card,
  },
  budgetCardFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  budgetCurrency: { color: Colors.brandDark, fontSize: 39, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  budgetInput: { fontSize: 48, fontWeight: '800', fontFamily: 'Inter', color: Colors.brandDark, minWidth: 120 },
  budgetHint: { color: Colors.muted, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 12, lineHeight: 19 },

  reviewCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, marginBottom: 16, ...Shadows.card },
  reviewSectionTitle: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 10 },
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)',
  },
  reviewLabel: { color: Colors.slate, fontSize: 16.5, fontFamily: 'Inter' },
  reviewValue: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter', maxWidth: '55%', textAlign: 'right' },
  reviewTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  reviewTaskText: { flex: 1, color: Colors.brandDark, fontSize: 15.5, fontFamily: 'Inter' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  termsCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: '#64748B', backgroundColor: '#CBD5E1', marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  termsCheckAccepted: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  termsText: { flex: 1, color: Colors.slate, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 20 },
  termsLink: { color: Colors.brandTeal, fontWeight: '700', textDecorationLine: 'underline' },

  footer: { paddingHorizontal: Spacing.screenH, paddingVertical: 14, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.ink100 },
  footerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  previousBtn: { width: '48%', height: 46, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  previousBtnText: { color: Colors.ink700, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  primaryBtn: {
    backgroundColor: Colors.cyan700, borderRadius: 13, paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0891b2', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16, shadowRadius: 14, elevation: 4,
  },
  primaryBtnFullWidth: { width: '100%' },
  primaryBtnWithBack: { width: '48%', height: 46, paddingVertical: 0, justifyContent: 'center' },
  primaryBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: Colors.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter', letterSpacing: -0.005 },
  primaryBtnDisabled: { opacity: 0.7 },
  errorText: { color: Colors.error, fontSize: 15.5, fontFamily: 'Inter', marginBottom: 10, textAlign: 'center' },

  // Success
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  successTitle: { color: Colors.brandDark, fontSize: 34, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12, textAlign: 'center' },
  successSubtitle: { color: Colors.slate, fontSize: 16.5, fontFamily: 'Inter', lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  successCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, width: '100%', marginBottom: 28, ...Shadows.card },
  successRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  successLabel: { color: Colors.slate, fontSize: 16.5, fontFamily: 'Inter' },
  successValue: { color: Colors.brandDark, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  secondaryBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 13,
    borderWidth: 1, borderColor: Colors.brandTeal, width: '100%',
  },
  secondaryBtnText: { color: Colors.brandTeal, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
});
