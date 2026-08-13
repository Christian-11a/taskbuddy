import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideIcon } from 'lucide-react-native';
import { Sizes, V6Colors } from '../constants/theme';

const Colors = {
  ...V6Colors,
  brandTeal: V6Colors.cyan700,
  // Mockup's final inactive-icon color (#94a3b8) — not one of the standard
  // ink tokens, so it's spelled out here rather than approximated.
  navInactive: '#94a3b8',
} as const;

export type BottomNavItem<T extends string> = {
  key: T;
  label: string;
  icon: LucideIcon;
  /** Renders this tab as the raised primary action. */
  primary?: boolean;
};

type BottomNavBarProps<T extends string> = {
  activeTab: T;
  tabs: readonly BottomNavItem<T>[];
  onTabPress: (tab: T) => void;
};

/** Shared, icon-based bottom navigation for both application roles. */
export default function BottomNavBar<T extends string>({
  activeTab,
  tabs,
  onTabPress,
}: BottomNavBarProps<T>) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === activeTab;

        if (tab.primary) {
          return (
            <TouchableOpacity
              key={tab.key}
              accessibilityLabel={tab.label}
              accessibilityRole="button"
              style={styles.primaryButtonWrap}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[Colors.cyan500, Colors.cyan700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButton}
              >
                <Icon size={25} color={Colors.white} strokeWidth={2.25} />
              </LinearGradient>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={styles.tabButton}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.8}
          >
            <View style={styles.iconWell}>
              <Icon
                size={22}
                color={isActive ? Colors.brandTeal : Colors.navInactive}
                strokeWidth={isActive ? 2.5 : 2}
              />
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    height: Sizes.navBarHeight,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: '#edf1f4',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWell: {
    width: 42,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: Colors.navInactive,
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  tabLabelActive: {
    color: Colors.brandTeal,
    fontWeight: '800',
  },
  primaryButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: '#0891b2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 8,
  },
});
