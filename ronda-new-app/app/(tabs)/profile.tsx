/**
 * Profile Screen
 * User profile and settings
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { colors, mode, setMode, theme } = useTheme();

  const isDarkEnabled = useMemo(() => {
    if (mode === 'system') return theme === 'dark';
    return mode === 'dark';
  }, [mode, theme]);

  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login' as any);
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>
              {user?.username?.charAt(0).toUpperCase() || 'D'}
            </Text>
          </View>
          <Text style={[styles.username, { color: colors.text }]}>{user?.username}</Text>
          <Text style={[styles.role, { color: colors.mutedText }]}>{user?.role}</Text>
        </View>

        {/* User Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>User Information</Text>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedText }]}>Username</Text>
            <Text style={[styles.value, { color: colors.text }]}>{user?.username}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedText }]}>Role</Text>
            <Text style={[styles.value, { color: colors.text }]}>{user?.role}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.mutedText }]}>Branch</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {user?.branchName || (user?.branchId ? `Branch #${user.branchId}` : 'Not assigned')}
            </Text>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingText, { color: colors.text }]}>Notifications</Text>
            <Text style={[styles.settingValue, { color: colors.mutedText }]}>On</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingText, { color: colors.text }]}>Location Services</Text>
            <Text style={[styles.settingValue, { color: colors.mutedText }]}>On</Text>
          </TouchableOpacity>
          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingText, { color: colors.text }]}>Theme</Text>
            <View style={styles.themeControls}>
              <TouchableOpacity
                onPress={() => setMode('system')}
                style={[
                  styles.pill,
                  {
                    backgroundColor: mode === 'system' ? colors.primary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: mode === 'system' ? colors.text : colors.mutedText }]}>System</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode('light')}
                style={[
                  styles.pill,
                  {
                    backgroundColor: mode === 'light' ? colors.primary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: mode === 'light' ? colors.text : colors.mutedText }]}>Light</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode('dark')}
                style={[
                  styles.pill,
                  {
                    backgroundColor: mode === 'dark' ? colors.primary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: mode === 'dark' ? colors.text : colors.mutedText }]}>Dark</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingText, { color: colors.text }]}>Dark Mode</Text>
            <Switch
              value={isDarkEnabled}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              thumbColor={isDarkEnabled ? colors.primary : undefined}
            />
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.danger }]} onPress={handleLogout}>
          <Text style={[styles.logoutButtonText, { color: '#fff' }]}>Logout</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.mutedText }]}>R.O.N.D.A. Driver App v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
  },
  username: {
    fontSize: 24,
    fontWeight: '700',
  },
  role: {
    fontSize: 16,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingText: {
    fontSize: 16,
  },
  settingValue: {
    fontSize: 16,
  },
  themeControls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 32,
  },
});
