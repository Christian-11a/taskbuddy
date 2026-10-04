import { ValidationPipe } from '@nestjs/common';
import { CreatePortfolioDto, PortfolioDetailsDto } from './dto/portfolio.dto';
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
it.each([
  { caption: 'Work', position: -1, image_path: 'owner/photo.jpg' },
  { caption: '', position: 0, image_path: 'owner/photo.jpg' },
  {
    caption: 'Work',
    position: 0,
    image_path: 'owner/photo.jpg',
    provider_id: 'foreign',
  },
  {
    caption: 'Work',
    position: 0,
    image_path: 'owner/photo.jpg',
    image_url: 'https://foreign',
  },
])(
  'rejects invalid details and authoritative client fields %j',
  async (input) => {
    await expect(
      pipe.transform(input, { type: 'body', metatype: CreatePortfolioDto }),
    ).rejects.toThrow();
  },
);
it('allows optional category removal but keeps the uploaded image immutable on edit', async () => {
  await expect(
    pipe.transform(
      { caption: 'Work', position: 3, category_id: null },
      { type: 'body', metatype: PortfolioDetailsDto },
    ),
  ).resolves.toEqual({ caption: 'Work', position: 3, category_id: null });
  await expect(
    pipe.transform(
      { caption: 'Work', position: 3, image_path: 'other' },
      { type: 'body', metatype: PortfolioDetailsDto },
    ),
  ).rejects.toThrow();
});
