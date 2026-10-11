/**
 * OnboardingScreen.tsx
 *
 * Three story cards per role (copy from tourContent.introCards). Each card has
 * a small picture made of the app's own parts (IntroIllustrations), the
 * greeting uses the person's first name, and the cards set expectations only:
 * the spotlight tour on Home teaches the controls. Skip is always on screen and
 * a dot marks each card. The last card's button, "Show me around", starts the
 * tour. On a replay (from Help or the Home card) Skip reads "Close".
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import IntroIllustration, { type IllustrationKind } from '../../../src/components/onboarding/IntroIllustrations';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { SEVEN_DAYS_MS } from '../../../src/lib/persistentCache';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';
import { api, type Category } from '../../../src/lib/api';
import { introCards, type IntroCard, type WelcomeRole } from '../../../src/lib/tourContent';
import { V6Shadows } from '../../../src/constants/theme';

/** The picture on each card, in order, per role. */
const ILLUSTRATIONS: Record<WelcomeRole, readonly IllustrationKind[]> = {
  homeowner: ['services', 'proposals', 'heldMoney'],
  provider: ['feed', 'proposalToBooking', 'incoming'],
};

/** The picture tile takes about a third of the screen height, kept between these heights in dp. */
const TILE_MIN_HEIGHT = 210;
const TILE_MAX_HEIGHT = 280;
const TILE_SHARE_OF_SCREEN = 0.34;

interface OnboardingScreenProps {
  role: 'homeowner' | 'provider' | null;
  /** The name to greet on the first card. Missing means "there". */
  firstName?: string;
  /** Opened from Help or the Home card, not on first sign-in: Skip reads "Close". */
  replay?: boolean;
  /** The last card's button: starts the spotlight tour on Home. */
  onFinish: () => void;
  /** Skip, or Close on a replay. Kept under this name for the existing callers. */
  onLogin: () => void;
}

export default function OnboardingScreen({ role, firstName, replay = false, onFinish, onLogin }: OnboardingScreenProps) {
  const { styles } = useThemedStyles(createThemedStyles);
  const welcomeRole: WelcomeRole = role === 'provider' ? 'provider' : 'homeowner';
  const cards = introCards(welcomeRole, firstName);
  const layout = useAuthLayout();
  const { width, height } = useWindowDimensions();
  const tileHeight = Math.max(TILE_MIN_HEIGHT, Math.min(TILE_MAX_HEIGHT, height * TILE_SHARE_OF_SCREEN));
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isLast = currentIndex === cards.length - 1;

  // The client's first card shows real service chips. Providers never see them, so their lookup is skipped.
  // Only the client's list is the shared, saved 'categories'; the provider's empty list keeps its own key.
  const isClient = welcomeRole === 'homeowner';
  const categories = useAsyncData(
    () => (isClient ? api.categories() : Promise.resolve<Category[]>([])),
    [welcomeRole],
    isClient ? 'categories' : `onboarding-services-${welcomeRole}`,
    isClient ? { persist: true, maxAgeMs: SEVEN_DAYS_MS } : undefined,
  );
  const services = categories.data ?? [];

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    },
  ).current;

  const handleNext = () => {
    if (isLast) {
      onFinish();
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  // The card's content is centred in the space above the dots. A screen too small for it scrolls instead.
  const renderCard = ({ item, index }: { item: IntroCard; index: number }) => {
    const active = index === currentIndex;
    return (
      <ScrollView
        testID="intro-card"
        style={{ width }}
        contentContainerStyle={styles.slide}
        showsVerticalScrollIndicator={false}
      >
        <View testID="intro-illustration" style={[styles.illustration, { minHeight: tileHeight }]}>
          {/* Keyed by `active`, so a card's parts ease in each time it comes on screen. */}
          <IntroIllustration
            key={active ? 'on' : 'off'}
            kind={ILLUSTRATIONS[welcomeRole][index]}
            active={active}
            services={services}
          />
        </View>
        {/* Balanced breaks (Android) keep one word off a line of its own. */}
        <Text style={styles.title} accessibilityRole="header" textBreakStrategy="balanced">{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom }]}>
      <View style={styles.skipRow}>
        <Tap
          style={styles.skipBtn}
          onPress={onLogin}
          activeOpacity={0.8}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={replay ? 'Close' : 'Skip'}
        >
          <Text style={styles.skipText}>{replay ? 'Close' : 'Skip'}</Text>
        </Tap>
      </View>

      <FlatList
        ref={flatListRef}
        data={cards}
        renderItem={renderCard}
        extraData={`${currentIndex}-${services.length}`}
        keyExtractor={(_, index) => String(index)}
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
          accessibilityLabel={`Slide ${currentIndex + 1} of ${cards.length}`}
        >
          {cards.map((_, i) => (
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
          accessibilityLabel={isLast ? 'Show me around' : 'Next'}
        >
          <Text style={styles.nextBtnText}>{isLast ? 'Show me around' : 'Next'}</Text>
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

    // The card's block grows to fill the space above the dots and centres its content there.
    slide: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 24,
      alignItems: 'center',
    },

    // The picture well: the role's tint, holding the card's parts. Its height comes from the screen (see the
    // tile height above) and it grows further to fit larger text.
    illustration: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 28,
      backgroundColor: Colors.primaryTonal,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      marginBottom: 28,
      overflow: 'hidden',
    },

    title: {
      fontFamily: 'Inter',
      fontSize: 26,
      fontWeight: '800',
      // A line height near the font size made Android clip the second line
      // of two-line titles, so the line height stays well above the size.
      letterSpacing: -0.4,
      color: C.ink900,
      textAlign: 'center',
      lineHeight: 33,
    },
    body: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
      color: C.ink500,
      textAlign: 'center',
      lineHeight: 23,
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
