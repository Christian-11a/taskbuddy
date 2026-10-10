/**
 * OnboardingScreen.tsx
 *
 * Three slides with an illustration tile, a title, and body copy. Skip is
 * always on screen, a dot marks each slide, and one button moves on: Next,
 * then Get started on the last slide. The tile takes the role's colour from
 * the palette (homeowner blue, provider navy). The slides differ by role.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import { BadgeCheck, CalendarCheck, FileText, Search, Shield, ShieldCheck, Sparkles, Users } from 'lucide-react-native';
import { V6Shadows } from '../../../src/constants/theme';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

const { width: W } = Dimensions.get('window');

interface Slide {
  id: string;
  Icon: typeof Sparkles;
  title: string;
  /** Second part of the title, in the accent colour. */
  titleAccent?: string;
  subtitle?: string;
  body: string;
}

/**
 * Each role gets its own walkthrough: what to do first, and where in the app
 * to do it. Doubles as the first-run tutorial — the slides name the actual
 * tabs and buttons the user is about to see.
 */
const CLIENT_SLIDES: Slide[] = [
  {
    id: 'c1',
    Icon: FileText,
    title: 'Post what you need',
    body: 'Tap "What do you need done?" on Home, pick a service and describe the job. It takes about a minute.',
  },
  {
    id: 'c2',
    Icon: Users,
    title: 'Pick the',
    titleAccent: 'right provider',
    subtitle: 'Compare proposals from My Jobs.',
    body: 'Open a job to see who applied. Check each provider’s rating, reviews and past work before you hire.',
  },
  {
    id: 'c3',
    Icon: Shield,
    title: 'Pay with',
    titleAccent: 'peace of mind',
    subtitle: 'Your payment is held until the job is done.',
    body: 'Top up your Wallet, hire, then confirm completion to release payment. Something wrong? File a complaint from the job.',
  },
];

const PROVIDER_SLIDES: Slide[] = [
  {
    id: 'p1',
    Icon: BadgeCheck,
    title: 'Get',
    titleAccent: 'verified first',
    subtitle: 'Profile → Get Verified.',
    body: 'Upload a government ID and a quick face scan. Verified providers are trusted more and hired sooner.',
  },
  {
    id: 'p2',
    Icon: Search,
    title: 'Find jobs',
    titleAccent: 'near you',
    subtitle: 'Your Feed lists open jobs in your service area.',
    body: 'Open a job and tap Submit Proposal with a short message. Track your applications under My Work.',
  },
  {
    id: 'p3',
    Icon: ShieldCheck,
    title: 'Get hired, get paid safely',
    body: 'When a client hires you, the booking is confirmed automatically. Their payment is held safely and released to you after the job.',
  },
];

interface OnboardingScreenProps {
  role: 'homeowner' | 'provider' | null;
  onFinish: () => void;
  onLogin: () => void;
}

export default function OnboardingScreen({ role, onFinish, onLogin }: OnboardingScreenProps) {
  const { styles, Colors } = useThemedStyles(createThemedStyles);
  const slides = role === 'provider' ? PROVIDER_SLIDES : CLIENT_SLIDES;
  const layout = useAuthLayout();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isLast = currentIndex === slides.length - 1;

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    },
  ).current;

  const handleNext = () => {
    if (!isLast) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      onFinish();
    }
  };

  const handleSkip = () => {
    onLogin();
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.illustration}>
        <View style={styles.illustrationDisc}>
          <item.Icon size={44} color={Colors.primary} strokeWidth={1.8} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {item.title}
        {item.titleAccent ? (
          <>
            {' '}
            <Text style={styles.titleAccent}>{item.titleAccent}</Text>
          </>
        ) : null}
      </Text>
      {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom }]}>
      <View style={styles.skipRow}>
        <Tap
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.8}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Tap>
      </View>

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
      />

      <View style={styles.bottomBar}>
        <View
          style={styles.dots}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Slide ${currentIndex + 1} of ${slides.length}`}
        >
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dotIndicator, i === currentIndex && styles.dotIndicatorActive]}
            />
          ))}
        </View>

        <Tap
          style={styles.nextBtn}
          onPress={handleNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
        >
          <Text style={styles.nextBtnText}>{isLast ? 'Get started' : 'Next'}</Text>
        </Tap>
      </View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: Colors.surface,
    },
    skipRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
    },
    skipBtn: {
      backgroundColor: C.ink50,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 9999,
    },
    skipText: {
      color: C.ink700,
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'Inter',
    },

    slide: {
      width: W,
      paddingHorizontal: 24,
      paddingTop: 28,
      alignItems: 'center',
    },

    // The illustration: a tile in the role's tint with a white disc and the icon.
    illustration: {
      width: '100%',
      maxWidth: 360,
      height: 210,
      borderRadius: 28,
      backgroundColor: Colors.primaryTonal,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    illustrationDisc: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: C.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...V6Shadows.sm,
    },

    title: {
      fontFamily: 'Inter',
      fontSize: 30,
      fontWeight: '800',
      // A line height near the font size made Android clip the second line
      // of two-line titles ("Confirm and get / paid").
      letterSpacing: -0.5,
      color: C.ink900,
      textAlign: 'center',
      lineHeight: 38,
    },
    titleAccent: {
      color: Colors.link,
    },
    subtitle: {
      fontFamily: 'Inter',
      fontSize: 18,
      fontWeight: '700',
      color: C.ink900,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 9,
    },
    body: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
      color: C.ink500,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: 12,
      maxWidth: 320,
    },

    bottomBar: {
      paddingHorizontal: 24,
      paddingTop: 16,
      alignItems: 'center',
      gap: 16,
    },
    dots: {
      flexDirection: 'row',
      gap: 8,
    },
    dotIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.ink200,
    },
    dotIndicatorActive: {
      width: 24,
      backgroundColor: Colors.primary,
      borderRadius: 4,
    },
    nextBtn: {
      width: '100%',
      minHeight: 48,
      backgroundColor: Colors.primary,
      borderRadius: 13,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      ...V6Shadows.primaryButton,
    },
    nextBtnText: {
      color: Colors.onPrimary,
      fontSize: 17,
      fontWeight: '700',
      fontFamily: 'Inter',
    },
  });
  return { Colors, V6Colors, C, styles };
}
