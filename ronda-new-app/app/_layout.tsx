import { Stack } from "expo-router";
import { AuthProvider } from "../src/services/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ href: null }} />
        <Stack.Screen name="login" />
        <Stack.Screen name="vehicle-select" />
        <Stack.Screen name="photo-capture" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
