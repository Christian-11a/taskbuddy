// Stops Android (and "dark mode for all apps" on Xiaomi, Oppo, Vivo, Realme)
// from auto-inverting the app's colours. The app has its own Dark Mode
// setting, so a forced inversion would make text and badges unreadable.
const { withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

module.exports = function withNoForceDark(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:forceDarkAllowed',
      value: 'false',
    });
    return cfg;
  });
};
