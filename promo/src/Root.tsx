import React from 'react';
import { Composition } from 'remotion';
import { Promo } from './Promo';
import { FPS, TOTAL } from './motion';
import { H, W } from './theme';
import { LogoTest } from './v2/LogoTest';
import { PromoV2 } from './v2/PromoV2';
import { TOTAL60 } from './v2/timeline';
import { HeroLoop, HERO_LOOP_FRAMES } from './v2/HeroLoop';
import { StoryClip, storyClipMetadata } from './v2/StoryClip';
import { PhoneStill, PHONE_STILL } from './v2/PhoneStill';
import { OgImage } from './OgImage';
import { GuideLesson, calculateGuideMetadata, GUIDE_FPS, TITLE_FRAMES, END_FRAMES } from './guide/GuideLesson';

export const Root: React.FC = () => (
  <>
    <Composition id="TaskBuddy60" component={PromoV2} durationInFrames={TOTAL60} fps={FPS} width={1920} height={1080} />
    <Composition id="HeroLoop" component={HeroLoop} durationInFrames={HERO_LOOP_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="StoryClip" component={StoryClip} durationInFrames={100} fps={FPS} width={1080} height={1080} defaultProps={{ role: 'customer' as const, step: 1 }} calculateMetadata={storyClipMetadata} />
    <Composition id="PhoneStill" component={PhoneStill} durationInFrames={1} fps={FPS} width={PHONE_STILL.w} height={PHONE_STILL.h} defaultProps={{ role: 'customer' as const, film: 300 }} />
    <Composition id="TaskBuddyPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="LogoTest" component={LogoTest} durationInFrames={1} fps={FPS} width={2048} height={512} />
    <Composition id="GuideLesson" component={GuideLesson} durationInFrames={TITLE_FRAMES + END_FRAMES + 300} fps={GUIDE_FPS} width={1920} height={1080} defaultProps={{ lessonId: 'sample-post-a-job' }} calculateMetadata={calculateGuideMetadata} />
    <Composition id="GuideLesson720" component={GuideLesson} durationInFrames={TITLE_FRAMES + END_FRAMES + 300} fps={GUIDE_FPS} width={1280} height={720} defaultProps={{ lessonId: 'sample-post-a-job' }} calculateMetadata={calculateGuideMetadata} />
    <Composition id="OgImage" component={OgImage} durationInFrames={1} fps={30} width={1200} height={630} />
  </>
);
