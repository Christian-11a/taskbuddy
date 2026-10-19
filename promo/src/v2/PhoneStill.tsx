import React from 'react';
import { Phone } from './kit';
import { HOPhoneContent } from './HOScreens';
import { SPPhoneContent } from './SPScreens';

// Transparent single-phone still for the website (Android download section).
export type PhoneStillProps = { role: 'customer' | 'provider'; film: number };
export const PHONE_STILL = { w: 500, h: 1046 };

export const PhoneStill: React.FC<PhoneStillProps> = ({ role, film }) => (
  <div style={{ width: PHONE_STILL.w, height: PHONE_STILL.h }}>
    <Phone w={PHONE_STILL.w}>{role === 'customer' ? <HOPhoneContent f={film} /> : <SPPhoneContent f={film} />}</Phone>
  </div>
);
