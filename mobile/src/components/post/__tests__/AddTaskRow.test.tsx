import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AddTaskRow from '../AddTaskRow';

it('passes the typed task up as the user types', () => {
  const onChangeText = jest.fn();
  render(<AddTaskRow value="" onChangeText={onChangeText} onSubmit={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Add your own task'), 'Replace washer');
  expect(onChangeText).toHaveBeenCalledWith('Replace washer');
});

it('offers an Add action only once there is something to add', () => {
  const { rerender } = render(<AddTaskRow value="" onChangeText={jest.fn()} onSubmit={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();

  rerender(<AddTaskRow value="Replace washer" onChangeText={jest.fn()} onSubmit={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Add task' })).toBeTruthy();
});

it('adds the task from the Add action', () => {
  const onSubmit = jest.fn();
  render(<AddTaskRow value="Replace washer" onChangeText={jest.fn()} onSubmit={onSubmit} />);
  fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('adds the task when the keyboard\'s done key is pressed', () => {
  const onSubmit = jest.fn();
  render(<AddTaskRow value="Replace washer" onChangeText={jest.fn()} onSubmit={onSubmit} />);
  fireEvent(screen.getByLabelText('Add your own task'), 'submitEditing');
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
