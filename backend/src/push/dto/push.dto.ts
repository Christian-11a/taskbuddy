import { IsIn, IsString, Matches } from 'class-validator';
import type { DevicePlatform } from '../../common/types';

/**
 * Expo's token format. Validated here so a malformed token is a 400 at
 * registration rather than a per-notification error from Expo's API later,
 * when there is no request left to attribute it to.
 */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export class RegisterDeviceDto {
  @IsString()
  @Matches(EXPO_PUSH_TOKEN, {
    message: 'token must be an Expo push token, e.g. ExponentPushToken[...]',
  })
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: DevicePlatform;
}
