import { Camera, Droplets, Hammer, Hand, Sparkles, type LucideIcon } from 'lucide-react-native';

/** Fewer portfolio photos than this and the provider screen shows example cards. */
export const EXAMPLES_BELOW = 3;

export type PortfolioExample = { key: string; service: string; icon: LucideIcon; tip: string };

const EXAMPLES: Record<string, { icon: LucideIcon; tips: string[] }> = {
  plumbing: { icon: Droplets, tips: ['Show the whole sink or pipe, in good light', 'A before and after of the same spot'] },
  cleaning: { icon: Sparkles, tips: ['The whole room, wide shot, after cleaning', 'A before and after of the same corner'] },
  handyman: { icon: Hammer, tips: ['The finished repair, with the whole wall or fixture in view', 'A before and after from the same angle'] },
  manicure: { icon: Hand, tips: ['Both hands flat on a plain background, in daylight', 'A close-up of one nail showing the detail'] },
  pedicure: { icon: Hand, tips: ['Both feet on a plain background, in daylight', 'A close-up of one nail showing the detail'] },
};
const GENERIC = { icon: Camera, tips: ['Your finished work, whole and in good light', 'A before and after from the same angle'] };

/** Illustrated tips for each of the provider's services. No photos; the cards are labelled Example on screen. */
export function portfolioExamples(services: ReadonlyArray<{ id: number; name: string }>): PortfolioExample[] {
  return services.flatMap((service) => {
    const match = EXAMPLES[service.name.trim().toLowerCase()] ?? GENERIC;
    return match.tips.map((tip, index) => ({ key: `${service.id}-${index}`, service: service.name, icon: match.icon, tip }));
  });
}
