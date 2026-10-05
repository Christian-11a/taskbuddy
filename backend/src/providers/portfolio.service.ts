import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UploadsService } from '../uploads/uploads.service';
import type { Profile } from '../common/types';
import type {
  CreatePortfolioDto,
  PortfolioDetailsDto,
} from './dto/portfolio.dto';
@Injectable()
export class PortfolioService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uploads: UploadsService,
  ) {}
  async list(user: Profile, providerId: string) {
    if (
      user.role !== 'client' &&
      !(user.role === 'provider' && user.id === providerId)
    )
      throw new ForbiddenException(
        'Portfolio access requires a client account or the portfolio owner',
      );
    const { data: provider, error: providerError } = await this.supabase.admin
      .from('profiles')
      .select('id, role, deleted_at, deactivated_at')
      .eq('id', providerId)
      .maybeSingle();
    if (providerError) throw new BadRequestException(providerError.message);
    if (
      !provider ||
      provider.role !== 'provider' ||
      provider.deleted_at ||
      provider.deactivated_at
    )
      throw new NotFoundException('Provider not found');
    const { data, error } = await this.supabase.admin
      .from('provider_portfolio')
      .select(
        'id, provider_id, image_path, caption, position, category_id, created_at, service_categories(id, name)',
      )
      .eq('provider_id', providerId)
      .order('position')
      .order('created_at')
      .order('id');
    if (error) throw new BadRequestException(error.message);
    return Promise.all(
      (data ?? []).map(async (row) => {
        const image_url = await this.uploads.signedDownloadUrl(
          'provider-portfolio',
          row.image_path,
          3600,
        );
        if (!image_url)
          throw new BadRequestException(
            'Could not load a portfolio photo. Try again.',
          );
        const { image_path: _path, ...entry } = row;
        return { ...entry, image_url };
      }),
    );
  }
  async create(user: Profile, dto: CreatePortfolioDto) {
    this.uploads.assertOwnedPaths(user, [dto.image_path]);
    await this.uploads.assertValidImage('provider-portfolio', dto.image_path);
    const { data, error } = await this.supabase.admin
      .from('provider_portfolio')
      .insert({ ...dto, caption: dto.caption.trim(), provider_id: user.id })
      .select('id')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
  async update(user: Profile, id: string, dto: PortfolioDetailsDto) {
    const { data, error } = await this.supabase.admin
      .from('provider_portfolio')
      .update({ ...dto, caption: dto.caption.trim() })
      .eq('id', id)
      .eq('provider_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Portfolio entry not found');
    return data;
  }
  async remove(user: Profile, id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_portfolio')
      .delete()
      .eq('id', id)
      .eq('provider_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Portfolio entry not found');
    return { removed: true };
  }
}
