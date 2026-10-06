import { useThemedStyles, type Palette as ThemePalette } from '../src/context/ThemeContext';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function SplashScreen() {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fadeOut = Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    });

    const timer = setTimeout(() => {
      fadeOut.start();
    }, 1800);

    return () => {
      clearTimeout(timer);
    };
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.safeArea, { opacity: fadeAnim }]}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.container}>
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/taskbuddy-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="TaskBuddy logo"
            />
            <Text style={styles.logoText}>TaskBuddy</Text>
          </View>
          <Text style={styles.tagline}>Hire with confidence, pay with ease.</Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: V6Colors.hero,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    logoBox: {
      alignItems: 'center',
      marginBottom: 24,
    },
    // Flat (no elevation): an Android shadow on a transparent image renders
    // unreliably and could hide the logo.
    logoImage: {
      width: 120,
      height: 120,
      marginBottom: 18,
    },
    logoText: {
      color: V6Colors.onPrimary,
      fontSize: 34.5,
      fontWeight: '800',
      fontFamily: 'Inter',
    },
    tagline: {
      color: V6Colors.ink200,
      fontSize: 17.5,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 280,
      fontFamily: 'Inter',
    },
  });
  return { Colors, V6Colors, styles };
}
