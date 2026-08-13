import React, { useEffect, useRef } from 'react';
import { Animated, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function SplashScreen() {
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
            <View style={styles.logoCircle} />
            <Text style={styles.logoText}>TaskBuddy</Text>
          </View>
          <Text style={styles.tagline}>Hire with confidence, pay with ease.</Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
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
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#38bdf8',
    marginBottom: 18,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 22,
    elevation: 8,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 34.5,
    fontWeight: '800',
  },
  tagline: {
    color: '#cbd5e1',
    fontSize: 17.5,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
});
