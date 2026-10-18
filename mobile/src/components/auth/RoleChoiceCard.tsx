import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Home, Wrench } from 'lucide-react-native';
import Tap from '../ui/Tap';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type RoleChoice = 'homeowner' | 'provider';

/** Copy for the two roles. Sign-up and Google sign-up both use these. */
export const ROLE_CHOICE_COPY: Record<RoleChoice, { title: string; body: string; tag: string }> = {
  homeowner: {
    title: 'I need help at home',
    body: 'Post jobs, compare proposals, hire and pay safely.',
    tag: 'Client',
  },
  provider: {
    title: 'I want to work',
    body: 'Find jobs near you, send proposals and get paid.',
    tag: 'Service provider',
  },
};

type RoleChoiceCardProps = {
  role: RoleChoice;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * A big role card with a radio. Homeowner's tile is the brand blue and the
 * provider's is the navy from the palette, so each role reads differently.
 */
export default function RoleChoiceCard({ role, selected, onSelect, disabled = false, testID }: RoleChoiceCardProps) {
  const { styles, Colors, V6Colors } = useThemedStyles(createStyles);
  const copy = ROLE_CHOICE_COPY[role];
  const isHomeowner = role === 'homeowner';
  const Icon = isHomeowner ? Home : Wrench;

  return (
    <Tap
      testID={testID}
      onPress={onSelect}
      disabled={disabled}
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${copy.title}. ${copy.body} ${copy.tag}.`}
    >
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: isHomeowner ? Colors.primary : Colors.providerHero }]}>
          <Icon size={22} color={Colors.onPrimary} />
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Check size={14} color={Colors.onPrimary} /> : null}
        </View>
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Text style={[styles.tag, { color: isHomeowner ? Colors.link : V6Colors.ink700 }]}>{copy.tag}</Text>
    </Tap>
  );
}

function createStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    card: {
      backgroundColor: V6Colors.surface,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: V6Colors.line,
      padding: 16,
      gap: 6,
    },
    cardSelected: { borderColor: Colors.link },
    cardDisabled: { opacity: 0.6 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: V6Colors.ink300,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    title: { fontFamily: 'Inter', fontSize: 17, fontWeight: '700', lineHeight: 22, color: V6Colors.ink900 },
    body: { fontFamily: 'Inter', fontSize: 14, lineHeight: 19, color: V6Colors.ink500 },
    tag: { fontFamily: 'Inter', fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 4 },
  });
  return { styles, Colors, V6Colors };
}
