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

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  Modal,
  Image,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import SheetFrame from '../../../src/components/ui/SheetFrame';
import SuccessMark from '../../../src/components/ui/SuccessMark';
import {
  BrushCleaning,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Footprints,
  Hammer,
  Hand,
  MapPin,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { SEVEN_DAYS_MS } from '../../../src/lib/persistentCache';
import { useScreenBackHandler } from '../../../src/hooks/useLeaveGuard';
import { api, type GeocodedAddress } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';
import PhotoViewer from '../../../src/components/PhotoViewer';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import AddressField from '../../../src/components/AddressField';
import PostAppBar from '../../../src/components/post/PostAppBar';
import PostFooter from '../../../src/components/post/PostFooter';
import PostProgress from '../../../src/components/post/PostProgress';
import ServiceTile from '../../../src/components/post/ServiceTile';
import CalmNote from '../../../src/components/post/CalmNote';
import ReviewRow from '../../../src/components/post/ReviewRow';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import PostingChecklist, { type PostingStep } from '../../../src/components/post/PostingChecklist';
import Banner from '../../../src/components/ui/Banner';
import AddTaskRow from '../../../src/components/post/AddTaskRow';
import UrgencyRow from '../../../src/components/post/UrgencyRow';
import BudgetField from '../../../src/components/post/BudgetField';
import {
  DESCRIPTION_MAX,
  LOCATION_MAX,
  TASKS_MAX,
  TASK_MAX,
  combineDateAndTime,
  isValidBudget,
  reviseStepErrors,
  stepErrors,
  type PostFieldErrors,
  type PostFormValues,
} from '../../../src/lib/postJobRules';
import { nextAmountText } from '../../../src/lib/amountRules';
import { TITLE_MAX, cleanText } from '../../../src/lib/textRules';
import CheckRow from '../../../src/components/ui/CheckRow';
import TextField from '../../../src/components/ui/TextField';
import { requestAppPermission } from '../../../src/lib/permissions';
import { showToast } from '../../../src/components/Toast';

const Shadows = { card: V6Shadows.sm, input: V6Shadows.sm };

// Icon + blurb per real service category (the 5 seeded in the DB).
const CATEGORY_META: Record<string, { icon: typeof Wrench; desc: string }> = {
  Plumbing: { icon: Wrench, desc: 'Pipes, fixtures & repairs' },
  Cleaning: { icon: BrushCleaning, desc: 'Home & deep cleaning' },
  Handyman: { icon: Hammer, desc: 'Repairs & odd jobs' },
  Manicure: { icon: Sparkles, desc: 'Nail care & manicure' },
  Pedicure: { icon: Footprints, desc: 'Foot care & pedicure' },
};

/** What the job posted screen says happens next, in order. */
const NEXT_STEPS = [
  'Compare proposals on the job page',
  'Hire one; your money is held safely',
  'Pay only when the work is done',
];

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

type FieldErrors = PostFieldErrors;

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
  const { Colors, URGENCY_OPTIONS, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const { profile } = useAuth();
  const categories = useAsyncData(() => api.categories(), [], 'categories', {
    persist: true,
    maxAgeMs: SEVEN_DAYS_MS,
  });
  const insets = useSafeAreaInsets();
  const headerTop = insets.top + 28;

  const [step, setStep] = useState(initialCategoryId ? 2 : 1);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [resolvedCoordinates, setResolvedCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  // While typing, the Back/Next bar would ride up with the keyboard and cover
  // the address suggestions (I3); it comes back as soon as the keyboard closes.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [geocodedAddress, setGeocodedAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [tasks, setTasks] = useState<string[]>([]);
  const [customTask, setCustomTask] = useState('');
  // Why a task was not added (the list is full, or it is already there), said under the list.
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [tempTime, setTempTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [budget, setBudget] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [urgency, setUrgency] = useState<'urgent' | 'normal' | 'flexible'>('normal');
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  // Which half of the submit is running — photo upload usually dominates the
  // wait, so saying so beats a single undifferentiated "Posting…".
  const [submitPhase, setSubmitPhase] = useState<'uploading' | 'posting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set before the first await, so a second tap in the same frame cannot post the job twice.
  const postInFlight = useRef(false);

  const totalSteps = 5;
  const STEP_LABELS = ['Service', 'Where', 'Tasks', 'When & budget', 'Review'];
  const dateLabel = date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
  const timeLabel = time?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) ?? '';
  const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  const formValues = (): PostFormValues => ({
    categoryId, location, tasks, title, description, date, time, budget,
  });

  const presets = TASK_PRESETS[categoryName] ?? [];

  const scheduledAt = date && time ? combineDateAndTime(date, time) : null;

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
  // One ScrollView holds every step, so without this "Next" opened the new
  // step wherever the previous one had been scrolled to (usually the bottom).
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Partial<Record<keyof FieldErrors, number>>>({});
  // On short screens the keyboard covers the address suggestions, which sit
  // under the field. Once the keyboard is up, scroll the Address label to the
  // top so the suggestions have room.
  const addressFocused = useRef(false);
  useEffect(() => { addressFocused.current = false; }, [step]);
  useEffect(() => {
    if (step === 2 && keyboardUp && addressFocused.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, (fieldPositions.current.location ?? 0) - 8), animated: true });
    }
  }, [keyboardUp, step]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  // An error stays only while it is still true (see reviseStepErrors), so a field
  // that has become valid loses its message the moment it changes. Nothing new
  // appears here: errors come from Next alone.
  useEffect(() => {
    setFieldErrors((prev) => reviseStepErrors(prev, step, formValues(), new Date()));
  }, [step, categoryId, location, tasks, title, description, date, time, budget]);
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
    if (!location && profile?.address) {
      setLocation(profile.address);
      if (profile.latitude != null && profile.longitude != null) {
        setResolvedCoordinates({ latitude: profile.latitude, longitude: profile.longitude });
        setGeocodedAddress(profile.address);
      }
    }
  }, [profile?.address]);

  /**
   * A suggestion tapped in the address dropdown, or the reverse-geocoded GPS
   * fix, arrives already verified by the backend — so it fills the same two
   * pieces of state a successful `resolveAddress()` would, and step 2 moves on
   * without spending another geocode credit. A null means the text was edited
   * away from what was resolved, which puts the pin back to unverified.
   */
  const handleResolvedAddress = (resolved: GeocodedAddress | null) => {
    if (!resolved) {
      setResolvedCoordinates(null);
      setGeocodedAddress('');
      return;
    }
    setResolvedCoordinates({
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    });
    setGeocodedAddress(resolved.formatted_address.trim());
    clearError('location');
  };

  const resolveAddress = async (): Promise<boolean> => {
    const address = location.trim();
    if (!address) return false;
    if (address === geocodedAddress && resolvedCoordinates) return true;
    setGeocoding(true);
    setFieldErrors((prev) => ({ ...prev, location: undefined }));
    try {
      const coordinates = await api.geocodeAddress(address);
      setResolvedCoordinates(coordinates);
      setGeocodedAddress(address);
      return true;
    } catch (e) {
      setResolvedCoordinates(null);
      setGeocodedAddress('');
      setFieldErrors((prev) => ({
        ...prev,
        location: e instanceof Error ? e.message : 'We could not verify this address precisely.',
      }));
      return false;
    } finally {
      setGeocoding(false);
    }
  };

  /**
   * Draft the title and description from what the homeowner has picked, until
   * they write their own. The backend needs a title of 5+ and a description of
   * 20+ characters, and re-typing what the checklist already says is busywork
   * — but the moment they edit either field it is theirs and this stops.
   */
  useEffect(() => {
    if (!categoryName) return;
    // A draft is cut to the limit it has to meet, so it never fails the check it was written for.
    if (!titleTouched) {
      setTitle((tasks.length ? `${categoryName}: ${tasks[0]}` : `${categoryName} service`).slice(0, TITLE_MAX));
    }
    if (!descriptionTouched) {
      setDescription(
        tasks.length
          ? `${categoryName} service needed. Tasks: ${tasks.join(', ')}.`.slice(0, DESCRIPTION_MAX)
          : '',
      );
    }
  }, [categoryName, tasks, titleTouched, descriptionTouched]);

  const taskLimitNotice = `You can add up to ${TASKS_MAX} tasks.`;

  const toggleTask = (label: string) => {
    if (!tasks.includes(label) && tasks.length >= TASKS_MAX) {
      setTaskNotice(taskLimitNotice);
      return;
    }
    setTaskNotice(null);
    setTasks((current) =>
      current.includes(label)
        ? current.filter((t) => t !== label)
        : [...current, label],
    );
  };

  const addCustomTask = () => {
    const label = customTask.trim();
    if (!label) return;
    if (tasks.includes(label)) {
      setTaskNotice('That task is already on your list.');
      return;
    }
    if (tasks.length >= TASKS_MAX) {
      setTaskNotice(taskLimitNotice);
      return;
    }
    setTasks((current) => [...current, label.slice(0, TASK_MAX)]);
    setCustomTask('');
    setTaskNotice(null);
  };

  /**
   * Checks the step on screen. Errors appear only here, after Next, each under
   * the field that caused it; the first one scrolls into view. There is no
   * separate banner: a message above the buttons would say the same thing twice.
   */
  const validateStep = (): boolean => {
    const errors = stepErrors(step, formValues(), new Date());
    setFieldErrors(errors);
    const first = Object.keys(errors)[0] as keyof FieldErrors | undefined;
    if (first) {
      scrollRef.current?.scrollTo({ y: Math.max(0, (fieldPositions.current[first] ?? 0) - 12), animated: true });
      return false;
    }
    return true;
  };

  const pickPhotos = async () => {
    if (photos.length >= 6) {
      setPhotoMessage('You have already uploaded 6 photos. Remove a photo before adding another.');
      return;
    }

    // The permission prompt and the picker itself can both take a beat to
    // appear on a cold gallery; without this the tile looks like a dead tap.
    setPickingPhotos(true);
    try {
      if (!(await requestAppPermission('gallery'))) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 0.8,
      });
      if (!result.canceled) {
        // CreateJobDto caps photo_urls at 6 — trimming here beats a 400 later.
        const remainingSlots = 6 - photos.length;
        const selectedPhotos = result.assets.slice(0, remainingSlots);
        setPhotos((current) => [...current, ...selectedPhotos]);
        setPhotoMessage(
          result.assets.length > remainingSlots
            ? 'You can upload up to 6 photos. Remove a photo below if you want to add a different one.'
            : null,
        );
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
          await requestAppPermission('gallery');
        } catch {
          // The picker asks again at use time; nothing to recover here.
        }
      })();
    }
  }, [step]);

  const submitJob = async () => {
    postInFlight.current = true;
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
        title: cleanText(title),
        description: cleanText(description),
        urgency,
        address: location.trim(),
        latitude: resolvedCoordinates!.latitude,
        longitude: resolvedCoordinates!.longitude,
        budget: Number(budget.replace(/,/g, '')),
        scheduled_at: scheduledAt!.toISOString(),
        photo_urls,
        tasks,
      });
      setStep(6); // success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post the job.');
    } finally {
      postInFlight.current = false;
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

  const handleNext = async () => {
    if (postInFlight.current) {
      showToast("We're already posting your job. Please wait.", 'info');
      return;
    }
    if (!validateStep()) return;
    if (step === 2 && !(await resolveAddress())) return;
    setError(null);
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void submitJob();
    }
  };

  // The saved address is filled in up front, so it only counts once the homeowner types over it.
  const typedLocation = location.trim() !== '' && location.trim() !== (profile?.address ?? '').trim();
  const hasProgress = Boolean(
    categoryId || titleTouched || descriptionTouched || typedLocation || tasks.length || customTask.trim() ||
    date || time || budget.trim() || photos.length,
  );

  const handleStepBack = () => {
    setError(null);
    setFieldErrors({});
    if (step > 1 && step <= totalSteps) setStep((s) => s - 1);
  };

  /** The review's Edit links jump straight to a step. Next and Back still walk the flow in order. */
  const goToStep = (target: number) => {
    setError(null);
    setFieldErrors({});
    setStep(target);
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
    setLocation('');
    setResolvedCoordinates(null);
    setGeocodedAddress('');
    setTasks([]);
    setCustomTask('');
    setDate(null);
    setTime(null);
    setBudget('');
    setPhotos([]);
    setPhotoMessage(null);
    setUrgency('normal');
    setPhotoIndex(null);
    setFieldErrors({});
    setError(null);
    setStep(1);
  };

  /**
   * The header arrow and Android back do the same thing: one step back, and on the
   * first step leave, asking first if anything was entered. Nothing happens while
   * a post is in flight, and once the job is posted there is nothing to ask about.
   */
  const handleBack = () => {
    if (postInFlight.current) return;
    if (step === 6) {
      onBack();
      return;
    }
    if (step > 1) {
      handleStepBack();
      return;
    }
    if (hasProgress) {
      setShowExitConfirmation(true);
      return;
    }
    onBack();
  };
  // Android back comes here, not to App's handler, so each press steps back a step.
  useScreenBackHandler(handleBack);

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

  const urgencyLabel = URGENCY_OPTIONS.find((o) => o.value === urgency)?.label ?? '';
  const whenLine = [dateLabel, timeLabel, urgencyLabel].filter(Boolean).join(' · ') || 'Not set';
  // Only the steps the submit really runs: photos go up first, but only when there are any.
  const providersLine = categoryName ? `Nearby ${categoryName} providers` : 'Nearby providers';
  const photoStep: PostingStep = {
    key: 'photos',
    label: 'Uploading photos',
    state: submitPhase === 'posting' ? 'done' : 'active',
  };
  const postingSteps: PostingStep[] = [
    ...(photos.length > 0 ? [photoStep] : []),
    { key: 'post', label: 'Posting your job', state: 'active' },
  ];

  if (step === 6) {
    // Scrolls rather than a fixed centred view, so a long job title or address
    // can never push the buttons off a short phone.
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.successScreen}>
          <View style={styles.successMarkWrap}>
            <SuccessMark
              size={112}
              fallback={(
                <View style={styles.successIcon}>
                  <Check size={48} color={Colors.onPrimary} strokeWidth={2.5} />
                </View>
              )}
            />
          </View>
          <Text style={styles.successTitle}>Job posted!</Text>
          <Text style={styles.successSubtitle}>
            {providersLine} can now send you proposals. We'll notify you when the first one arrives.
          </Text>
          <View style={styles.successCard}>
            {NEXT_STEPS.map((line) => (
              <View key={line} style={styles.nextRow}>
                <Check size={16} color={V6Colors.link} strokeWidth={3} />
                <Text style={styles.nextText}>{line}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <BottomActionBar
          primaryLabel="View my jobs"
          onPrimary={onSuccess}
          secondaryLabel="Post another job"
          onSecondary={startAnother}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PhotoViewer photos={photos} index={photoIndex} onIndexChange={setPhotoIndex}
        onClose={() => setPhotoIndex(null)} />
      <PostAppBar
        title="Post a job"
        onBack={handleBack}
        backLabel={step > 1 ? 'Previous step' : undefined}
        topInset={headerTop}
      />
      {!submitting && <PostProgress step={step} total={totalSteps} label={STEP_LABELS[step - 1]} />}

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={24}
      >
        <KeyboardAwareScrollView keyboardDismissMode="on-drag"
          ref={scrollRef}
          testID="create-job-form-scroll"
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* ── Step 1 · Service ─────────────────────────────────────────── */}
        {/* ── Posting · the submit, shown as the steps that really happen ──── */}
        {submitting && (
          <View>
            <Text style={styles.stepTitle}>Posting your job...</Text>
            <Text style={styles.stepSubtitle}>This usually takes a few seconds. Please keep the app open.</Text>
            <PostingChecklist steps={postingSteps} />
          </View>
        )}

        {!submitting && step === 1 && (
          <View>
            <Text style={styles.stepTitle}>What do you need help with?</Text>
            {/* Skeleton tiles in the grid's own shape, so the step doesn't
                jump from a line of text to a two-column grid on arrival. */}
            {categories.loading && (
              <View style={styles.serviceGrid} accessibilityLabel="Loading services">
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={styles.serviceSkeleton} />
                ))}
              </View>
            )}
            {!!categories.error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{categories.error}</Text>}
            <View
              style={styles.serviceGrid}
              onLayout={(event) => { fieldPositions.current.service = event.nativeEvent.layout.y; }}
            >
              {(categories.data ?? []).map((cat) => {
                const meta = CATEGORY_META[cat.name] ?? { icon: Hand, desc: '' };
                return (
                  <ServiceTile
                    key={cat.id}
                    name={cat.name}
                    detail={meta.desc || undefined}
                    icon={meta.icon}
                    selected={categoryId === cat.id}
                    onSelect={() => {
                      if (cat.id !== categoryId) {
                        // Tasks belong to the category they were picked from.
                        setTasks([]);
                      }
                      setCategoryId(cat.id);
                      setCategoryName(cat.name);
                      setError(null);
                    }}
                  />
                );
              })}
            </View>
            {!!fieldErrors.service && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{fieldErrors.service}</Text>}
          </View>
        )}

        {/* ── Step 2 · Location ────────────────────────────────────────── */}
        {!submitting && step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Where is the job?</Text>
            <Text style={styles.stepSubtitle}>Providers see this on the job.</Text>

            <View onLayout={(event) => { fieldPositions.current.location = event.nativeEvent.layout.y; }} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <AddressField
                testID="create-job-address"
                value={location}
                maxLength={LOCATION_MAX}
                onChangeText={setLocation}
                onResolve={handleResolvedAddress}
                onFocus={() => { addressFocused.current = true; }}
                onBlur={() => { addressFocused.current = false; }}
                error={fieldErrors.location}
                hint={geocoding ? 'Verifying address…' : undefined}
              />
              {!!resolvedCoordinates && (
                <View style={styles.confirmedRow}>
                  <Check size={14} color={Colors.successText} strokeWidth={3} />
                  <Text style={styles.confirmedText}>Location confirmed</Text>
                </View>
              )}
            </View>

            {/* The one place this step explains a location that is not confirmed yet. */}
            {!resolvedCoordinates && !fieldErrors.location && (
              <View style={styles.calmWrap}>
                <CalmNote text="Location is off, so we couldn't find you. Typing the address works just as well." />
              </View>
            )}

            {!!profile?.address && profile.address !== location && (
              <Tap
                style={styles.savedAddressBtn}
                onPress={() => {
                  setLocation(profile.address!);
                  setResolvedCoordinates(
                    profile.latitude != null && profile.longitude != null
                      ? { latitude: profile.latitude, longitude: profile.longitude }
                      : null,
                  );
                  setGeocodedAddress(profile.latitude != null && profile.longitude != null ? profile.address! : '');
                  clearError('location');
                }}
                activeOpacity={0.8}
              >
                <MapPin size={16} color={V6Colors.link} />
                <Text style={styles.savedAddressText} numberOfLines={1}>
                  Use my saved address — {profile.address}
                </Text>
              </Tap>
            )}

          </View>
        )}

        {/* ── Step 3 · Tasks ───────────────────────────────────────────── */}
        {!submitting && step === 3 && (
          <View>
            <Text style={styles.stepTitle}>What needs doing?</Text>
            <Text style={styles.stepSubtitle}>
              Pick the tasks for this job. Your provider ticks these off as they work.
            </Text>

            <View style={styles.taskList}>
              {presets.map((preset) => (
                <CheckRow
                  key={preset}
                  label={preset}
                  checked={tasks.includes(preset)}
                  onToggle={() => toggleTask(preset)}
                />
              ))}
              {/* Tasks the homeowner added themselves: checked, so tapping one takes it off. */}
              {tasks.filter((t) => !presets.includes(t)).map((t) => (
                <CheckRow key={`custom-${t}`} label={t} checked onToggle={() => toggleTask(t)} />
              ))}
            </View>

            <View style={styles.addTaskRow}>
              <AddTaskRow
                value={customTask}
                onChangeText={(text) => { setCustomTask(text); setTaskNotice(null); }}
                onSubmit={addCustomTask}
              />
            </View>
            <Text style={styles.taskCount}>
              {tasks.length}/{TASKS_MAX} tasks selected
            </Text>
            {!!taskNotice && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{taskNotice}</Text>}
            {!!fieldErrors.tasks && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{fieldErrors.tasks}</Text>}

            <View style={styles.divider} />

            <View onLayout={(event) => { fieldPositions.current.title = event.nativeEvent.layout.y; }} style={styles.inputGroup}>
              <TextField
                label="Job title"
                placeholder="e.g. 3-bedroom apartment deep clean"
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setTitleTouched(true);
                }}
                helper="Written for you from the tasks; edit if you like"
                error={fieldErrors.title}
                submitted
                maxLength={TITLE_MAX}
              />
            </View>

            <KeyboardAvoidingView onLayout={(event) => { fieldPositions.current.description = event.nativeEvent.layout.y; }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.inputGroup}>
              <TextField
                label="Description"
                placeholder="Describe the job in detail..."
                value={description}
                onChangeText={(value) => {
                  setDescription(value);
                  setDescriptionTouched(true);
                }}
                error={fieldErrors.description}
                submitted
                multiline
                numberOfLines={3}
                style={descriptionHeight ? { height: descriptionHeight } : undefined}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  const minH = 20 * 3; // approx lineHeight 20
                  setDescriptionHeight(Math.max(h, minH));
                }}
                maxLength={DESCRIPTION_MAX}
              />
              <Text style={styles.charCount}>{description.length}/{DESCRIPTION_MAX}</Text>
            </View>
            </KeyboardAvoidingView>

            <View style={styles.inputGroup}>
              <Tap
                style={styles.photoPicker}
                onPress={() => void pickPhotos()}
                activeOpacity={0.8}
                disabled={pickingPhotos}
                accessibilityRole="button"
                accessibilityLabel="Add photos (optional)"
              >
                <View style={styles.photoWell}>
                  {pickingPhotos
                    ? <ActivityIndicator size="small" color={V6Colors.link} />
                    : <Camera size={22} color={V6Colors.link} />}
                </View>
                <View style={styles.photoText}>
                  <Text style={styles.photoPickerTitle}>
                    {pickingPhotos ? 'Opening your photo library…' : 'Add photos (optional)'}
                  </Text>
                  <Text style={styles.photoPickerHint}>Helps providers understand the job</Text>
                </View>
              </Tap>
              {!!photoMessage && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{photoMessage}</Text>}
              {photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoPreview}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      <Tap
                        style={styles.removePhoto}
                        onPress={() => {
                          setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
                          setPhotoMessage(null);
                        }}
                        accessibilityLabel={`Remove photo ${index + 1}`}
                      >
                        <Text style={styles.removePhotoText}>×</Text>
                      </Tap>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* ── Step 4 · Urgency, schedule & budget ──────────────────────── */}
        {!submitting && step === 4 && (
          <View>
            <Text style={styles.stepTitle}>When, and how much?</Text>
            <Text style={styles.sectionLabel}>How soon?</Text>

            {URGENCY_OPTIONS.map((option) => (
              <UrgencyRow
                key={option.value}
                label={option.label}
                blurb={option.blurb}
                icon={option.icon}
                selected={urgency === option.value}
                onSelect={() => setUrgency(option.value)}
              />
            ))}

            <View
              style={styles.dateTimeRow}
              onLayout={(event) => {
                // Both pickers share this row, so both scroll to its top edge.
                fieldPositions.current.date = event.nativeEvent.layout.y;
                fieldPositions.current.time = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.dateTimeCol}>
                <Text style={styles.inputLabel}>Date</Text>
                <Tap
                  style={[styles.input, styles.pickerInput, showDatePicker && styles.inputFocused, fieldErrors.date && styles.inputError]}
                  onPress={() => { setShowTimePicker(false); setShowDatePicker(true); }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Date"
                >
                  <Text style={[styles.pickerText, !date && styles.pickerPlaceholder]}>{dateLabel || 'Pick a date'}</Text>
                </Tap>
                {!!fieldErrors.date && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{fieldErrors.date}</Text>}
              </View>
              <View style={styles.dateTimeCol}>
                <Text style={styles.inputLabel}>Time</Text>
                <Tap
                  style={[styles.input, styles.pickerInput, showTimePicker && styles.inputFocused, fieldErrors.time && styles.inputError]}
                  onPress={openTimePicker}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Time"
                >
                  <Text style={[styles.pickerText, !time && styles.pickerPlaceholder]}>{timeLabel || 'Pick a time'}</Text>
                </Tap>
                {!!fieldErrors.time && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{fieldErrors.time}</Text>}
              </View>
            </View>

            <View onLayout={(event) => { fieldPositions.current.budget = event.nativeEvent.layout.y; }} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Budget</Text>
              {/* Its own component, so the reveal finds the scroll view around it (see BudgetField). */}
              <BudgetField
                value={budget}
                invalid={!!fieldErrors.budget}
                onChangeText={(text) => setBudget((previous) => nextAmountText(previous, text))}
                onBlur={formatBudget}
              />
              {!!fieldErrors.budget && <Text style={styles.inputErrorText} accessibilityLiveRegion="polite">{fieldErrors.budget}</Text>}
              <Text style={styles.budgetHint}>You only pay when you hire. It's held safely until the job is done.</Text>
            </View>
          </View>
        )}

        {/* ── Step 5 · Review ──────────────────────────────────────────── */}
        {!submitting && step === 5 && (
          <View testID="create-job-review">
            <Text testID="create-job-review-title" style={styles.stepTitle}>Check your job</Text>

            {/* Everything entered, one answer per row. Each Edit goes back to the step that holds it. */}
            <View style={styles.reviewCard}>
              <ReviewRow first label="Service" value={categoryName || 'Not selected'} onEdit={() => goToStep(1)} />
              <ReviewRow label="Title" value={title || 'Untitled'} onEdit={() => goToStep(3)} />
              <ReviewRow label="Where" value={location || 'Not set'} onEdit={() => goToStep(2)} />
              <ReviewRow
                label="Tasks"
                value={tasks.length ? tasks.join(' · ') : 'Not set'}
                onEdit={() => goToStep(3)}
              />
              <ReviewRow label="Description" value={description || 'Not set'} onEdit={() => goToStep(3)} />
              <ReviewRow label="When" value={whenLine} onEdit={() => goToStep(4)} />
              <ReviewRow
                label="Budget"
                value={budget ? peso(budget) : 'Not set'}
                strong
                onEdit={() => goToStep(4)}
              />
              {photos.length > 0 && (
                <ReviewRow label={`Photos (${photos.length})`} onEdit={() => goToStep(3)}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
                    {photos.map((photo, index) => (
                      <Tap key={photo.uri} onPress={() => setPhotoIndex(index)}
                        accessibilityLabel={`Open selected photo ${index + 1}`}>
                        <Image source={{ uri: photo.uri }} style={styles.photoImage}
                          resizeMode="contain" />
                      </Tap>
                    ))}
                  </ScrollView>
                </ReviewRow>
              )}
            </View>

            <Banner tone="info" message="You only pay when you hire. You can cancel for free until then." />
            {/* A failed post comes back here, with the Post job button still available. */}
            {!!error && <View style={styles.reviewError}><Banner tone="error" message={error} /></View>}

          </View>
        )}

        <View style={{ height: 20 }} />
        </KeyboardAwareScrollView>
        {/* The bar lives inside the keyboard-avoiding view, so it rises above the keyboard
            instead of hiding under it. BUG-005: the bar keeps clear of the system nav bar. */}
        {!submitting && (
          <PostFooter
            onBack={step > 1 ? handleStepBack : undefined}
            onNext={handleNext}
            nextLabel={step === totalSteps ? 'Post job' : 'Next'}
            busy={stepBusy}
          />
        )}
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={showExitConfirmation}
        title="Discard this job?"
        message="Your answers will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setShowExitConfirmation(false)}
        onConfirm={() => {
          setShowExitConfirmation(false);
          onBack();
        }}
      />

      <SheetFrame
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        dismissible={false}
        contentStyle={styles.calendarModal}
      >
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>Select a date</Text>
              <Tap onPress={() => setShowDatePicker(false)} hitSlop={10}>
                <Text style={styles.calendarClose}>Close</Text>
              </Tap>
            </View>
            <Calendar key={appearance}
              current={calendarMonth ?? (date ? dateKey(date) : undefined)}
              onMonthChange={(month) => setCalendarMonth(month.dateString)}
              // Past days are not selectable at all — the inline error below is
              // for the case the calendar cannot catch: today, but a time that
              // has already gone.
              minDate={dateKey(new Date())}
              onDayPress={(day) => {
                const [year, month, dayOfMonth] = day.dateString.split('-').map(Number);
                setDate(new Date(year, month - 1, dayOfMonth));
                setShowDatePicker(false);
              }}
              markedDates={date ? { [dateKey(date)]: { selected: true, selectedColor: Colors.brandTeal } } : undefined}
              renderArrow={(direction: 'left' | 'right') => (direction === 'left'
                ? <ChevronLeft size={22} color={V6Colors.link} />
                : <ChevronRight size={22} color={V6Colors.link} />)}
              theme={{ calendarBackground: V6Colors.surface, dayTextColor: V6Colors.ink900, monthTextColor: V6Colors.ink900, textDisabledColor: V6Colors.ink400, todayTextColor: V6Colors.link, arrowColor: V6Colors.link, selectedDayBackgroundColor: V6Colors.primary, textSectionTitleColor: V6Colors.ink700, textDayFontFamily: 'Inter', textMonthFontFamily: 'Inter', textDayHeaderFontFamily: 'Inter', textMonthFontWeight: '700', textDayHeaderFontWeight: '600', textMonthFontSize: 17, arrowStyle: { padding: 12 } }}
            />
      </SheetFrame>

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
        <DateTimePicker themeVariant={appearance}
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
                <Tap onPress={() => setShowTimePicker(false)} hitSlop={10}>
                  <Text style={styles.calendarClose}>Close</Text>
                </Tap>
              </View>

              <DateTimePicker themeVariant={appearance}
                value={tempTime ?? new Date()}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
              />

              <Tap
                style={[styles.primaryBtn, { marginTop: 16 }]}
                onPress={() => {
                  if (tempTime) {
                    setTime(tempTime);
                  }
                  setShowTimePicker(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Done</Text>
              </Tap>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const Colors = {
    ...V6Colors,
    background: V6Colors.canvas,
    brandDark: V6Colors.cyan900,
    brandTeal: V6Colors.cyan700,
    brandCyan: V6Colors.cyan600,
    slate: V6Colors.ink500,
    muted: V6Colors.ink400,
  } as const;
  // What each urgency means, in plain words. The backend's matching windows
  // (see the note at the top of this file) still apply; they are not repeated here.
  const URGENCY_OPTIONS = [
    { value: 'flexible' as const, label: 'Flexible', blurb: 'Any day that works for you', icon: CalendarDays },
    { value: 'normal' as const, label: 'Normal', blurb: 'Within a few days', icon: Clock },
    { value: 'urgent' as const, label: 'Urgent', blurb: 'You need someone today', icon: Zap },
  ];
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.background },


    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 24, paddingBottom: 20 },

    stepTitle: { color: V6Colors.ink900, fontSize: 23, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
    stepSubtitle: { color: Colors.muted, fontSize: 16.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 21 },
    serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // Same footprint as a real service tile so the grid doesn't reflow on load.
    serviceSkeleton: { width: '48%', height: 124, borderRadius: 16, backgroundColor: Colors.ink100 },

    inputGroup: { marginBottom: 16 },
    inputLabel: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', marginBottom: 6 },
    input: {
      backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
      borderWidth: 1, borderColor: V6Colors.fieldBorder,
      fontFamily: 'Inter', fontSize: 16.5, color: Colors.ink900,
    },
    inputFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
    inputError: { borderColor: Colors.dangerText, borderWidth: 1.5 },
    inputErrorText: { color: Colors.dangerText, fontSize: 13.5, lineHeight: 18, marginTop: 6, fontFamily: 'Inter' },
    pickerInput: { justifyContent: 'center', minHeight: 48 },
    pickerText: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 18.5 },
    pickerPlaceholder: { color: Colors.muted },

    // A text action, styled like the locate link under the field.
    savedAddressBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 8 },
    savedAddressText: { flex: 1, color: V6Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    confirmedText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    calmWrap: { marginTop: 16 },

    calendarOverlay: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'center', padding: 20 },
    calendarModal: { backgroundColor: Colors.surface, borderRadius: 24, padding: 20, ...Shadows.card },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    calendarTitle: { color: V6Colors.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
    calendarClose: { color: V6Colors.link, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },

    charCount: { alignSelf: 'flex-end', color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter', marginTop: 6 },

    // Task selection: whole-row CheckRows, then the add row
    taskList: { gap: 8 },
    addTaskRow: { marginTop: 12 },
    taskCount: { color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter', marginTop: 10 },

    divider: { height: 1, backgroundColor: V6Colors.line, marginVertical: 22 },

    photoPicker: {
      flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, padding: 14, borderRadius: 16,
      backgroundColor: Colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary,
    },
    photoWell: {
      width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    photoText: { flex: 1 },
    photoPickerTitle: { color: V6Colors.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    photoPickerHint: { color: V6Colors.ink500, fontSize: 13.5, fontFamily: 'Inter', lineHeight: 18, marginTop: 2 },
    photoList: { gap: 10, paddingTop: 12 },
    photoPreview: { width: 72, height: 72, borderRadius: 10, overflow: 'visible' },
    photoImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: V6Colors.ink100 },
    removePhoto: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.dangerSolid, alignItems: 'center', justifyContent: 'center' },
    removePhotoText: { color: Colors.onPrimary, fontSize: 21.5, lineHeight: 20, fontWeight: '700' },

    dateTimeRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16 },
    dateTimeCol: { flex: 1 },
    sectionLabel: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginBottom: 10 },

    budgetHint: { color: V6Colors.ink500, fontSize: 13.5, fontFamily: 'Inter', lineHeight: 18, marginTop: 8 },

    reviewCard: {
      backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: V6Colors.line,
      paddingHorizontal: 16, paddingBottom: 4, marginBottom: 16,
    },
    reviewError: { marginTop: 12 },

    primaryBtn: {
      backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, minHeight: 44, justifyContent: 'center',
      alignItems: 'center',
      shadowColor: Colors.primary, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16, shadowRadius: 14, elevation: 4,
    },
    primaryBtnText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', letterSpacing: -0.005 },
    errorText: { color: Colors.dangerText, fontSize: 15, lineHeight: 20, fontFamily: 'Inter', marginBottom: 10, textAlign: 'center' },

    // Success
    successScreen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    successMarkWrap: { alignItems: 'center', marginBottom: 20 },
    // The static fallback for reduced motion: the same solid green disc the animation draws.
    successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.successSolid, alignItems: 'center', justifyContent: 'center' },
    successTitle: { color: V6Colors.ink900, fontSize: 28, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12, textAlign: 'center' },
    successSubtitle: { color: V6Colors.ink700, fontSize: 16, fontFamily: 'Inter', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
    successCard: {
      backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: V6Colors.line,
      padding: 18, width: '100%', gap: 12,
    },
    nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    nextText: { flex: 1, color: V6Colors.ink900, fontSize: 15, lineHeight: 21, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, URGENCY_OPTIONS, styles };
}
