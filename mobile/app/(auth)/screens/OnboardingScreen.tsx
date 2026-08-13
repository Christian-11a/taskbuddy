/**
 * OnboardingScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #onboarding screen — 3 slides
 * (icon well + title + subtitle + body), dots progress, "Skip" ghost button,
 * "Continue" / "Get Started" primary button.
 */

import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { Shield, Sparkles, Wallet } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const { width: W } = Dimensions.get('window');
const C = V6Colors;

interface Slide {
  id: string;
  Icon: typeof Sparkles;
  title: string;
  titleAccent: string;
  subtitle: string;
  body: string;
}

const slides: Slide[] = [
  {
    id: '1',
    Icon: Sparkles,
    title: 'Get trusted help',
    titleAccent: 'nearby',
    subtitle: 'Post what you need. We’ll help you find the right person.',
    body: 'Create a task, set your schedule and budget, then connect with verified local providers.',
  },
  {
    id: '2',
    Icon: Shield,
    title: 'Hire with',
    titleAccent: 'confidence',
    subtitle: 'Know who you’re working with.',
    body: 'Provider profiles, verification, ratings and clear job status help you make informed decisions.',
  },
  {
    id: '3',
    Icon: Wallet,
    title: 'Pay with',
    titleAccent: 'peace of mind',
    subtitle: 'Simple payments, clear progress.',
    body: 'Keep job communication and payment activity together from posting through completion.',
  },
];

interface OnboardingScreenProps {
  onFinish: () => void;
  onLogin: () => void;
}

export default function OnboardingScreen({ onFinish, onLogin }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    },
  ).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
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
      <View style={styles.iconWell}>
        <item.Icon size={42} color={C.cyan700} strokeWidth={1.7} />
      </View>
      <Text style={styles.title}>
        {item.title} <Text style={styles.titleAccent}>{item.titleAccent}</Text>
      </Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.skipRow}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.8}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
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
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dotIndicator, i === currentIndex && styles.dotIndicatorActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {currentIndex === slides.length - 1 ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.white,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  skipBtn: {
    backgroundColor: C.ink50,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: V6Radii.pill,
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
    paddingTop: 70,
    alignItems: 'center',
  },

  iconWell: {
    width: 92,
    height: 92,
    borderRadius: 26,
    backgroundColor: C.cyan50,
    borderWidth: 1,
    borderColor: C.cyan100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },

  title: {
    fontFamily: 'Inter',
    fontSize: 32.5,
    fontWeight: '800',
    letterSpacing: -0.81,
    color: C.ink900,
    textAlign: 'center',
    lineHeight: 33,
  },
  titleAccent: {
    color: C.cyan600,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 19,
    fontWeight: '700',
    color: C.cyan900,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 9,
  },
  body: {
    fontFamily: 'Inter',
    fontSize: 16.5,
    fontWeight: '400',
    color: C.ink500,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 300,
  },

  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 32,
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
    backgroundColor: C.cyan600,
    borderRadius: 4,
  },
  nextBtn: {
    width: '100%',
    backgroundColor: C.cyan700,
    borderRadius: V6Radii.btn,
    paddingVertical: 14,
    alignItems: 'center',
    ...V6Shadows.primaryButton,
  },
  nextBtnText: {
    color: C.white,
    fontSize: 18.5,
    fontWeight: '700',
    fontFamily: 'Inter',
  },
});
