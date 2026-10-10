import Constants from 'expo-constants';

/** The installed app's version (app.json `version`), or null when the build does not carry one. */
export function appVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}
