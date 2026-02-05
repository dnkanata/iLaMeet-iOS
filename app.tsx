// App.tsx - Updated for Expo
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Import screens
import EnrollmentScreen from './src/screens/auth/EnrollmentScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import MeetingDashboard from './src/screens/meeting/MeetingDashboard';
import UpdatePinScreen from './src/screens/auth/UpdatePinScreen';

const Stack = createNativeStackNavigator();

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#3498db" />
    <Text style={styles.loadingText}>iLaMeet Attendance System</Text>
  </View>
);

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Load any resources here
        await initializeApp();
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  const initializeApp = async () => {
    try {
      // Check if first launch
      const isFirstLaunch = await AsyncStorage.getItem('@first_launch');
      
      if (!isFirstLaunch) {
        setInitialRoute('Enrollment');
      } else {
        // Check user session
        const userSession = await AsyncStorage.getItem('@user_session');
        setInitialRoute(userSession ? 'MeetingDashboard' : 'Login');
      }
    } catch (error) {
      setInitialRoute('Login');
    }
  };

  if (!appIsReady || !initialRoute) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar backgroundColor="#2c3e50" barStyle="light-content" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: '#ffffff' },
          }}
        >
          <Stack.Screen 
            name="Enrollment" 
            component={EnrollmentScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen 
            name="UpdatePin" 
            component={UpdatePinScreen}
            options={{ 
              headerShown: true,
              title: 'Set New PIN',
              headerStyle: {
                backgroundColor: '#2c3e50',
              },
              headerTintColor: '#ffffff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
          <Stack.Screen 
            name="MeetingDashboard" 
            component={MeetingDashboard}
            options={{ 
              gestureEnabled: false,
              headerShown: true,
              title: 'Meeting Dashboard',
              headerStyle: {
                backgroundColor: '#2c3e50',
              },
              headerTintColor: '#ffffff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 24,
    color: '#2c3e50',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});