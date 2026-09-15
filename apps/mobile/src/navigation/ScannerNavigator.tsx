import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TicketPublicationsScreen } from '../screens/scanner/TicketPublicationsScreen';
import { TicketScannerScreen } from '../screens/scanner/TicketScannerScreen';
import type { ScannerStackParamList } from './types';

const Stack = createNativeStackNavigator<ScannerStackParamList>();

export function ScannerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="TicketPublications" component={TicketPublicationsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="TicketScanner"
        component={TicketScannerScreen}
        options={({ route }) => ({ title: route.params.publication.title })}
      />
    </Stack.Navigator>
  );
}
