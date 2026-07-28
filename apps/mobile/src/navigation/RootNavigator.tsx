import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { isBiometricSupported } from '../lib/biometrics';
import { isBiometricEnabled } from '../lib/secureStorage';
import { getPasswordResetFromUrl, type PasswordResetDeepLink } from '../lib/deepLink';
import { useAuthStore } from '../state/authStore';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { BiometricUnlockScreen } from '../screens/auth/BiometricUnlockScreen';
import { BiometricSetupScreen } from '../screens/auth/BiometricSetupScreen';

export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const justLoggedIn = useAuthStore((state) => state.justLoggedIn);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const beginPasswordReset = useAuthStore((state) => state.beginPasswordReset);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [passwordReset, setPasswordReset] = useState<PasswordResetDeepLink>();
  const [checkingInitialDeepLink, setCheckingInitialDeepLink] = useState(true);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  useEffect(() => {
    let active = true;
    const handleUrl = (url: string) => {
      const params = getPasswordResetFromUrl(url);
      if (!params) return;
      setPasswordReset(params);
      void beginPasswordReset();
    };
    void Linking.getInitialURL()
      .then((url) => { if (active && url) handleUrl(url); })
      .catch(() => undefined)
      .finally(() => { if (active) setCheckingInitialDeepLink(false); });
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => { active = false; subscription.remove(); };
  }, [beginPasswordReset]);

  useEffect(() => {
    if (!justLoggedIn) {
      setShowBiometricPrompt(false);
      return;
    }
    void (async () => {
      const [supported, alreadyEnabled] = await Promise.all([isBiometricSupported(), isBiometricEnabled()]);
      setShowBiometricPrompt(supported && !alreadyEnabled);
    })();
  }, [justLoggedIn]);

  if (status === 'booting' || checkingInitialDeepLink) return <SplashScreen />;
  if (status === 'signedOut') return <NavigationContainer><AuthNavigator passwordReset={passwordReset} /></NavigationContainer>;
  if (status === 'locked') return <BiometricUnlockScreen />;
  if (showBiometricPrompt) return <BiometricSetupScreen />;
  return <NavigationContainer><AppNavigator /></NavigationContainer>;
}
