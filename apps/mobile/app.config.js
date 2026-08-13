module.exports = ({ config }) => ({
  ...config,
  runtimeVersion: {
    policy: 'appVersion'
  },
  updates: {
    ...config.updates,
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0
  },
  extra: {
    ...config.extra,
    appUpdates: {
      enabled: true,
      appStoreCountry: 'AR',
      ...config.extra?.appUpdates
    }
  }
});
