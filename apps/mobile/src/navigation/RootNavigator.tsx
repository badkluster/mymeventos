import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { isBiometricSupported } from '../lib/biometrics';
import { isBiometricEnabled } from '../lib/secureStorage';
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
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

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

  if (status === 'booting') return <SplashScreen />;
  if (status === 'signedOut') return <NavigationContainer><AuthNavigator /></NavigationContainer>;
  if (status === 'locked') return <BiometricUnlockScreen />;
  if (showBiometricPrompt) return <BiometricSetupScreen />;
  return <NavigationContainer><AppNavigator /></NavigationContainer>;
}
