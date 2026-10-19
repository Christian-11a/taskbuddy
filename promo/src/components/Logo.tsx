import React from 'react';
import { C } from '../theme';

// TaskBuddy mark (mobile/assets/Logo.png) rebuilt as separate vector parts so
// every piece can move on its own.
export type PartName =
  | 'board' | 'clip'
  | 'box0' | 'box1' | 'box2'
  | 'line0' | 'line1' | 'line2'
  | 'body' | 'head' | 'cap' | 'visor';

export interface PartT { x?: number; y?: number; r?: number; s?: number; sx?: number; sy?: number; o?: number; }

const tf = (t: PartT = {}, origin = 'center') => ({
  transform: `translate(${t.x ?? 0}px, ${t.y ?? 0}px) rotate(${t.r ?? 0}deg) scale(${(t.s ?? 1) * (t.sx ?? 1)}, ${(t.s ?? 1) * (t.sy ?? 1)})`,
  transformBox: 'fill-box' as const,
  transformOrigin: origin,
  opacity: t.o ?? 1,
});

export const LINE_W = [78, 62, 78];

export const Logo: React.FC<{
  size: number;
  part?: (p: PartName) => PartT;
  /** 0..1 draw progress of the three check marks */
  checks?: [number, number, number];
  /** 0..1 fill of the three lines */
  lines?: [number, number, number];
  buddy?: PartT;
  style?: React.CSSProperties;
}> = ({ size, part = () => ({}), checks = [0, 0, 1], lines = [1, 1, 1], buddy = {}, style }) => {
  const P = part;
  return (
    <svg viewBox="0 0 240 270" width={size} height={size * 270 / 240} style={{ overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id="lg-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#12b3dc" />
          <stop offset="1" stopColor={C.brandCyan} />
        </linearGradient>
      </defs>
      <g style={tf(P('board'))}>
        <rect x={20} y={28} width={160} height={200} rx={22} fill="url(#lg-board)" />
      </g>
      <g style={tf(P('clip'), 'bottom')}>
        <rect x={64} y={12} width={72} height={34} rx={12} fill="#12b3dc" />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <g style={tf(P(`box${i}` as PartName))}>
            <rect x={44} y={70 + i * 50} width={26} height={26} rx={5} fill={C.white} />
            <path
              d={`M49.5 ${84 + i * 50} l6 6.5 l11 -13`}
              fill="none"
              stroke={C.logoAccent}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - checks[i]}
            />
          </g>
          <g style={tf(P(`line${i}` as PartName), 'left')}>
            <rect
              x={84}
              y={77 + i * 50}
              width={Math.max(0.001, LINE_W[i] * lines[i])}
              height={12}
              rx={6}
              fill={i === 2 ? C.brandCyanLight : C.white}
            />
          </g>
        </g>
      ))}
      <g style={tf(buddy, 'bottom')}>
        <g style={tf(P('body'), 'bottom')}>
          <path d="M140 266 C140 226 160 212 185 212 C210 212 230 226 230 266 Z" fill={C.logoAccent} />
        </g>
        <g style={tf(P('head'))}>
          <circle cx={185} cy={183} r={25} fill={C.logoSkin} />
        </g>
        <g style={tf(P('cap'), 'bottom')}>
          <path d="M158 182 C158 150 212 150 212 182 Z" fill={C.logoAccent} />
        </g>
        <g style={tf(P('visor'))}>
          <rect x={156} y={177} width={58} height={9} rx={4.5} fill={C.brandCyanLight} />
        </g>
      </g>
    </svg>
  );
};
