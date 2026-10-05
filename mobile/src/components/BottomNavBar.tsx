import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LucideIcon } from 'lucide-react-native';
import Tap from './ui/Tap';

export type BottomNavItem<T extends string> = {
  key: T;
  label: string;
  icon: LucideIcon;
  /** Renders this item as the floating primary action above the bar. */
  primary?: boolean;
  /** Visible text when it differs from the accessibility label. */
  title?: string;
};

type BottomNavBarProps<T extends string> = {
  activeTab: T;
  tabs: readonly BottomNavItem<T>[];
  onTabPress: (tab: T) => void;
};

/** Height of the bar above the system inset; screens pad their lists by it. */
export const NAV_BAR_HEIGHT = 72;

/**
 * Shared Material 3 style bottom navigation for both roles: a tonal pill marks
 * the active tab (no animation between tabs, they are peers). A `primary` item
 * is shown as an extended floating button above the bar instead of a tab.
 */
export default function BottomNavBar<T extends string>({
  activeTab,
  tabs,
  onTabPress,
}: BottomNavBarProps<T>) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  // The app is edge-to-edge (enforced on targetSdk 36), so without the real
  // bottom inset the bar renders under the system navigation bar and the OS
  // eats every tap (BUG-002). Drive the bottom padding + height from the inset.
  const insets = useSafeAreaInsets();
  const primary = tabs.find((tab) => tab.primary);
  const PrimaryIcon = primary?.icon;

  return (
    <View>
      {primary && PrimaryIcon && (
        <View pointerEvents="box-none" style={styles.fabLayer}>
          <View style={styles.fabShadow}>
            <Tap
              testID={`nav-tab-${primary.key}`}
              accessibilityLabel={primary.label}
              accessibilityRole="button"
              style={styles.fab}
              rippleColor={Colors.rippleOnHero}
              scale
              onPress={() => onTabPress(primary.key)}
            >
              <PrimaryIcon size={20} color={Colors.onPrimary} strokeWidth={2.5} />
              <Text style={styles.fabLabel}>{primary.title ?? primary.label}</Text>
            </Tap>
          </View>
        </View>
      )}
      <View
        style={[
          styles.container,
          { height: NAV_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
        ]}
      >
        {tabs.filter((tab) => !tab.primary).map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeTab;
          return (
            <Tap
              key={tab.key}
              testID={`nav-tab-${tab.key}`}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={styles.tabButton}
              borderlessRipple
              onPress={() => onTabPress(tab.key)}
            >
              <View style={[styles.indicator, isActive && styles.indicatorActive]}>
                <Icon
                  size={22}
                  color={isActive ? Colors.activeIcon : Colors.navInactive}
                  strokeWidth={isActive ? 2.4 : 2}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const dark = theme.appearance === 'dark';
  const Colors = {
    ...V6Colors,
    navInactive: dark ? '#9aa3ad' : '#64748b',
    activeIcon: dark ? '#e0f2fe' : '#0c4a6e',
    activeLabel: dark ? '#f3f5f7' : '#0c4a6e',
  } as const;
  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: V6Colors.surface,
      paddingHorizontal: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: V6Colors.line,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingTop: 10,
      paddingBottom: 8,
    },
    indicator: {
      width: 60,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indicatorActive: {
      backgroundColor: dark ? V6Colors.primaryTonalStrong : V6Colors.primaryTonalStrong,
    },
    tabLabel: {
      color: Colors.navInactive,
      fontSize: 12,
      fontWeight: '600',
      fontFamily: 'Inter',
    },
    tabLabelActive: {
      color: Colors.activeLabel,
      fontWeight: '700',
    },
    fabLayer: {
      position: 'absolute',
      right: 16,
      bottom: '100%',
      marginBottom: 16,
    },
    fabShadow: {
      borderRadius: 18,
      elevation: 6,
      shadowColor: '#0c4a6e',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
      backgroundColor: V6Colors.primary,
    },
    fab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 56,
      paddingLeft: 18,
      paddingRight: 22,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: V6Colors.primary,
    },
    fabLabel: {
      color: V6Colors.onPrimary,
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'Inter',
    },
  });
  return { Colors, V6Colors, styles };
}
