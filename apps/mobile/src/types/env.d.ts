declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_APP_ENV?: string;
    EXPO_PUBLIC_DEEP_LINK_SCHEME?: string;
    [key: string]: string | undefined;
  };
};
