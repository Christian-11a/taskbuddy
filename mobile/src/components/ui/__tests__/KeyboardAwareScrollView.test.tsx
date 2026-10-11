import React, { createRef } from 'react';
import { Keyboard, ScrollView, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import KeyboardAwareScrollView, { FIELD_MARGIN, scrollTargetFor } from '../KeyboardAwareScrollView';
import TextField from '../TextField';

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

describe('scrollTargetFor', () => {
  // A 400 dp view with the standard 24 dp margin; each case overrides only what it tests.
  const view = { viewportHeight: 400, margin: FIELD_MARGIN, scrollY: 0 };

  it.each([
    ['a field inside the view with room around it needs no scroll', { fieldTop: 200, fieldHeight: 48 }, null],
    ['a field whose top margin sits exactly on the top edge needs no scroll', { fieldTop: 124, fieldHeight: 48, scrollY: 100 }, null],
    ['a field whose bottom margin sits exactly on the bottom edge needs no scroll', { fieldTop: 328, fieldHeight: 48 }, null],
    ['one pixel below the bottom margin scrolls by one pixel', { fieldTop: 329, fieldHeight: 48 }, 1],
    ['a field below the view scrolls down to its bottom margin', { fieldTop: 700, fieldHeight: 56 }, 380],
    ['a field below a partly scrolled view scrolls down by the difference', { fieldTop: 480, fieldHeight: 56, scrollY: 100 }, 160],
    ['a field above the view scrolls up to its top margin', { fieldTop: 200, fieldHeight: 40, scrollY: 300 }, 176],
    ['a field whose margin pokes above the view scrolls up to the margin', { fieldTop: 200, fieldHeight: 40, scrollY: 190 }, 176],
    ['a field in a scrolled view that is still visible needs no scroll', { fieldTop: 600, fieldHeight: 40, scrollY: 500 }, null],
    ['the offset is clamped at zero when the margin would go above the content', { fieldTop: 10, fieldHeight: 20, scrollY: 30 }, 0],
    ['a field at the top with the view already at zero needs no scroll', { fieldTop: 5, fieldHeight: 20 }, null],
    ['a field taller than the view that is below it scrolls to its bottom', { fieldTop: 500, fieldHeight: 800 }, 924],
    ['a field taller than the view whose top is above it scrolls to its top', { fieldTop: 500, fieldHeight: 800, scrollY: 600 }, 476],
  ])('%s', (_name, field, expected) => {
    expect(scrollTargetFor({ ...view, ...field })).toBe(expected);
  });

  it('with no margin, a field must end exactly on the bottom edge', () => {
    expect(scrollTargetFor({ fieldTop: 340, fieldHeight: 60, scrollY: 0, viewportHeight: 400, margin: 0 })).toBeNull();
    expect(scrollTargetFor({ fieldTop: 341, fieldHeight: 60, scrollY: 0, viewportHeight: 400, margin: 0 })).toBe(1);
  });

  it('does nothing before the view has been measured', () => {
    expect(scrollTargetFor({ fieldTop: 700, fieldHeight: 56, scrollY: 0, viewportHeight: 0, margin: FIELD_MARGIN })).toBeNull();
  });
});

describe('KeyboardAwareScrollView', () => {
  // The ScrollView and TextInput mocks keep their native methods on the prototype, so
  // spying on an instance returns the one shared jest.fn. Clear it between tests.
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Each test replaces the measurements it needs on the instances.
  // The view's window top is 100 and the field's window top is set per test.
  function renderForm(onChangeText = jest.fn()) {
    render(
      <KeyboardAwareScrollView testID="form">
        <TextField label="City" value="" onChangeText={onChangeText} />
      </KeyboardAwareScrollView>,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView).instance;
    const scrollTo = jest.spyOn(scroll, 'scrollTo');
    jest.spyOn(scroll, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: MeasureCallback) => callback(0, 100, 375, 400),
    } as never);
    const field: { measureInWindow: (callback: MeasureCallback) => void } = screen.UNSAFE_getByType(TextInput).instance;
    const measureField = jest.spyOn(field, 'measureInWindow').mockImplementation((callback) => callback(0, 600, 375, 48));
    return { scroll: screen.getByTestId('form'), scrollTo, measureField };
  }

  function resize(scroll: ReturnType<typeof screen.getByTestId>, height: number) {
    fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height } } });
  }

  it('scrolls a focused field above the keyboard and footer by the computed offset', () => {
    const { scroll, scrollTo } = renderForm();
    resize(scroll, 400);

    fireEvent(screen.getByLabelText('City'), 'focus');

    // The field is 500 dp into a 400 dp view. Its bottom plus the margin (572) is 172 past the view.
    expect(scrollTo).toHaveBeenCalledWith({ y: 172, animated: true });
  });

  it('leaves the view alone when the focused field is already visible', () => {
    const { scroll, scrollTo, measureField } = renderForm();
    resize(scroll, 400);
    measureField.mockImplementation((callback) => callback(0, 200, 375, 48));

    fireEvent(screen.getByLabelText('City'), 'focus');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('uses the scroll offset from onScroll when working out where the field is', () => {
    const { scroll, scrollTo } = renderForm();
    resize(scroll, 400);
    fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { x: 0, y: 300 } } });

    fireEvent(screen.getByLabelText('City'), 'focus');

    // The field is 800 dp into the content (500 in the view plus the 300 already scrolled).
    // Its bottom plus margin (872) is 472 past the view's top edge, which now starts at 300.
    expect(scrollTo).toHaveBeenCalledWith({ y: 472, animated: true });
  });

  it('checks the focused field again when the keyboard finishes opening', () => {
    const listeners: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      listeners[event] = handler;
      return { remove: jest.fn() };
    }) as never);
    const { scroll, scrollTo, measureField } = renderForm();
    resize(scroll, 400);
    measureField.mockImplementation((callback) => callback(0, 200, 375, 48));
    fireEvent(screen.getByLabelText('City'), 'focus');
    expect(scrollTo).not.toHaveBeenCalled();

    // The form grew while the keyboard was sliding in, so the field now sits below the view.
    measureField.mockImplementation((callback) => callback(0, 700, 375, 48));
    act(() => listeners.keyboardDidShow?.());

    // 700 - 100 = 600 dp into the view; bottom plus margin (672) is 272 past the 400 dp view.
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 272, animated: true });
  });

  it('checks the focused field again when the view shrinks under the keyboard', () => {
    const { scroll, scrollTo, measureField } = renderForm();
    resize(scroll, 400);
    measureField.mockImplementation((callback) => callback(0, 200, 375, 48));
    fireEvent(screen.getByLabelText('City'), 'focus');
    expect(scrollTo).not.toHaveBeenCalled();

    // The keyboard takes 250 dp: the view is 150 dp and the field, 100 dp into it, is cut off.
    measureField.mockImplementation((callback) => callback(0, 300, 375, 48));
    resize(scroll, 150);

    // 300 - 100 = 200 dp into the view; bottom plus margin (272) is 122 past the 150 dp view.
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 122, animated: true });
  });

  it('forwards the ref to the ScrollView and passes its props through', () => {
    const ref = createRef<ScrollView>();
    render(<KeyboardAwareScrollView ref={ref} testID="plain" bounces={false}>{null}</KeyboardAwareScrollView>);

    expect(ref.current?.scrollTo).toEqual(expect.any(Function));
    expect(screen.getByTestId('plain').props.bounces).toBe(false);
  });

  it('keeps taps on buttons working while the keyboard is up by default', () => {
    render(<KeyboardAwareScrollView testID="form">{null}</KeyboardAwareScrollView>);

    expect(screen.getByTestId('form').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('a field outside any scroll view still renders and takes focus', () => {
    render(<TextField label="Name" value="" onChangeText={jest.fn()} />);

    expect(() => fireEvent(screen.getByLabelText('Name'), 'focus')).not.toThrow();
  });
});
