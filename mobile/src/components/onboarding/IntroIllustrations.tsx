/**
 * IntroIllustrations.tsx: the small pictures on the welcome cards. Each one is
 * made of the app's own shapes (service chips, feed rows, proposal and booking
 * cards, a held-money card) with icons and neutral placeholder bars, so it shows
 * no made-up names, amounts or stock art. While its card is on screen the parts
 * ease in one after another; with reduced motion they simply appear.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import {
  ArrowDownLeft,
  CalendarCheck,
  Check,
  Hammer,
  Lock,
  MapPin,
  Send,
  Sparkles,
  User,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import { V6Shadows } from '../../constants/theme';
import { categoryIcon } from '../../lib/categoryIcon';

export type IllustrationKind = 'services' | 'feed' | 'proposals' | 'proposalToBooking' | 'heldMoney' | 'incoming';

export type IllustrationService = { id: number; name: string };

type IntroIllustrationProps = {
  kind: IllustrationKind;
  /** The card is on screen: its parts ease in. Off screen they sit still. */
  active: boolean;
  /** Real service categories for the client's first card; none shows generic icon tiles. */
  services?: IllustrationService[];
};

const ENTER_MS = 250;
const STAGGER_MS = 100;
const MAX_SERVICES = 3;

/** One part fades and rises in after `delay`, only while its card is on screen. */
function Reveal({ active, delay, style, children }: {
  active: boolean;
  delay: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={active && !reduced ? FadeInUp.duration(ENTER_MS).delay(delay) : undefined} style={style}>
      {children}
    </Animated.View>
  );
}

function IconTile({ Icon, tone = 'primary' }: { Icon: LucideIcon; tone?: 'primary' | 'success' }) {
  const { Colors, styles } = useThemedStyles(createStyles);
  const success = tone === 'success';
  return (
    <View style={[styles.iconTile, { backgroundColor: success ? Colors.successSurface : Colors.primaryTonal }]}>
      <Icon size={18} color={success ? Colors.successText : Colors.primary} strokeWidth={2.1} />
    </View>
  );
}

/** Neutral placeholder lines: the shape of text, with no words in them. */
function Bars({ widths }: { widths: string[] }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.bars}>
      {widths.map((width, i) => <View key={i} style={[styles.bar, { width: width as `${number}%` }]} />)}
    </View>
  );
}

function CheckBadge() {
  const { Colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.checkBadge}>
      <Check size={13} color={Colors.onPrimary} strokeWidth={3} />
    </View>
  );
}

/** Client, card 1: real service chips, or three icon tiles when there are none to show. */
function ServicesArt({ active, services }: { active: boolean; services: IllustrationService[] }) {
  const { Colors, styles } = useThemedStyles(createStyles);
  if (services.length === 0) {
    return (
      <View style={styles.row}>
        {[Wrench, Hammer, Sparkles].map((Icon, i) => (
          <Reveal key={i} active={active} delay={i * STAGGER_MS} style={styles.tile}>
            <Icon size={22} color={Colors.primary} strokeWidth={2} />
          </Reveal>
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.row, styles.wrap]}>
      {services.slice(0, MAX_SERVICES).map((service, i) => {
        const Icon = categoryIcon(service.name);
        return (
          <Reveal key={service.id} active={active} delay={i * STAGGER_MS} style={styles.chip}>
            <View style={styles.chipIcon}>
              <Icon size={14} color={Colors.link} strokeWidth={2} />
            </View>
            <Text style={styles.chipText} numberOfLines={1}>{service.name}</Text>
          </Reveal>
        );
      })}
    </View>
  );
}

/** Provider, card 1: two feed rows, each with a distance pill and no real job or distance. */
function FeedArt({ active }: { active: boolean }) {
  const { Colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.stack}>
      {[Wrench, Sparkles].map((Icon, i) => (
        <Reveal key={i} active={active} delay={i * STAGGER_MS} style={styles.miniCard}>
          <IconTile Icon={Icon} />
          <Bars widths={[i === 0 ? '70%' : '58%', '40%']} />
          <View style={styles.distancePill}>
            <MapPin size={12} color={Colors.primaryDeep} strokeWidth={2.2} />
            <View style={styles.pillBar} />
          </View>
        </Reveal>
      ))}
    </View>
  );
}

/** Client, card 2: two proposals; the one picked gets a check. */
function ProposalsArt({ active }: { active: boolean }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.stack}>
      <Reveal active={active} delay={0} style={styles.miniCard}>
        <IconTile Icon={User} />
        <Bars widths={['60%', '40%']} />
      </Reveal>
      <Reveal active={active} delay={STAGGER_MS * 2} style={[styles.miniCard, styles.picked]}>
        <IconTile Icon={User} />
        <Bars widths={['70%', '45%']} />
        <CheckBadge />
      </Reveal>
    </View>
  );
}

/** Provider, card 2: an offer that has been sent, then the booking it turned into. */
function BookingArt({ active }: { active: boolean }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.stack}>
      <Reveal active={active} delay={0} style={styles.miniCard}>
        <IconTile Icon={Send} />
        <Bars widths={['65%', '40%']} />
      </Reveal>
      <Reveal active={active} delay={STAGGER_MS * 2} style={[styles.miniCard, styles.picked]}>
        <IconTile Icon={CalendarCheck} tone="success" />
        <Bars widths={['60%', '45%']} />
        <CheckBadge />
      </Reveal>
    </View>
  );
}

/** Client, card 3: a lock over a held-money card. There is no amount on it. */
function HeldMoneyArt({ active }: { active: boolean }) {
  const { Colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.stack}>
      <Reveal active={active} delay={0} style={styles.lockWell}>
        <Lock size={26} color={Colors.primary} strokeWidth={2} />
      </Reveal>
      <Reveal active={active} delay={STAGGER_MS * 2} style={styles.miniCard}>
        <IconTile Icon={Wallet} />
        <Bars widths={['55%', '35%']} />
        <Lock size={14} color={Colors.primaryDeep} strokeWidth={2.2} />
      </Reveal>
    </View>
  );
}

/** Provider, card 3: a wallet with money coming in, shown by an arrow and no figure. */
function IncomingArt({ active }: { active: boolean }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.stack}>
      <Reveal active={active} delay={0} style={styles.miniCard}>
        <IconTile Icon={Wallet} />
        <Bars widths={['55%', '35%']} />
      </Reveal>
      <Reveal active={active} delay={STAGGER_MS * 2} style={[styles.miniCard, styles.incoming]}>
        <IconTile Icon={ArrowDownLeft} tone="success" />
        <Bars widths={['50%', '30%']} />
      </Reveal>
    </View>
  );
}

export default function IntroIllustration({ kind, active, services = [] }: IntroIllustrationProps) {
  switch (kind) {
    case 'services':
      return <ServicesArt active={active} services={services} />;
    case 'feed':
      return <FeedArt active={active} />;
    case 'proposals':
      return <ProposalsArt active={active} />;
    case 'proposalToBooking':
      return <BookingArt active={active} />;
    case 'heldMoney':
      return <HeldMoneyArt active={active} />;
    case 'incoming':
      return <IncomingArt active={active} />;
    default:
      return null;
  }
}

function createStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    stack: { width: '100%', maxWidth: 300, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    wrap: { flexWrap: 'wrap', rowGap: 10 },
    tile: {
      width: 60, height: 60, borderRadius: 18, backgroundColor: C.surface,
      alignItems: 'center', justifyContent: 'center', ...V6Shadows.sm,
    },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
      borderRadius: 999, backgroundColor: C.surface, ...V6Shadows.sm,
    },
    chipIcon: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    chipText: { color: C.ink700, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    miniCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, ...V6Shadows.sm,
    },
    picked: { borderColor: Colors.primary, borderWidth: 1.5 },
    incoming: { borderColor: Colors.successBorder },
    iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    bars: { flex: 1, gap: 6 },
    bar: { height: 8, borderRadius: 4, backgroundColor: C.ink100 },
    checkBadge: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: Colors.successSolid, alignItems: 'center', justifyContent: 'center',
    },
    distancePill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.primaryTonal,
    },
    pillBar: { width: 22, height: 6, borderRadius: 3, backgroundColor: C.ink200 },
    lockWell: {
      width: 56, height: 56, borderRadius: 28, alignSelf: 'center',
      backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...V6Shadows.sm,
    },
  });
  return { Colors, V6Colors, C, styles };
}
