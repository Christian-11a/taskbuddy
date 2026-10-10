import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CalendarDays } from 'lucide-react-native';
import { MIN_TOUCH_DP, touchArea, type HitSlop } from '../touchTarget';
import FilterPill from '../FilterPill';
import ViewSwitch from '../ViewSwitch';
import { CalendarDay } from '../MonthGrid';
import PersonCard from '../PersonCard';
import RadioRow from '../RadioRow';
import SectionHeader from '../SectionHeader';
import Banner from '../Banner';
import EmptyRow from '../EmptyRow';
import BottomActionBar from '../BottomActionBar';
import ConfirmationModal from '../../ConfirmationModal';

const noop = () => {};

describe('touchArea', () => {
  it('adds the hitSlop on both sides of the axis to the drawn size', () => {
    expect(touchArea(34, { top: 7, bottom: 7 }, 'vertical')).toBe(48);
    expect(touchArea(40, 4, 'horizontal')).toBe(48);
    expect(touchArea(40, 4, 'vertical')).toBe(48);
  });

  it('uses the drawn size alone when there is no hitSlop, and ignores slop on the other axis', () => {
    expect(touchArea(48, undefined, 'vertical')).toBe(48);
    expect(touchArea(30, { left: 9, right: 9 }, 'vertical')).toBe(30);
  });

  it('keeps the 48 dp minimum from QA_CHECKS §4', () => {
    expect(MIN_TOUCH_DP).toBe(48);
  });
});

/**
 * The hitSlop a control is rendered with, and the size QA_CHECKS §4 gives it, must reach 48 dp on
 * the axes that matter. The drawn sizes are the smallest the Figma parts are drawn at.
 */
function expectTouchTarget(host: { props: { hitSlop?: HitSlop } }, drawn: { width?: number; height: number }) {
  expect(touchArea(drawn.height, host.props.hitSlop, 'vertical')).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
  if (drawn.width !== undefined) {
    expect(touchArea(drawn.width, host.props.hitSlop, 'horizontal')).toBeGreaterThanOrEqual(MIN_TOUCH_DP);
  }
}

describe('the small controls in QA_CHECKS §4 reach a 48 dp touch area', () => {
  it('filter pills: drawn 34 dp tall, 7 dp above and below', () => {
    render(<FilterPill label="All" count={3} selected onPress={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'All, 3' }), { height: 34 });
  });

  it('list and calendar segments: drawn 32 dp tall, 8 dp above and below', () => {
    render(<ViewSwitch options={[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }] as const} value="list" onChange={noop} />);
    expectTouchTarget(screen.getByRole('tab', { name: 'List' }), { height: 32 });
  });

  it('calendar day cells: drawn 40 dp square, 4 dp on every side', () => {
    const date = { dateString: '2026-10-10', day: 10, month: 10, year: 2026, timestamp: 0 };
    render(<CalendarDay date={date} marking={{ marked: true }} jobCount={1} onPress={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'October 10, 1 job' }), { width: 40, height: 40 });
  });

  it('provider message button: drawn 40 dp round, 4 dp on every side', () => {
    render(<PersonCard name="Juan Dela Cruz" onMessage={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'Message Juan Dela Cruz' }), { width: 40, height: 40 });
  });

  it('radio rows: drawn 46 dp tall, 1 dp above and below', () => {
    render(<RadioRow label="Cash on site" selected onSelect={noop} />);
    expectTouchTarget(screen.getByRole('radio', { name: 'Cash on site' }), { height: 46 });
  });

  it('section header links: drawn 17 dp tall, 16 dp above and below', () => {
    render(<SectionHeader title="Recent" linkLabel="See all" onLinkPress={noop} />);
    expectTouchTarget(screen.getByRole('link', { name: 'See all' }), { height: 17 });
  });

  it('banner and empty-row actions: drawn 18 dp tall, 15 dp above and below', () => {
    render(<Banner tone="warning" message="Verification is pending." actionLabel="See status" onAction={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'See status' }), { height: 18 });
  });

  it('empty-row action: drawn 18 dp tall, 15 dp above and below', () => {
    render(<EmptyRow icon={CalendarDays} title="No jobs yet" actionLabel="Post a job" onAction={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'Post a job' }), { height: 18 });
  });

  it('bottom bar: the 46 dp primary button gets 1 dp, the text action gets 8 and 22 dp', () => {
    render(<BottomActionBar primaryLabel="Hire Juan" onPrimary={noop} secondaryLabel="Not now" onSecondary={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'Hire Juan' }), { height: 46 });
    expectTouchTarget(screen.getByRole('button', { name: 'Not now' }), { height: 18 });
  });

  it('confirmation: the 46 dp confirm button gets 1 dp, the cancel text gets 7 dp', () => {
    render(<ConfirmationModal visible title="Log out?" message="You can sign in again later." confirmLabel="Log out" cancelLabel="Stay" onConfirm={noop} onCancel={noop} />);
    expectTouchTarget(screen.getByRole('button', { name: 'Log out' }), { height: 46 });
    expectTouchTarget(screen.getByRole('button', { name: 'Stay' }), { height: 34 });
  });
});
