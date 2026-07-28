import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import type { AuthStackParamList } from './types';
import type { PasswordResetDeepLink } from '../lib/deepLink';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator({ passwordReset }: { passwordReset?: PasswordResetDeepLink }) {
  return (
    <Stack.Navigator key={passwordReset?.token ?? 'default'} initialRouteName={passwordReset ? 'ResetPassword' : 'Login'} screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Recuperar contraseña' }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} initialParams={passwordReset} options={{ title: 'Restablecer contraseña' }} />
    </Stack.Navigator>
  );
}
