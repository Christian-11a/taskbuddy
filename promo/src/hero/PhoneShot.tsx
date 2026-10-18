import React from 'react';
import { Phone, phoneH } from './ui';
import { ClientPhone } from './ClientPhone';
import { ProviderPhone } from './ProviderPhone';

// Transparent phone picture for the website's Download section: client Home and provider Feed.
export const SHOT_W = 500;
export const SHOT_H = Math.ceil(phoneH(SHOT_W));
export const PhoneShot: React.FC<{ role: 'customer' | 'provider' }> = ({ role }) => (
  <div style={{ width: SHOT_W, height: SHOT_H }}>
    <Phone w={SHOT_W} flat>{role === 'customer' ? <ClientPhone f={0} /> : <ProviderPhone f={250} />}</Phone>
  </div>
);
