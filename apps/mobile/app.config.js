module.exports = ({ config }) => ({
  ...config,

  runtimeVersion: {
    policy: 'appVersion'
  },

  updates: {
    ...config.updates,
    url: 'https://u.expo.dev/8268a26a-bc2c-4377-846b-6c5f7a2f5757',
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0
  },

  extra: {
    ...config.extra,

    eas: {
      ...config.extra?.eas,
      projectId: '8268a26a-bc2c-4377-846b-6c5f7a2f5757'
    },

    appUpdates: {
      enabled: true,
      appStoreCountry: 'AR',
      ...config.extra?.appUpdates
    }
  }
});