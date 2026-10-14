import React from 'react';
import { Text, View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { Bell, CalendarDays, ChevronLeft, CircleCheck, ClipboardList, Flag, Home, Trash2, User, Wallet } from 'lucide-react-native';
import Tap from '../components/ui/Tap';
import JobRow from '../components/ui/JobRow';
import FilterPill from '../components/ui/FilterPill';
import ViewSwitch from '../components/ui/ViewSwitch';
import SectionHeader from '../components/ui/SectionHeader';
import PersonCard from '../components/ui/PersonCard';
import BottomActionBar from '../components/ui/BottomActionBar';
import Banner from '../components/ui/Banner';
import EmptyRow from '../components/ui/EmptyRow';
import MenuSheet from '../components/ui/MenuSheet';
import CheckRow from '../components/ui/CheckRow';
import RadioRow from '../components/ui/RadioRow';
import PaymentOption from '../components/ui/PaymentOption';
import { CalendarDay, CalendarWeekdays } from '../components/ui/MonthGrid';
import NotificationCard from '../components/ui/NotificationCard';
import StatusCard from '../components/ui/StatusCard';
import ProgressStepper from '../components/ui/ProgressStepper';
import DateBlock from '../components/ui/DateBlock';
import TextField from '../components/ui/TextField';
import BottomNavBar, { type BottomNavItem } from '../components/BottomNavBar';
import ConfirmationModal from '../components/ConfirmationModal';
import ChatThread, { type ChatThreadProps } from '../components/ChatThread';
import { ToastHost, showToast } from '../components/Toast';
import type { Message } from '../lib/api';
import { findUnnamedControls, auditControls } from '../testing/a11yAudit';

const noop = () => {};

describe('the audit helper', () => {
  it('lists a pressable with no label and no text, and names the icon it draws', () => {
    render(<Tap onPress={noop} testID="bell"><Bell size={20} color="#000" /></Tap>);

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([{ role: null, testID: 'bell', icons: ['Bell'] }]);
  });

  it('accepts an accessibilityLabel, visible text, or a labelled child as the name', () => {
    render(
      <>
        <Tap onPress={noop} testID="labelled" accessibilityLabel="Back"><ChevronLeft size={20} color="#000" /></Tap>
        <Tap onPress={noop} testID="texted"><Text>Open</Text></Tap>
        <Tap onPress={noop} testID="child"><View accessibilityLabel="Photo 1 of 3" /></Tap>
      </>,
    );

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
    expect(auditControls(screen.UNSAFE_root).map(c => [c.testID, c.named])).toEqual([
      ['labelled', true], ['texted', true], ['child', true],
    ]);
  });

  it('counts a Tap, which wraps a Pressable, once per pressable', () => {
    render(
      <>
        <Tap onPress={noop} testID="first"><Bell size={20} color="#000" /></Tap>
        <Tap onPress={noop} testID="second" accessibilityRole="button"><ChevronLeft size={20} color="#000" /></Tap>
      </>,
    );

    expect(auditControls(screen.UNSAFE_root)).toHaveLength(2);
    expect(findUnnamedControls(screen.UNSAFE_root).map(c => [c.testID, c.role])).toEqual([
      ['first', null], ['second', 'button'],
    ]);
  });

  it('flags an unnamed host with a control role even when it has no onPress', () => {
    render(<View accessibilityRole="switch" testID="toggle" />);

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([{ role: 'switch', testID: 'toggle', icons: [] }]);
  });

  it('ignores a pressable hidden from accessibility, and a header that is not a control', () => {
    render(
      <>
        <View accessibilityElementsHidden>
          <Tap onPress={noop} testID="hidden"><Bell size={20} color="#000" /></Tap>
        </View>
        <Text accessibilityRole="header">Settings</Text>
      </>,
    );

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });

  it('ignores a pressable with accessible={false}, which screen readers cannot reach', () => {
    render(<Tap onPress={noop} testID="backdrop" accessible={false}><Bell size={20} color="#000" /></Tap>);

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});

const day = (dateString: string) => ({
  dateString,
  day: Number(dateString.slice(8)),
  month: Number(dateString.slice(5, 7)),
  year: Number(dateString.slice(0, 4)),
  timestamp: 0,
});

const VIEWS = [{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }] as const;

const TABS: readonly BottomNavItem<'Home' | 'My Jobs' | 'Wallet' | 'Profile'>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
  { key: 'Profile', label: 'Profile', icon: User },
];

const message = (id: string, senderId: string, body: string): Message => ({
  id,
  conversation_id: 'conversation',
  sender_id: senderId,
  body,
  attachment_path: null,
  attachment_url: null,
  read_at: null,
  created_at: '2026-10-10T08:00:00Z',
});

const chatProps = (overrides: Partial<ChatThreadProps> = {}): ChatThreadProps => ({
  counterpartName: 'Juan Dela Cruz',
  subtitle: 'Plumbing: Fix toilet · Booked',
  systemLine: 'You hired Juan Dela Cruz · ₱1.00 held safely',
  dayHeads: {},
  messages: [message('m1', 'other', 'See you at nine.')],
  profileId: 'me',
  loading: false,
  error: null,
  conversationReady: true,
  onRetry: noop,
  listRef: React.createRef(),
  text: '',
  onChangeText: noop,
  onSend: noop,
  attaching: false,
  onAttach: noop,
  onBack: noop,
  onViewJob: noop,
  ...overrides,
});

/** Every shared part with a control in it, drawn the way the screens draw it. */
const SHARED_PARTS: [string, React.ReactElement][] = [
  ['JobRow', <JobRow title="Fix the kitchen sink" meta="Booked · Juan" amount="₱1,200" tone="booked" date="2026-10-10" onPress={noop} />],
  ['FilterPill', <FilterPill label="All" count={3} selected onPress={noop} />],
  ['ViewSwitch', <ViewSwitch options={VIEWS} value="list" onChange={noop} />],
  ['SectionHeader with a link', <SectionHeader title="Recent" count={2} linkLabel="See all" onLinkPress={noop} />],
  ['PersonCard with a card press and a message button', <PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" rating onPress={noop} onMessage={noop} />],
  ['PersonCard with only a message button', <PersonCard name="Juan Dela Cruz" onMessage={noop} />],
  ['BottomActionBar with a secondary action', <BottomActionBar primaryLabel="Hire Juan" onPrimary={noop} secondaryLabel="Not now" onSecondary={noop} />],
  ['BottomActionBar while busy', <BottomActionBar primaryLabel="Hire Juan" onPrimary={noop} busy />],
  ['Banner with an action', <Banner tone="warning" message="Verification is pending." actionLabel="See status" onAction={noop} />],
  ['EmptyRow with an action', <EmptyRow icon={CalendarDays} title="No jobs yet" body="Post your first job." actionLabel="Post a job" onAction={noop} />],
  ['MenuSheet', <MenuSheet visible title="Job actions" onClose={noop} items={[
    { label: 'Report job', icon: Flag, onPress: noop },
    { label: 'Cancel job', icon: Trash2, tone: 'danger', hint: 'The provider is told.', onPress: noop },
  ]} />],
  ['ConfirmationModal', <ConfirmationModal visible title="Log out?" message="You can sign in again later." confirmLabel="Log out" cancelLabel="Stay" onConfirm={noop} onCancel={noop} />],
  ['CheckRow', <CheckRow label="Plumbing" checked onToggle={noop} />],
  ['RadioRow', <RadioRow label="Cash on site" selected onSelect={noop} />],
  ['PaymentOption', <PaymentOption title="GCash" meta="0917 *** 1234" icon={Wallet} selected onSelect={noop} />],
  ['MonthGrid weekdays and a day cell', <><CalendarWeekdays /><CalendarDay date={day('2026-10-10')} marking={{ marked: true }} onPress={noop} /></>],
  ['NotificationCard', <NotificationCard title="Offer accepted" body="Juan accepted your offer." time="2h ago" tone="success" icon={CircleCheck} unread onPress={noop} onDelete={noop} />],
  ['StatusCard with a link', <StatusCard tone="action" overline="Action needed" title="Confirm the date" body="Pick a time."><Tap onPress={noop} accessibilityRole="link"><Text>Open proposal</Text></Tap></StatusCard>],
  ['StatusCard without a link', <StatusCard tone="booked" overline="Booked" title="Plumbing" body="Friday, October 10" />],
  ['ProgressStepper', <ProgressStepper step="hired" />],
  ['DateBlock', <DateBlock date="2026-10-10" />],
  ['TextField with an error', <TextField label="Full name" value="" onChangeText={noop} error="Enter your full name" submitted />],
  ['BottomNavBar', <BottomNavBar activeTab="Home" tabs={TABS} onTabPress={noop} />],
  ['ChatThread', <ChatThread {...chatProps()} />],
];

describe('shared parts', () => {
  it.each(SHARED_PARTS)('%s: every control has an accessible name', (_name, element) => {
    render(element);

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });

  it('a toast with an action names the action', () => {
    render(<ToastHost />);
    act(() => { showToast('Job deleted', 'info', { label: 'Undo', onPress: noop }); });

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});
