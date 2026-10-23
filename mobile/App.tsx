import {
  NavigationContainer,
  DarkTheme,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from './src/store';
import { ChatScreen } from './src/screens/ChatScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { ModelsScreen } from './src/screens/ModelsScreen';
import { VoiceScreen } from './src/screens/VoiceScreen';
import { UpdatesScreen } from './src/screens/UpdatesScreen';
import { AppearanceScreen } from './src/screens/AppearanceScreen';
import type { RootStackParamList } from './src/nav';
import { C } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** The app is dark by construction: the system's light theme is not ours. */
const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.bg,
    text: C.text,
    border: C.divider,
    primary: C.paper,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={theme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              // The page comes in from the right and the same gesture takes
              // it back: the screen follows the finger, and cancels.
              animation: 'slide_from_right',
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
            }}
          >
            <Stack.Screen name="Chats" component={ConversationsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Setup" component={SetupScreen} />
            <Stack.Screen name="Connection" component={ConnectionScreen} />
            <Stack.Screen name="Models" component={ModelsScreen} />
            <Stack.Screen name="Voice" component={VoiceScreen} />
            <Stack.Screen name="Updates" component={UpdatesScreen} />
            <Stack.Screen name="Appearance" component={AppearanceScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
