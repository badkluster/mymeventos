import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScheduleScreen } from '../screens/schedule/ScheduleScreen';
import type { ScheduleStackParamList } from './types';

const Stack = createNativeStackNavigator<ScheduleStackParamList>();

export function ScheduleNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
    </Stack.Navigator>
  );
}
