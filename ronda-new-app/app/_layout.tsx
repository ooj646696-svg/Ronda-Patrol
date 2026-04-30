import { Stack } from "expo-router";
import { AuthProvider } from "../src/services/auth";
import { EmergencyProvider } from "../src/contexts/EmergencyContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <EmergencyProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="vehicle-select" />
          <Stack.Screen name="photo-capture" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </EmergencyProvider>
    </AuthProvider>
  );
}
