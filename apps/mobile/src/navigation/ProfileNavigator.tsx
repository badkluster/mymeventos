import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { BiometricSettingsScreen } from '../screens/profile/BiometricSettingsScreen';
import { ActiveSessionsScreen } from '../screens/profile/ActiveSessionsScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Editar perfil' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="BiometricSettings" component={BiometricSettingsScreen} options={{ title: 'Seguridad' }} />
      <Stack.Screen name="ActiveSessions" component={ActiveSessionsScreen} options={{ title: 'Dispositivos' }} />
    </Stack.Navigator>
  );
}
