import { BrushCleaning, Footprints, Hammer, Hand, Wrench } from 'lucide-react-native';
import { categoryIcon } from '../categoryIcon';
import NailPolishIcon from '../../components/ui/icons/NailPolishIcon';

describe('categoryIcon', () => {
  it('gives each known service category its own icon, with the wrench for plumbing', () => {
    expect(categoryIcon('Plumbing')).toBe(Wrench);
    expect(categoryIcon('Cleaning')).toBe(BrushCleaning);
    expect(categoryIcon('Handyman')).toBe(Hammer);
    expect(categoryIcon('Pedicure')).toBe(Footprints);
  });

  it('gives manicure the nail-polish bottle', () => {
    expect(categoryIcon('Manicure')).toBe(NailPolishIcon);
  });

  it('falls back to the wrench for a name it does not know, or for no name', () => {
    expect(categoryIcon('Gardening')).toBe(Wrench);
    expect(categoryIcon('—')).toBe(Wrench);
    expect(categoryIcon('')).toBe(Wrench);
    expect(categoryIcon(null)).toBe(Wrench);
    expect(categoryIcon(undefined)).toBe(Wrench);
  });

  it('uses the fallback the caller passes for a name it does not know', () => {
    expect(categoryIcon('Gardening', Hand)).toBe(Hand);
    expect(categoryIcon('Pedicure', Hand)).toBe(Footprints);
  });

  it('does not treat object property names such as constructor as a known category', () => {
    expect(categoryIcon('constructor')).toBe(Wrench);
    expect(categoryIcon('toString')).toBe(Wrench);
  });
});
