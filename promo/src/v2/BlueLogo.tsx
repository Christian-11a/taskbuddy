import React from 'react';
import { Img, staticFile } from 'remotion';

// mobile/assets/taskbuddy-logo.png, cut into its real pieces so each can
// animate: every visible piece is the PNG's own pixels, clipped by an outline
// traced from the PNG's alpha / colour masks (512×512 grid). A flat vector
// board sits underneath only to fill the holes pieces leave when they move.
export type BPart = 'board' | 'shine' | 'box0' | 'box1' | 'box2' | 'line0' | 'line1' | 'line2' | 'check' | 'body' | 'face' | 'cap' | 'brim';
export interface PT { x?: number; y?: number; r?: number; s?: number; sx?: number; sy?: number; o?: number }

const SRC = 'taskbuddy-logo.png';
const xf = (t: PT = {}) =>
  `translate(${t.x ?? 0}px, ${t.y ?? 0}px) rotate(${t.r ?? 0}deg) scale(${(t.s ?? 1) * (t.sx ?? 1)}, ${(t.s ?? 1) * (t.sy ?? 1)})`;

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x} ${y + h - r} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

// pieces on the board (with a little margin for their drop shadows)
const BOX = [
  { x: 87, y: 110, w: 70, h: 67 },
  { x: 87, y: 190, w: 70, h: 67 },
  { x: 85, y: 268, w: 74, h: 70 },
];
const LINE = [
  { x: 169, y: 123, w: 182, h: 38 },
  { x: 169, y: 203, w: 152, h: 38 },
  { x: 171, y: 285, w: 116, h: 42 },
];
// board outline with the buddy's silhouette notched out of its lower right
const BOARD_OUT =
  'M 28 126 A 84 84 0 0 1 112 42 L 335 42 A 84 84 0 0 1 419 126 L 419 228 C 408 225 398 225 386 225 C 344 225 314 250 310 284 C 300 289 290 298 289 311 C 288 320 293 330 303 331 C 307 331 309 331 311 331 A 74 74 0 0 0 334 378 C 302 386 276 404 275.5 436 L 112 436 A 84 84 0 0 1 28 352 Z';
const HOLES = [...BOX.map((b) => rr(b.x, b.y, b.w, b.h, 14)), ...LINE.map((l) => rr(l.x, l.y, l.w, l.h, 18))].join(' ');

const CUT = {
  body: 'M 340 370 A 66 66 0 0 0 430 370 C 460 378 487 402 487 440 L 487 460 C 487 471 480 478 470 478 L 300 478 C 290 478 283 471 283 460 L 283 440 C 283 402 310 378 340 370 Z',
  face: 'M 317.98 314 L 452.02 314 A 67.5 67.5 0 1 1 317.98 314 Z',
  cap: 'M 298 312 C 300 302 309 294 318 290 C 322 257 350 235 386 235 C 425 235 454 257 459 290 L 460 312 C 459 322 455 325 450 323 C 432 323 420 318 405 315 C 390 312 370 312 350 315 C 332 318 314 326 305 323 C 299 321 297 317 298 312 Z',
};

const Piece: React.FC<{ clip: string; t: PT; origin: string; evenodd?: boolean; reveal?: { x: number; w: number } }> = ({ clip, t, origin, evenodd, reveal }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 512, height: 512, transform: xf(t), transformOrigin: origin, opacity: t.o ?? 1 }}>
    <div style={{ position: 'absolute', inset: 0, clipPath: reveal ? `inset(0 ${512 - reveal.x - reveal.w}px 0 0)` : undefined }}>
      <Img src={staticFile(SRC)} style={{ position: 'absolute', width: 512, height: 512, clipPath: `path(${evenodd ? 'evenodd, ' : ''}'${clip}')` }} />
    </div>
  </div>
);

export const BlueLogo: React.FC<{
  size: number;
  part?: (p: BPart) => PT;
  check?: number; // 0..1: check mark wipes in
  lines?: [number, number, number];
  buddy?: PT;
  id?: string;
  style?: React.CSSProperties;
}> = ({ size, part = () => ({}), check = 1, lines = [1, 1, 1], buddy = {}, id = 'bl', style }) => {
  const P: (p: BPart) => PT = part;
  const board = P('board');
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 512, height: 512, transform: `scale(${size / 512})`, transformOrigin: '0 0' }}>
        {/* board: flat fill underneath + the real board pixels (holes where pieces sit) */}
        <div style={{ position: 'absolute', inset: 0, transform: xf(board), transformOrigin: '224px 240px', opacity: board.o ?? 1 }}>
          <svg width={512} height={512} style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0.3" y1="0" x2="0.6" y2="1">
                <stop offset="0" stopColor="#2aa6f5" />
                <stop offset="0.45" stopColor="#0b7fec" />
                <stop offset="1" stopColor="#0068dc" />
              </linearGradient>
              <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#4fc6fd" />
                <stop offset="1" stopColor="#0b63d8" />
              </linearGradient>
              <linearGradient id={`${id}-l3`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#8ee9fc" />
                <stop offset="1" stopColor="#5fd6fb" />
              </linearGradient>
            </defs>
            <path d={rr(28, 42, 391, 394, 84)} fill={`url(#${id}-rim)`} />
            <path d={rr(37, 51, 373, 376, 76)} fill={`url(#${id}-fill)`} />
            {/* hidden-behind-buddy end of the third line */}
            <path d={rr(178, 289, 164, 32, 16)} fill={`url(#${id}-l3)`} />
          </svg>
          <Img src={staticFile(SRC)} style={{ position: 'absolute', width: 512, height: 512, clipPath: `path(evenodd, '${BOARD_OUT} ${HOLES}')` }} />
        </div>

        {BOX.map((b, i) => (
          <Piece key={`b${i}`} clip={rr(b.x, b.y, b.w, b.h, 14)} t={P(`box${i}` as BPart)} origin={`${b.x + b.w / 2}px ${b.y + b.h / 2}px`} />
        ))}
        {/* box 3's check: hidden under a patch of the box's own colour, wiped away */}
        {check < 1 && (
          <div style={{ position: 'absolute', left: 0, top: 0, width: 512, height: 512, transform: xf(P('box2')), transformOrigin: '122px 303px', opacity: P('box2').o ?? 1 }}>
            <div style={{ position: 'absolute', left: 97 + 50 * check, top: 280, width: 50 * (1 - check) + 2, height: 46, borderRadius: 8, background: 'linear-gradient(180deg, #b6ecfd, #7fd6f7)' }} />
          </div>
        )}
        {LINE.map((l, i) => (
          <Piece key={`l${i}`} clip={rr(l.x, l.y, l.w, l.h, 18)} t={P(`line${i}` as BPart)} origin={`${l.x}px ${l.y + l.h / 2}px`} reveal={lines[i] < 1 ? { x: l.x, w: l.w * lines[i] } : undefined} />
        ))}

        {/* buddy */}
        <div style={{ position: 'absolute', inset: 0, transform: xf(buddy), transformOrigin: '385px 478px', opacity: buddy.o ?? 1, filter: 'drop-shadow(-5px 6px 7px rgba(0, 40, 110, 0.35))' }}>
          <Piece clip={CUT.body} t={P('body')} origin="385px 478px" />
          <Piece clip={CUT.face} t={P('face')} origin="385px 322px" />
          <Piece clip={CUT.cap} t={P('cap')} origin="385px 318px" />
        </div>
      </div>
    </div>
  );
};
