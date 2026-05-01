import { Stack } from "expo-router";
import { AuthProvider } from "../src/services/auth";
import { EmergencyProvider } from "../src/contexts/EmergencyContext";
import { PingPollingProvider } from "../src/contexts/NotificationContext";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PingPollingProvider>
          <EmergencyProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="vehicle-select" />
              <Stack.Screen name="photo-capture" />
              <Stack.Screen name="ping-response" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </EmergencyProvider>
        </PingPollingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
