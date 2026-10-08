import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MessageCircle, Star } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

const STAR = '#f59e0b';

export type PersonCardProps = {
  name: string; avatarUrl?: string | null; subtitle?: string; rating?: boolean;
  onPress?: () => void; onMessage?: () => void;
};

/** A provider or client in one row: photo or initials, name, subtitle, and an optional message button. */
export default function PersonCard({ name, avatarUrl, subtitle, rating = false, onPress, onMessage }: PersonCardProps) {
  const { s, icon } = useThemedStyles(createStyles);
  const mainStyle = [s.main, onMessage && s.mainWithMessage];
  const info = (
    <>
      <View style={s.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={s.photo} contentFit="cover" transition={150} testID="person-card-photo" />
          : <Text style={s.initials}>{initialsOf(name)}</Text>}
      </View>
      <View style={s.text}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        {(!!subtitle || rating) && (
          <View style={s.subRow}>
            {rating && <View testID="person-card-rating"><Star size={13} color={STAR} fill={STAR} /></View>}
            {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        )}
      </View>
    </>
  );
  return (
    <View style={s.card}>
      {onPress ? (
        <Tap style={mainStyle} scale onPress={onPress} accessibilityRole="button"
          accessibilityLabel={subtitle ? `${name}, ${subtitle}` : name}>
          {info}
        </Tap>
      ) : (
        <View style={mainStyle}>{info}</View>
      )}
      {onMessage && (
        <Tap style={s.message} onPress={onMessage} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Message ${name}`}>
          <MessageCircle size={19} color={icon} />
        </Tap>
      )}
    </View>
  );
}

/** First letters of the first two words: "Juan Dela Cruz" becomes "JD". */
function initialsOf(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 18, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 14 },
    mainWithMessage: { paddingRight: 12 },
    avatar: {
      width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    photo: { width: 44, height: 44 },
    initials: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: Colors.primaryDeep },
    text: { flex: 1, gap: 2 },
    name: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    subtitle: { flexShrink: 1, fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink500 },
    message: {
      width: 40, height: 40, borderRadius: 20, marginRight: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
  }),
  icon: Colors.link,
});
