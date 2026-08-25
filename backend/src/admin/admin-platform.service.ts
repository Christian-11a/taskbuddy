import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AdminActionsService } from './admin-actions.service';
import {
  BroadcastNotificationDto,
  CreateAdminDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCommissionDto,
} from './dto/admin.dto';
import type { Profile, UserRole } from '../common/types';

/**
 * Notification rows are written in chunks rather than one statement per
 * recipient. A single insert of every row on a platform-sized audience is one
 * request the free-tier database may refuse outright; a row at a time is
 * thousands of round trips.
 */
const BROADCAST_CHUNK = 500;

/**
 * Platform administration that is about the platform rather than about one
 * user, job or payment: the service catalogue, who else is an admin, messages
 * to everyone, and the commission rate.
 *
 * Separate from AdminService, which is already the moderation and reporting
 * surface, so neither file becomes the place where everything admin-shaped
 * ends up.
 */
@Injectable()
export class AdminPlatformService {
  private readonly logger = new Logger(AdminPlatformService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly adminActions: AdminActionsService,
  ) {}

  // ── Service categories ────────────────────────────────────────────────────

  /**
   * Every category, active or not — unlike `GET /categories`, which serves the
   * apps and shows only what a job can still be posted under. An admin
   * managing the catalogue has to see what they deactivated.
   */
  async listCategories() {
    const { data, error } = await this.supabase.admin
      .from('service_categories')
      .select('*')
      .order('id');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async createCategory(admin: Profile, dto: CreateCategoryDto) {
    const { data, error } = await this.supabase.admin
      .from('service_categories')
      .insert({ name: dto.name.trim() })
      .select('*')
      .single();
    // `name` is UNIQUE in the schema (0001). Reporting the collision beats
    // letting a raw constraint name reach the console.
    if (error?.code === '23505') {
      throw new ConflictException(
        `A category named '${dto.name}' already exists`,
      );
    }
    if (error) throw new BadRequestException(error.message);

    await this.adminActions.record(
      admin,
      'category.create',
      'service_categories',
      String((data as { id: number }).id),
      { name: dto.name },
    );
    return data;
  }

  /**
   * Renames a category or takes it out of circulation.
   *
   * There is no delete. `jobs`, `provider_profiles`, `profiles.signup_category_id`
   * and the ML feature set all reference a category by id — removing one would
   * either cascade real history away or fail on the constraint, and neither is
   * what "remove this from the menu" should mean. `is_active: false` stops it
   * being offered on new jobs while every job that used it still says what it
   * was.
   */
  async updateCategory(admin: Profile, id: number, dto: UpdateCategoryDto) {
    if (dto.name === undefined && dto.is_active === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.is_active !== undefined) patch.is_active = dto.is_active;

    const { data, error } = await this.supabase.admin
      .from('service_categories')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error?.code === '23505') {
      throw new ConflictException(
        `A category named '${dto.name}' already exists`,
      );
    }
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Category not found');

    await this.adminActions.record(
      admin,
      'category.update',
      'service_categories',
      String(id),
      patch,
    );
    return data;
  }

  // ── Admin accounts ────────────────────────────────────────────────────────

  /** Who currently holds admin. Small by design, so no pagination. */
  async listAdmins() {
    const { data, error } = await this.supabase.admin
      .from('admin_user_overview')
      .select('id, email, full_name, created_at, deactivated_at, deleted_at')
      .eq('role', 'admin')
      .order('created_at');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Creates a second (third, fourth) admin — the manual step migration 0005
   * documented in a SQL comment, finally reachable from the console.
   *
   * No password is set here and none is accepted. The account is created
   * confirmed but without a usable credential, and a reset email is what lets
   * the new admin choose one. An endpoint that took a password would mean one
   * admin knowing another's, which makes the audit trail a guess about who was
   * actually at the keyboard.
   *
   * A caller who is already registered as a client or provider is promoted
   * instead of duplicated: Supabase keys accounts by email, and a second signup
   * on the same address cannot happen anyway.
   */
  async createAdmin(admin: Profile, dto: CreateAdminDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findProfileByEmail(email);
    if (existing) {
      if (existing.role === 'admin') {
        throw new ConflictException('That account is already an admin');
      }
      return this.promote(admin, existing.id, email);
    }

    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: dto.full_name, role: 'client' },
    });
    if (error || !data.user) {
      throw new BadRequestException(
        error?.message ?? 'Could not create the account',
      );
    }

    // The on_auth_user_created trigger has just written a 'client' profile —
    // the enum default for a new signup. Promote it and make sure the name
    // survives even if the trigger did not pick it up from metadata.
    const promoted = await this.setRole(data.user.id, 'admin', dto.full_name);
    await this.sendCredentialSetupEmail(email);
    await this.adminActions.record(
      admin,
      'admin.create',
      'profiles',
      data.user.id,
      { email, promoted_existing: false },
    );
    return promoted;
  }

  /**
   * Takes admin away again, back to 'client'.
   *
   * Two things it refuses, both for the same reason — a console nobody can get
   * into is not recoverable from inside the console: an admin cannot demote
   * themselves, and the last remaining admin cannot be demoted at all.
   */
  async revokeAdmin(admin: Profile, userId: string) {
    if (admin.id === userId) {
      throw new ForbiddenException(
        'You cannot revoke your own admin access. Ask another admin to do it.',
      );
    }
    const target = await this.findProfile(userId);
    if (target.role !== 'admin') {
      throw new BadRequestException('That account is not an admin');
    }

    const { count } = await this.supabase.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .is('deleted_at', null);
    if ((count ?? 0) <= 1) {
      throw new ForbiddenException(
        'This is the only admin account left. Create another before revoking it.',
      );
    }

    const demoted = await this.setRole(userId, 'client');
    await this.adminActions.record(admin, 'admin.revoke', 'profiles', userId);
    return demoted;
  }

  // ── Notification broadcast ────────────────────────────────────────────────

  /**
   * Writes one notification row per recipient. Deliberately not a single
   * "broadcast" row that every client renders: the read/unread state, the
   * badge count and the push scheduler are all per-row, and a shared row has
   * nowhere to record that *this* user has seen it.
   *
   * Push delivery follows for free — the 30-second scheduler (migration 0012)
   * picks pending rows up and honours each recipient's `push_enabled`. Nothing
   * here needs to know about devices.
   *
   * Deleted and suspended accounts are excluded. Neither can sign in to read
   * it, and a push to a suspended account is a message from a platform that
   * has just shut them out.
   */
  async broadcast(admin: Profile, dto: BroadcastNotificationDto) {
    let builder = this.supabase.admin
      .from('profiles')
      .select('id')
      .neq('role', 'admin')
      .is('deleted_at', null)
      .is('deactivated_at', null);
    if (dto.audience === 'clients') builder = builder.eq('role', 'client');
    if (dto.audience === 'providers') builder = builder.eq('role', 'provider');

    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    const recipients = (data ?? []) as { id: string }[];
    if (recipients.length === 0) {
      return { sent: 0, failed: 0, audience: dto.audience };
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += BROADCAST_CHUNK) {
      const chunk = recipients.slice(i, i + BROADCAST_CHUNK);
      const { error: insertError } = await this.supabase.admin
        .from('notifications')
        .insert(
          chunk.map((r) => ({
            recipient_id: r.id,
            type: 'announcement',
            title: dto.title,
            body: dto.body,
            data: { broadcast_by: admin.id },
          })),
        );
      // One failed chunk does not abandon the rest: a broadcast that reached
      // most of the platform and says so is more useful than one that stops at
      // the first problem and reports nothing about what did land.
      if (insertError) {
        failed += chunk.length;
        this.logger.error(
          `Broadcast chunk ${i / BROADCAST_CHUNK} failed: ${insertError.message}`,
        );
      } else {
        sent += chunk.length;
      }
    }

    await this.adminActions.record(
      admin,
      'notification.broadcast',
      'notifications',
      admin.id,
      { audience: dto.audience, title: dto.title, sent, failed },
    );
    return { sent, failed, audience: dto.audience };
  }

  // ── Commission ────────────────────────────────────────────────────────────

  async getCommission() {
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .select('commission_rate, updated_at')
      .eq('id', true)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Sets the platform's cut of every future escrow release.
   *
   * Future only, and that is a property of where the rate is read rather than
   * a rule enforced here: `EscrowService.payOut` reads it at the moment of
   * release and freezes the peso amount onto the escrow row. Jobs already
   * settled keep the figures they settled on; jobs in flight will use whatever
   * the rate is when they finish, which is the same deal every marketplace
   * offers and the reason a change is worth announcing.
   */
  async setCommission(admin: Profile, dto: UpdateCommissionDto) {
    const previous = await this.getCommission();
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .update({
        commission_rate: dto.commission_rate,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      })
      .eq('id', true)
      .select('commission_rate, updated_at')
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.adminActions.record(
      admin,
      'platform.commission_change',
      'platform_settings',
      admin.id,
      {
        from: Number(previous?.commission_rate ?? 0),
        to: dto.commission_rate,
      },
    );
    return data;
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  private async promote(admin: Profile, userId: string, email: string) {
    const promoted = await this.setRole(userId, 'admin');
    await this.adminActions.record(admin, 'admin.create', 'profiles', userId, {
      email,
      promoted_existing: true,
    });
    return promoted;
  }

  private async setRole(userId: string, role: UserRole, fullName?: string) {
    const patch: Record<string, unknown> = { role };
    if (fullName) patch.full_name = fullName;
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, full_name, role, created_at')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  /**
   * Lets the new admin set their own password. Failure is logged, not thrown:
   * the account exists and is an admin either way, and an admin staring at a
   * 500 does not know whether the promotion landed. They can re-send from the
   * Users page.
   */
  private async sendCredentialSetupEmail(email: string) {
    const { error } =
      await this.supabase.anon.auth.resetPasswordForEmail(email);
    if (error) {
      this.logger.warn(
        `Admin account created for ${email} but the password-setup email failed: ${error.message}`,
      );
    }
  }

  private async findProfile(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id, role, deleted_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  private async findProfileByEmail(email: string) {
    const { data, error } = await this.supabase.admin
      .from('admin_user_overview')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ?? null;
  }
}
