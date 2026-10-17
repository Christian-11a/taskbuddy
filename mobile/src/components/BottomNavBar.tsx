import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LucideIcon } from 'lucide-react-native';
import Tap from './ui/Tap';
import { useTourAnchor } from './tour';

export type BottomNavItem<T extends string> = {
  key: T;
  label: string;
  icon: LucideIcon;
  /** Name the guided tour uses for this tab's anchor, `tab.<tourId>`. Defaults to the key. */
  tourId?: string;
  /** A count shown on the icon (e.g. unread messages); hidden when 0 or unset. */
  badge?: number;
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
 * the active tab (no animation between tabs, they are peers).
 */
export default function BottomNavBar<T extends string>({
  activeTab,
  tabs,
  onTabPress,
}: BottomNavBarProps<T>) {
  const theme = useThemedStyles(createThemedStyles);
  const { styles } = theme;
  // The app is edge-to-edge (enforced on targetSdk 36), so without the real
  // bottom inset the bar renders under the system navigation bar and the OS
  // eats every tap (BUG-002). Drive the bottom padding + height from the inset.
  const insets = useSafeAreaInsets();

  return (
    <View>
      <View
        style={[
          styles.container,
          { height: NAV_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
        ]}
      >
        {tabs.map((tab) => (
          <NavTab
            key={tab.key}
            tab={tab}
            isActive={tab.key === activeTab}
            theme={theme}
            onPress={() => onTabPress(tab.key)}
          />
        ))}
      </View>
    </View>
  );
}

type NavTheme = ReturnType<typeof createThemedStyles>;

/**
 * One tab. It is also a tour anchor, `tab.<tourId>` (or `tab.<key>`), so the
 * guided tour can point at it. Look, layout, labels and presses are unchanged.
 */
function NavTab<T extends string>({ tab, isActive, theme, onPress }: {
  tab: BottomNavItem<T>;
  isActive: boolean;
  theme: NavTheme;
  onPress: () => void;
}) {
  const { Colors, styles } = theme;
  const anchor = useTourAnchor(`tab.${tab.tourId ?? tab.key}`);
  const Icon = tab.icon;
  return (
    <Tap
      {...anchor}
      testID={`nav-tab-${tab.key}`}
      accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badge} unread` : tab.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      style={styles.tabButton}
      onPress={onPress}
    >
      {/* Keyed so the pill remounts when it turns on: Android drops the
          rounded corners if the background is applied on a re-render. */}
      <View key={isActive ? 'on' : 'off'} style={[styles.indicator, isActive && styles.indicatorActive]}>
        <Icon
          size={22}
          color={isActive ? Colors.activeIcon : Colors.navInactive}
          strokeWidth={isActive ? 2.4 : 2}
        />
        {!!tab.badge && (
          <View pointerEvents="none" style={styles.badge} testID={`nav-badge-${tab.key}`}>
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
              {tab.badge > 99 ? '99+' : tab.badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, isActive && styles.tabLabelActive]}
      >
        {tab.label}
      </Text>
    </Tap>
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
    badge: {
      position: 'absolute', top: -2, right: 8, minWidth: 18, height: 18, borderRadius: 9,
      paddingHorizontal: 4, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', fontFamily: 'Inter' },
    indicator: {
      width: 60,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indicatorActive: {
      backgroundColor: V6Colors.primaryTonalStrong,
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
  });
  return { Colors, V6Colors, styles };
}
