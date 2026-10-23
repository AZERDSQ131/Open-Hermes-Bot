import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/** The screens of the app: the chats, a conversation, and the pages behind them. */
export type RootStackParamList = {
  Chats: undefined;
  Settings: undefined;
  Setup: undefined;
  Connection: undefined;
  Models: undefined;
  Voice: undefined;
  Updates: undefined;
  Appearance: undefined;
  Chat: { threadId: string };
};

export type AppNavigation = NativeStackNavigationProp<RootStackParamList>;

export function useAppNavigation(): AppNavigation {
  return useNavigation<AppNavigation>();
}
