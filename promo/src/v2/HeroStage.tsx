import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { INTER } from '../theme';
import { SOFT, sp, tw } from '../motion';
import { DP_H, Phone, S } from './kit';
import { ClientMyJobsQuiet, ClientPostService, ProviderFeed } from './HeroScreens';

// Two-phone hero stage, 1920 x 1080. Client LEFT (light), provider RIGHT (navy panel).
// Phones are big and simple because the website shows this at about 560 px wide.
const PHONE_W = 372;
const PAD = PHONE_W * 0.022;
const PHONE_K = (PHONE_W - PAD * 2) / 360;
const PHONE_H = DP_H * PHONE_K + PAD * 2;
const PHONE_TOP = 128;
const CLIENT_CX = 680;
const PROVIDER_CX = 1630;
const PANEL = { left: 1360, top: 40, width: 540, height: 1000 };

const Slot: React.FC<{ cx: number; f: number; provider?: boolean; label: string; dim: number; children: React.ReactNode }> = ({ cx, f, provider, label, dim, children }) => {
  const rise = (1 - sp(f, 0, SOFT)) * 60;
  return (
    <>
      <div style={{ position: 'absolute', left: cx - PHONE_W / 2 - 1, top: PHONE_TOP - 70, width: PHONE_W + 2, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '10px 22px', borderRadius: 99, background: provider ? S.skyLight : S.primary, color: provider ? S.navy : S.white, fontFamily: INTER, fontWeight: 800, fontSize: 22, letterSpacing: '0.12em' }}>
          {label}
        </div>
      </div>
      <div style={{ position: 'absolute', left: cx - PHONE_W / 2, top: PHONE_TOP + rise, width: PHONE_W, height: PHONE_H }}>
        <Phone w={PHONE_W}>{children}</Phone>
        {/* quiet state for the phone that is not the focus of this beat */}
        <div style={{ position: 'absolute', left: PAD, top: PAD, width: PHONE_W - PAD * 2, height: PHONE_H - PAD * 2, borderRadius: PHONE_W * 0.115, background: provider ? 'rgba(10,22,34,1)' : 'rgba(246,248,250,1)', opacity: dim, pointerEvents: 'none', zIndex: 40 }} />
      </div>
    </>
  );
};

type Beat = 1 | 2;
export const HeroStage: React.FC<{ f: number; beat: Beat }> = ({ f, beat }) => {
  const head = beat === 1
    ? { pre: 'Post a ', key: 'job', post: '.' }
    : { pre: 'Jobs come to ', key: 'you', post: '.' };
  const hp = sp(f, 0, SOFT);
  // Beat 1: client is the focus. Beat 2: provider is the focus, client goes quiet.
  const clientDim = beat === 2 ? tw(f, 0, 16, 0, 0.62) : 0;
  const providerDim = beat === 1 ? tw(f, 0, 16, 0, 0.42) : 0;

  return (
    <AbsoluteFill style={{ background: S.canvas, fontFamily: INTER, overflow: 'hidden' }}>
      {/* airy background with a soft sky tint on the left */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 900px 700px at 28% 40%, rgba(186,230,253,0.55) 0%, rgba(246,248,250,0) 70%)' }} />
      {/* provider navy panel behind the right phone */}
      <div style={{ position: 'absolute', left: PANEL.left, top: PANEL.top, width: PANEL.width, height: PANEL.height, borderRadius: 44, background: S.navy }} />

      <Slot cx={CLIENT_CX} f={f} label="CLIENT" dim={clientDim}>
        {beat === 1 ? <ClientPostService f={f} /> : <ClientMyJobsQuiet />}
      </Slot>
      <Slot cx={PROVIDER_CX} f={f} provider label="PROVIDER" dim={providerDim}>
        <ProviderFeed f={f} newAt={beat === 2 ? 28 : undefined} />
      </Slot>

      {/* headline, bottom centre, one blue keyword */}
      <div style={{ position: 'absolute', left: 360, width: 1200, top: 938 + (1 - hp) * 30, textAlign: 'center', fontWeight: 800, fontSize: 84, letterSpacing: '-0.035em', lineHeight: '96px', color: S.ink, opacity: hp }}>
        {head.pre}
        <span style={{ color: S.primary }}>{head.key}</span>
        {head.post}
      </div>
    </AbsoluteFill>
  );
};

/** Beat 1 still: client on Post a job (Plumbing picked), provider on its Feed. */
export const HeroBeat1: React.FC<{ at?: number }> = ({ at }) => {
  const cur = useCurrentFrame();
  return <HeroStage f={at ?? cur} beat={1} />;
};

/** Beat 2 still: provider Feed with the new job, client dimmed on My Jobs. */
export const HeroBeat2: React.FC<{ at?: number }> = ({ at }) => {
  const cur = useCurrentFrame();
  return <HeroStage f={at ?? cur} beat={2} />;
};
