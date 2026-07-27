import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator({ passwordResetToken }: { passwordResetToken?: string }) {
  return (
    <Stack.Navigator key={passwordResetToken ?? 'default'} initialRouteName={passwordResetToken ? 'ResetPassword' : 'Login'} screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Recuperar contraseña' }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} initialParams={passwordResetToken ? { token: passwordResetToken } : undefined} options={{ title: 'Restablecer contraseña' }} />
    </Stack.Navigator>
  );
}
