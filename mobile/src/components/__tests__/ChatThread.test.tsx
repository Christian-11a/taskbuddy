import React from 'react';
import { StyleSheet, type FlatList } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import ChatThread, { CHAT_MESSAGE_MAX, type ChatThreadProps } from '../ChatThread';
import type { Message } from '../../lib/api';
import { lightPalette } from '../../constants/palettes';

// Mutable window metrics, so a test can set the system text size (fontScale) before rendering.
const mockDims = { width: 390, height: 844, fontScale: 1, scale: 3 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockDims,
}));

const message = (
  id: string,
  senderId: string,
  body: string,
  createdAt: string,
  attachmentUrl: string | null = null,
): Message => ({
  id,
  conversation_id: 'conversation',
  sender_id: senderId,
  body,
  attachment_path: null,
  attachment_url: attachmentUrl,
  read_at: null,
  created_at: createdAt,
});

const baseProps = (overrides: Partial<ChatThreadProps> = {}): ChatThreadProps => ({
  counterpartName: 'TaskBuddyProvider',
  subtitle: 'Plumbing: Fix toilet · Confirmed',
  systemLine: 'You hired TaskBuddyProvider · ₱1.00 held safely',
  dayHeads: {},
  messages: [],
  profileId: 'me',
  loading: false,
  error: null,
  conversationReady: true,
  onRetry: jest.fn(),
  listRef: React.createRef<FlatList<Message>>(),
  text: '',
  onChangeText: jest.fn(),
  onSend: jest.fn(),
  attaching: false,
  onAttach: jest.fn(),
  onBack: jest.fn(),
  onViewJob: jest.fn(),
  ...overrides,
});

describe('ChatThread when the conversation fails to load', () => {
  it('shows the error with Try again, and pressing it asks for the load again', () => {
    const onRetry = jest.fn();
    render(<ChatThread {...baseProps({ error: 'Network down', conversationReady: false, onRetry })} />);

    expect(screen.getByText("Couldn't load this chat")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the composer off while there is no conversation, and on once it is open', () => {
    const onSend = jest.fn();
    const { rerender } = render(
      <ChatThread {...baseProps({ error: 'Network down', conversationReady: false, text: 'Hello', onSend })} />,
    );

    expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole('button', { name: 'Attach a photo' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByPlaceholderText('Message…').props.editable).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
    expect(onSend).not.toHaveBeenCalled();

    rerender(<ChatThread {...baseProps({ text: 'Hello', onSend })} />);
    expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByPlaceholderText('Message…').props.editable).toBe(true);
  });
});

describe('ChatThread header and system line', () => {
  it('names the other person, the job and its status, and pins the system line', () => {
    render(<ChatThread {...baseProps()} />);

    expect(screen.getByText('TaskBuddyProvider')).toBeTruthy();
    expect(screen.getByText('Plumbing: Fix toilet · Confirmed')).toBeTruthy();
    expect(screen.getByText('You hired TaskBuddyProvider · ₱1.00 held safely')).toBeTruthy();
  });

  it('leaves out the subtitle and the system line when they are not known', () => {
    render(<ChatThread {...baseProps({ subtitle: null, systemLine: null, counterpartName: null })} />);

    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.queryByText(/held safely/)).toBeNull();
    expect(screen.queryByText('Plumbing: Fix toilet · Confirmed')).toBeNull();
  });

  it('calls back from the back button and opens the job from View job', () => {
    const props = baseProps();
    render(<ChatThread {...props} />);

    fireEvent.press(screen.getByLabelText('Back'));
    fireEvent.press(screen.getByLabelText('View job'));

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onViewJob).toHaveBeenCalledTimes(1);
  });
});

describe('ChatThread header at large text', () => {
  afterEach(() => {
    mockDims.fontScale = 1;
  });

  it('keeps View job beside the name at normal text size', () => {
    render(<ChatThread {...baseProps()} />);

    const info = screen.getByTestId('chat-header-info');
    expect(within(info).queryByLabelText('View job')).toBeNull();
    expect(screen.getByLabelText('View job')).toBeTruthy();
    expect(screen.getByText('TaskBuddyProvider').props.numberOfLines).toBe(1);
    expect(screen.getByText('Plumbing: Fix toilet · Confirmed').props.numberOfLines).toBe(2);
  });

  it('moves View job to its own row under the subtitle at 1.3x text size', () => {
    mockDims.fontScale = 1.3;
    render(<ChatThread {...baseProps()} />);

    const info = screen.getByTestId('chat-header-info');
    expect(within(info).getByLabelText('View job')).toBeTruthy();
    expect(screen.getByText('TaskBuddyProvider').props.numberOfLines).toBe(1);
    expect(screen.getByText('Plumbing: Fix toilet · Confirmed').props.numberOfLines).toBe(2);
  });

  it('keeps View job from shrinking, and at normal size reaches 48dp with hit slop so the header does not grow', () => {
    render(<ChatThread {...baseProps()} />);

    const link = screen.getByLabelText('View job');
    const style = StyleSheet.flatten(link.props.style);
    expect(style.flexShrink).toBe(0);
    expect(style.minHeight).toBeUndefined();
    expect(link.props.hitSlop.top + link.props.hitSlop.bottom).toBeGreaterThanOrEqual(32);
  });

  it('gives View job a 48dp minimum size when it is stacked under the subtitle at 1.3x', () => {
    mockDims.fontScale = 1.3;
    render(<ChatThread {...baseProps()} />);

    const style = StyleSheet.flatten(screen.getByLabelText('View job').props.style);
    expect(style.minWidth).toBe(48);
    expect(style.minHeight).toBe(48);
  });

  it('keeps View job and Back working at 1.3x text size', () => {
    mockDims.fontScale = 1.3;
    const props = baseProps();
    render(<ChatThread {...props} />);

    fireEvent.press(screen.getByLabelText('View job'));
    fireEvent.press(screen.getByLabelText('Back'));

    expect(props.onViewJob).toHaveBeenCalledTimes(1);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('ChatThread day separators', () => {
  it('shows one label above the first message of each day and none between them', () => {
    const messages = [
      message('a', 'other', 'Hi', '2026-10-06T09:00:00Z'),
      message('b', 'me', 'Hello', '2026-10-06T09:05:00Z'),
      message('c', 'other', 'Today works', '2026-10-11T08:00:00Z'),
    ];
    render(<ChatThread {...baseProps({ messages, dayHeads: { a: 'OCT 6', c: 'TODAY' } })} />);

    expect(screen.getByText('OCT 6')).toBeTruthy();
    expect(screen.getByText('TODAY')).toBeTruthy();
    expect(screen.getAllByText(/^(OCT 6|TODAY)$/)).toHaveLength(2);
  });
});

describe('ChatThread composer', () => {
  it('keeps Send message disabled while the box is empty, and sends once there is text', () => {
    const props = baseProps();
    const { rerender } = render(<ChatThread {...props} />);
    const send = () => screen.getByRole('button', { name: 'Send message' });

    expect(send().props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(send());
    expect(props.onSend).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Message…'), 'On my way');
    rerender(<ChatThread {...props} text="On my way" />);
    expect(send().props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(send());
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('keeps the attach button labelled for what it does', () => {
    const props = baseProps();
    render(<ChatThread {...props} />);

    fireEvent.press(screen.getByRole('button', { name: 'Attach a photo' }));
    expect(props.onAttach).toHaveBeenCalledTimes(1);
  });

  it('labels the message input for assistive tech and scripted tests', () => {
    render(<ChatThread {...baseProps()} />);
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });
});

describe('ChatThread bubbles and photos', () => {
  it('colours my messages with the primary colour and white text, and theirs on the surface', () => {
    const messages = [
      message('theirs', 'other', 'Incoming message', '2026-10-11T08:00:00Z'),
      message('mine', 'me', 'Outgoing message', '2026-10-11T08:01:00Z'),
    ];
    render(<ChatThread {...baseProps({ messages })} />);

    const background = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor;
    expect(background('chat-bubble-mine')).toBe(lightPalette.Colors.primary);
    expect(background('chat-bubble-theirs')).toBe(lightPalette.V6Colors.surface);
    expect(StyleSheet.flatten(screen.getByText('Outgoing message').props.style).color).toBe(lightPalette.Colors.onPrimary);
  });

  it('opens a photo full screen from its thumbnail', () => {
    const messages = [message('photo', 'me', '', '2026-10-11T08:00:00Z', 'https://storage.test/tank.jpg')];
    render(<ChatThread {...baseProps({ messages })} />);

    expect(screen.queryByTestId('full-photo')).toBeNull();
    fireEvent.press(screen.getByLabelText('View photo'));

    expect(screen.getByTestId('full-photo').props.source.uri).toBe('https://storage.test/tank.jpg');
  });

  it('shows the empty state until the first message arrives', () => {
    render(<ChatThread {...baseProps()} />);
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('shows the empty state inside the card, like the other empty states', () => {
    render(<ChatThread {...baseProps()} />);
    expect(within(screen.getByTestId('empty-card')).getByText('No messages yet')).toBeTruthy();
  });

  it('a chat that fails to load shows the error in the card, with Try again', () => {
    render(<ChatThread {...baseProps({ error: 'Could not load chat.', conversationReady: false })} />);
    const card = screen.getByTestId('error-card');
    expect(within(card).getByText("Couldn't load this chat")).toBeTruthy();
    expect(within(card).getByText('Could not load chat.')).toBeTruthy();
    expect(screen.queryByTestId('empty-card')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('ChatThread payment safety note', () => {
  it('pins the payment reminder at the top of the conversation until it is dismissed', async () => {
    render(<ChatThread {...baseProps()} />);

    expect(await screen.findByText('Stay protected')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('Stay protected')).toBeNull();
  });
});

describe('ChatThread composer limits', () => {
  const send = () => screen.getByRole('button', { name: 'Send message' });

  it('keeps Send message disabled for a message of spaces or blank lines alone', () => {
    const { rerender } = render(<ChatThread {...baseProps({ text: '   ' })} />);
    expect(send().props.accessibilityState?.disabled).toBe(true);

    rerender(<ChatThread {...baseProps({ text: '\n\n\n' })} />);
    expect(send().props.accessibilityState?.disabled).toBe(true);
  });

  it('caps the box at the composer limit of 500 characters', () => {
    render(<ChatThread {...baseProps()} />);

    expect(screen.getByPlaceholderText('Message…').props.maxLength).toBe(CHAT_MESSAGE_MAX);
    expect(CHAT_MESSAGE_MAX).toBe(500);
  });

  it('shows how much room is left only once the message is 400 characters or more', () => {
    const { rerender } = render(<ChatThread {...baseProps({ text: 'a'.repeat(399) })} />);
    expect(screen.queryByText('399/500')).toBeNull();

    rerender(<ChatThread {...baseProps({ text: 'a'.repeat(400) })} />);
    expect(screen.getByText('400/500')).toBeTruthy();
  });

  it('keeps a message of exactly 500 characters sendable, with the counter at its limit', () => {
    render(<ChatThread {...baseProps({ text: 'a'.repeat(500) })} />);

    expect(screen.getByText('500/500')).toBeTruthy();
    expect(send().props.accessibilityState?.disabled).toBe(false);
  });
});

describe('ChatThread notice', () => {
  it('shows an amber note under the header when given one, and none otherwise', () => {
    const { rerender } = render(<ChatThread {...baseProps()} />);
    expect(screen.queryByTestId('chat-notice')).toBeNull();

    rerender(<ChatThread {...baseProps({ notice: { tone: 'warning', text: 'A complaint is open. An admin is reviewing it.' } })} />);

    expect(within(screen.getByTestId('chat-notice')).getByText('A complaint is open. An admin is reviewing it.')).toBeTruthy();
  });
});
