import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeNavigator } from './HomeNavigator';
import { HistoryNavigator } from './HistoryNavigator';
import { ScheduleNavigator } from './ScheduleNavigator';
import { NotificationsNavigator } from './NotificationsNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { colors } from '../theme/tokens';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const icons: Record<keyof AppTabParamList, string> = {
  HomeTab: '🏠',
  HistoryTab: '🕘',
  ScheduleTab: '📅',
  NotificationsTab: '🔔',
  ProfileTab: '👤'
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{icons[route.name as keyof AppTabParamList]}</Text>
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'Inicio' }} />
      <Tab.Screen name="HistoryTab" component={HistoryNavigator} options={{ title: 'Historial' }} />
      <Tab.Screen name="ScheduleTab" component={ScheduleNavigator} options={{ title: 'Turnos' }} />
      <Tab.Screen name="NotificationsTab" component={NotificationsNavigator} options={{ title: 'Avisos' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}
