import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PrepCard from '../PrepCard';

const steps = [
  { title: 'Choose your ID', detail: "PhilSys, driver's licence, UMID, passport or postal ID" },
  { title: 'Photo of your ID', detail: 'A clear, full photo of your ID' },
  { title: 'Selfie', detail: 'To match you with your ID' },
  { title: 'Review and send', detail: 'Then a short secure check with Stripe' },
];

describe('PrepCard', () => {
  it('lists the four steps in order, each with its detail', () => {
    render(<PrepCard steps={steps} profileItems={[]} />);
    expect(
      screen.getByLabelText("Step 1, Choose your ID. PhilSys, driver's licence, UMID, passport or postal ID"),
    ).toBeTruthy();
    expect(screen.getByLabelText('Step 4, Review and send. Then a short secure check with Stripe')).toBeTruthy();
  });

  it('says which profile items are done and which are still open', () => {
    render(
      <PrepCard
        steps={steps}
        profileItems={[
          { label: 'Service picked', done: true },
          { label: 'Bio added', done: false },
        ]}
      />,
    );
    expect(screen.getByLabelText('Service picked: done')).toBeTruthy();
    expect(screen.getByLabelText('Bio added: not done yet')).toBeTruthy();
  });
});
