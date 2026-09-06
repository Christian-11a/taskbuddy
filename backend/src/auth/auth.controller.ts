import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  CompleteGoogleProfileDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SendEmailOtpDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';
import {
  ADMIN_CSRF_COOKIE,
  clearAdminSessionCookies,
  getCookie,
  hasMatchingCsrfToken,
  setAdminSessionCookies,
} from './admin-session';
import { appendRedirectParams } from './google-redirect';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { isAllowedWebOrigin } from './web-origins';
import { ThrottleAuth } from '../common/throttle';
import type { AuthenticatedRequest, Profile } from '../common/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ThrottleAuth()
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ThrottleAuth()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('admin/login')
  @HttpCode(200)
  @ThrottleAuth()
  async adminLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: { headers: { origin?: string } },
  ) {
    if (!isAllowedWebOrigin(req.headers.origin)) {
      throw new ForbiddenException('Untrusted Origin');
    }
    const result = await this.authService.login(dto);
    if (result.user.role !== 'admin') {
      await this.authService.logout(result.session.access_token);
      throw new ForbiddenException('Admin access required');
    }

    const csrfToken = setAdminSessionCookies(res, result.session);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        role: result.user.role,
      },
      csrf_token: csrfToken,
    };
  }

  @Post('admin/refresh')
  @HttpCode(200)
  async adminRefresh(
    @Req()
    req: {
      headers: { cookie?: string; 'x-csrf-token'?: string };
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieHeader = req.headers.cookie;
    const refreshToken = getCookie(cookieHeader, 'tb_admin_refresh');
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    if (!hasMatchingCsrfToken(cookieHeader, req.headers['x-csrf-token'])) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    const result = await this.authService.refresh({
      refresh_token: refreshToken,
    });
    const csrfToken = setAdminSessionCookies(res, result.session);
    return { success: true, csrf_token: csrfToken };
  }

  @Get('admin/session')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  adminSession(
    @CurrentUser() user: Profile,
    @Req() req: { headers: { cookie?: string } },
  ) {
    return {
      user: { id: user.id, full_name: user.full_name, role: user.role },
      csrf_token: getCookie(req.headers.cookie, ADMIN_CSRF_COOKIE),
    };
  }

  @Post('admin/logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  async adminLogout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(req.accessToken);
    clearAdminSessionCookies(res);
    return result;
  }

  /** Step 1 — redirect the browser to Google's consent screen. */
  @Get('google/authorize')
  @Redirect()
  googleAuthorize(@Query('app_redirect') appRedirect: string) {
    if (!appRedirect) throw new BadRequestException('app_redirect is required');
    const url = this.authService.buildGoogleAuthUrl(appRedirect);
    return { url, statusCode: 302 };
  }

  /**
   * Step 2 — Google redirects here after the user consents.
   *
   * The backend exchanges the code for an id_token, signs in with Supabase,
   * then redirects the browser to the app's deep link (appRedirect from state)
   * with the session tokens in the query string.
   *
   * On any error that occurs after the state is parsed, the browser is
   * redirected to appRedirect?google_error=<message> so the app can
   * surface a user-friendly error instead of a blank browser screen.
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      const { appRedirect, session } =
        await this.authService.handleGoogleCallback(code, state);
      const params = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: String(session.expires_at),
      });
      return res.redirect(appendRedirectParams(appRedirect, params));
    } catch (err: unknown) {
      // Try to send the error back to the app rather than leaving the user
      // staring at a browser error page. tryParseAppRedirect enforces the
      // redirect allowlist, so a forged state can't aim this at a third party.
      const appRedirect = this.authService.tryParseAppRedirect(state ?? '');
      if (appRedirect) {
        const message =
          err instanceof HttpException ? err.message : 'Google sign-in failed';
        const params = new URLSearchParams({ google_error: message });
        return res.redirect(appendRedirectParams(appRedirect, params));
      }
      // No usable redirect — fall through to NestJS's error handler.
      throw err;
    }
  }

  /** Mails a recovery code. Always 200, even for an address with no account. */
  @Post('forgot-password')
  @ThrottleAuth()
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /** Exchanges that code for a session and sets the new password. */
  @Post('reset-password')
  @ThrottleAuth()
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * Mails a signup verification code. Always 200 - see the service comment on
   * why this must not report whether the address exists or is already
   * confirmed.
   */
  @Post('send-email-otp')
  @ThrottleAuth()
  @HttpCode(200)
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(dto);
  }

  /** Exchanges that code for a confirmed account and a session. */
  @Post('verify-email-otp')
  @ThrottleAuth()
  @HttpCode(200)
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.accessToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: Profile) {
    return this.authService.me(user);
  }

  @Post('change-password')
  @ThrottleAuth()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: Profile, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  /**
   * Completes the profile for a new Google OAuth user.
   *
   * Called after the user picks their role on GoogleRoleSelectionScreen (and,
   * for providers, fills in category + consents on GoogleSPDetailsScreen).
   * Clears the google_signup_pending flag so subsequent requests route normally.
   */
  @Post('complete-google-profile')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  completeGoogleProfile(
    @CurrentUser() user: Profile,
    @Body() dto: CompleteGoogleProfileDto,
  ) {
    return this.authService.completeGoogleProfile(user, dto);
  }
}
