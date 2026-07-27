import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeNavigator } from './HomeNavigator';
import { HistoryNavigator } from './HistoryNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { colors } from '../theme/tokens';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const tabLabels: Record<keyof AppTabParamList, string> = {
  HomeTab: 'Inicio',
  HistoryTab: 'Historial',
  ProfileTab: 'Perfil'
};

function NavigationIcon({ name, focused, color }: { name: keyof AppTabParamList; focused: boolean; color: string }) {
  const glyph = { borderColor: color };
  return <View style={[styles.iconShell, focused && styles.iconShellActive]}>
    {name === 'HomeTab' ? <View style={styles.homeIcon}><View style={[styles.homeRoof, glyph]} /><View style={[styles.homeBody, glyph]} /></View> : null}
    {name === 'HistoryTab' ? <View style={[styles.clockIcon, glyph]}><View style={[styles.clockHandLong, { backgroundColor: color }]} /><View style={[styles.clockHandShort, { backgroundColor: color }]} /></View> : null}
    {name === 'ProfileTab' ? <View style={styles.profileIcon}><View style={[styles.profileHead, glyph]} /><View style={[styles.profileBody, glyph]} /></View> : null}
  </View>;
}

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.iconContainer,
        tabBarHideOnKeyboard: true,
        tabBarLabel: ({ focused, color }) => <Text style={[styles.label, { color }, focused && styles.labelActive]}>{tabLabels[route.name as keyof AppTabParamList]}</Text>,
        tabBarIcon: ({ focused, color }) => <NavigationIcon name={route.name as keyof AppTabParamList} focused={focused} color={focused ? colors.primaryText : color} />
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
    height: 82,
    paddingTop: 8,
    paddingBottom: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 16
  },
  item: { borderRadius: 18, marginHorizontal: 4, paddingTop: 1 },
  iconContainer: { marginTop: 0 },
  label: { marginTop: 3, fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  labelActive: { fontWeight: '800' },
  iconShell: { width: 42, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  iconShellActive: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  homeIcon: { width: 22, height: 22, alignItems: 'center' },
  homeRoof: { position: 'absolute', top: 2, width: 13, height: 13, borderTopWidth: 2, borderLeftWidth: 2, transform: [{ rotate: '45deg' }] },
  homeBody: { position: 'absolute', bottom: 1, width: 15, height: 12, borderWidth: 2, borderTopWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  clockIcon: { width: 21, height: 21, borderWidth: 2, borderRadius: 12 },
  clockHandLong: { position: 'absolute', width: 2, height: 7, left: 8, top: 3, borderRadius: 2 },
  clockHandShort: { position: 'absolute', width: 6, height: 2, left: 9, top: 10, borderRadius: 2, transform: [{ rotate: '32deg' }] },
  profileIcon: { width: 22, height: 22, alignItems: 'center' },
  profileHead: { width: 8, height: 8, borderWidth: 2, borderRadius: 8 },
  profileBody: { position: 'absolute', bottom: 1, width: 17, height: 10, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
});
