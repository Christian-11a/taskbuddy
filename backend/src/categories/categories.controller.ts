import { BadRequestException, Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list() {
    const { data, error } = await this.supabase.admin
      .from('service_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('id');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }
}
