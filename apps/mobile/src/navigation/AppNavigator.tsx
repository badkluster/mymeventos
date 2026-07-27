import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeNavigator } from './HomeNavigator';
import { HistoryNavigator } from './HistoryNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { colors } from '../theme/tokens';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const icons: Record<keyof AppTabParamList, string> = {
  HomeTab: '◈',
  HistoryTab: '◷',
  ProfileTab: '◎'
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused, color }) => (
          <View style={[styles.iconShell, focused && styles.iconShellActive]}>
            <Text style={[styles.icon, { color }, !focused && styles.iconInactive]}>{icons[route.name as keyof AppTabParamList]}</Text>
          </View>
        )
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'Inicio' }} />
      <Tab.Screen name="HistoryTab" component={HistoryNavigator} options={{ title: 'Historial' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 76,
    paddingTop: 7,
    paddingBottom: 9,
    borderTopWidth: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 14
  },
  item: { borderRadius: 18, marginHorizontal: 6 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  iconShell: { width: 34, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  iconShellActive: { backgroundColor: colors.accentSoft },
  icon: { fontSize: 23, fontWeight: '700', lineHeight: 26 },
  iconInactive: { opacity: 0.72 }
});
