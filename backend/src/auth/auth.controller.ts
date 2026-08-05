import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { appendRedirectParams } from './google-redirect';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedRequest, Profile } from '../common/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /** Exchanges that code for a session and sets the new password. */
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: Profile, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }
}
