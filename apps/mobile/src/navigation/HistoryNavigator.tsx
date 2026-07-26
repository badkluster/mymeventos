import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { WorkSessionDetailScreen } from '../screens/history/WorkSessionDetailScreen';
import { IncidentsScreen } from '../screens/history/IncidentsScreen';
import { NewIncidentScreen } from '../screens/history/NewIncidentScreen';
import { AdjustmentsScreen } from '../screens/history/AdjustmentsScreen';
import { NewAdjustmentScreen } from '../screens/history/NewAdjustmentScreen';
import type { HistoryStackParamList } from './types';

const Stack = createNativeStackNavigator<HistoryStackParamList>();

export function HistoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkSessionDetail" component={WorkSessionDetailScreen} options={{ title: 'Jornada' }} />
      <Stack.Screen name="Incidents" component={IncidentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewIncident" component={NewIncidentScreen} options={{ title: 'Nueva incidencia', presentation: 'modal' }} />
      <Stack.Screen name="Adjustments" component={AdjustmentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewAdjustment" component={NewAdjustmentScreen} options={{ title: 'Solicitar corrección', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
