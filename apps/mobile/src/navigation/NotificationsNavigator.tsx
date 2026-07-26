import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import type { NotificationsStackParamList } from './types';

const Stack = createNativeStackNavigator<NotificationsStackParamList>();

export function NotificationsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
