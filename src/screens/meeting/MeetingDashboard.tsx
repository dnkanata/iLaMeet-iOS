// src/screens/meeting/MeetingDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  BackHandler,
  AppState,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { checkInMeeting, checkOutMeeting } from '../../services/api';

const MeetingDashboard = () => {
  const navigation = useNavigation();
  const [userData, setUserData] = useState<any>(null);
  const [meetingStatus, setMeetingStatus] = useState<'idle' | 'checked-in' | 'checked-out'>('idle');
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [sessionData, setSessionData] = useState<any>(null);
  const [isLocationEnabled, setIsLocationEnabled] = useState(true);
  const [userPin, setUserPin] = useState<string>('');
  const watchIdRef = useRef<Location.LocationSubscription | null>(null);
  const locationAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const backPressCountRef = useRef(0);
  const backPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const appStateSubscriptionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (isMountedRef.current) {
        loadUserData();
        checkCurrentMeetingStatus();
        initializeLocation();
      }
      
      return () => {
        if (watchIdRef.current) {
          watchIdRef.current.remove();
          watchIdRef.current = null;
        }
      };
    }, [])
  );

  useEffect(() => {
    setupAppStateListener();
    
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      backHandler.remove();
      
      if (backPressTimeoutRef.current) {
        clearTimeout(backPressTimeoutRef.current);
      }
      
      if (appStateSubscriptionRef.current) {
        appStateSubscriptionRef.current.remove();
        appStateSubscriptionRef.current = null;
      }
      
      if (watchIdRef.current) {
        watchIdRef.current.remove();
        watchIdRef.current = null;
      }
    };
  }, [navigation]);

  const setupAppStateListener = () => {
    appStateSubscriptionRef.current = AppState.addEventListener('change', handleAppStateChange);
  };

  const handleAppStateChange = (nextAppState: string) => {
    if (nextAppState === 'active') {
      initializeLocation();
      checkCurrentMeetingStatus();
    }
  };

  const handleBackPress = () => {
    // If there's an active meeting, just go back without any alert
    if (meetingStatus === 'checked-in') {
      // Simply navigate back without showing any alert
      // Or you can choose to do nothing and stay on the dashboard
      return false; // Allow default back behavior
    }
    
    backPressCountRef.current += 1;
    
    if (backPressCountRef.current === 1) {
      // First press: Go back to previous screen
      navigation.goBack();
      
      // Reset the counter after 2 seconds
      backPressTimeoutRef.current = setTimeout(() => {
        backPressCountRef.current = 0;
      }, 2000);
      
      return true; // We've handled the back press
    } else if (backPressCountRef.current >= 2) {
      // Second press within 2 seconds: Exit app
      BackHandler.exitApp();
      return true;
    }
    
    return false;
  };

  const initializeLocation = async () => {
    await requestLocationPermission();
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setHasLocationPermission(true);
        startLocationUpdates();
        return;
      }
      
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (newStatus === 'granted') {
        setHasLocationPermission(true);
        startLocationUpdates();
      } else {
        setHasLocationPermission(false);
        checkLocationServices();
      }
    } catch (err) {
      console.error('Location permission error:', err);
      setHasLocationPermission(false);
    }
  };

  const checkLocationServices = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        timeout: 3000,
      });
      setIsLocationEnabled(true);
    } catch (error) {
      setIsLocationEnabled(false);
    }
  };

  const startLocationUpdates = async () => {
    if (!hasLocationPermission) return;

    if (watchIdRef.current) {
      watchIdRef.current.remove();
    }

    getQuickLocation();
    
    watchIdRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 20,
        timeInterval: 15000,
      },
      (position) => {
        const locationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
          source: 'continuous',
          recordedAt: new Date().toISOString(),
          milliseconds: Date.now(),
        };
        if (isMountedRef.current) {
          setLocation(locationData);
          setIsLocationEnabled(true);
        }
      }
    );
  };

  const getQuickLocation = async () => {
    if (!hasLocationPermission) return;

    if (isMountedRef.current) {
      setLocationLoading(true);
    }
    
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        timeout: 5000,
      });
      
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        altitudeAccuracy: location.coords.altitudeAccuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
        timestamp: location.timestamp,
        source: 'quick-low-accuracy',
        recordedAt: new Date().toISOString(),
        milliseconds: Date.now(),
      };
      
      if (isMountedRef.current) {
        setLocation(locationData);
        setLocationLoading(false);
        setIsLocationEnabled(true);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setLocationLoading(false);
        setIsLocationEnabled(false);
        
        const fallbackLocation = {
          latitude: 0,
          longitude: 0,
          accuracy: 10000,
          timestamp: Date.now(),
          recordedAt: new Date().toISOString(),
          milliseconds: Date.now(),
          source: 'fallback',
          note: 'Location services unavailable'
        };
        setLocation(fallbackLocation);
      }
    }
  };

  const loadUserData = async () => {
    try {
      const sessionDataString = await AsyncStorage.getItem('@user_session');
      const userDataString = await AsyncStorage.getItem('@user_data');
      const userPinString = await AsyncStorage.getItem('@user_pin');
      
      if (sessionDataString && userDataString) {
        const session = JSON.parse(sessionDataString);
        const userData = JSON.parse(userDataString);
        
        if (isMountedRef.current) {
          setUserData(userData);
          setSessionData(session);
        }
        
        // Generate or get device ID
        let currentDeviceId;
        if (Platform.OS === 'android') {
          currentDeviceId = Application.androidId || `android-${Date.now()}`;
        } else {
          const storedId = await AsyncStorage.getItem('@device_id');
          if (storedId) {
            currentDeviceId = storedId;
          } else {
            currentDeviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
            await AsyncStorage.setItem('@device_id', currentDeviceId);
          }
        }
        
        if (isMountedRef.current) {
          setDeviceId(currentDeviceId);
        }
        
        if (userPinString) {
          if (isMountedRef.current) {
            setUserPin(userPinString);
          }
        } else if (userData.pin) {
          if (isMountedRef.current) {
            setUserPin(userData.pin);
          }
          await AsyncStorage.setItem('@user_pin', userData.pin);
        }
        
        if (!session.deviceId || session.deviceId !== currentDeviceId) {
          session.deviceId = currentDeviceId;
          await AsyncStorage.setItem('@user_session', JSON.stringify(session));
        }
      } else {
        if (isMountedRef.current) {
          navigation.navigate('Login');
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      if (isMountedRef.current) {
        navigation.navigate('Login');
      }
    }
  };

  const checkCurrentMeetingStatus = async () => {
    try {
      const currentMeeting = await AsyncStorage.getItem('@current_meeting');
      
      if (currentMeeting) {
        const meetingData = JSON.parse(currentMeeting);
        
        // Get current device ID
        let currentDeviceId;
        if (Platform.OS === 'android') {
          currentDeviceId = Application.androidId || `android-${Date.now()}`;
        } else {
          const storedId = await AsyncStorage.getItem('@device_id');
          if (storedId) {
            currentDeviceId = storedId;
          } else {
            currentDeviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
            await AsyncStorage.setItem('@device_id', currentDeviceId);
          }
        }
        
        const meetingDeviceId = meetingData.deviceInfo?.deviceId || 
                                meetingData.deviceId || 
                                meetingData.deviceInfo?.deviceId;
        
        const userNationalId = userData?.nationalId;
        const meetingNationalId = meetingData.nationalId || meetingData.userId;
        
        if (meetingDeviceId && meetingDeviceId !== currentDeviceId) {
          await AsyncStorage.removeItem('@current_meeting');
          if (isMountedRef.current) {
            setMeetingStatus('idle');
          }
          return;
        }
        
        if (userNationalId && meetingNationalId && userNationalId !== meetingNationalId) {
          await AsyncStorage.removeItem('@current_meeting');
          if (isMountedRef.current) {
            setMeetingStatus('idle');
          }
          return;
        }
        
        const checkInTime = new Date(meetingData.checkInTime);
        const now = new Date();
        const hoursDifference = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursDifference > 24) {
          await AsyncStorage.removeItem('@current_meeting');
          if (isMountedRef.current) {
            setMeetingStatus('idle');
          }
          return;
        }
        
        if (isMountedRef.current) {
          setMeetingStatus('checked-in');
          setCheckInTime(meetingData.checkInTime);
          setLocation(meetingData.location);
        }
        
        if (meetingData.userPin) {
          if (isMountedRef.current) {
            setUserPin(meetingData.userPin);
          }
        }
      } else {
        if (isMountedRef.current) {
          setMeetingStatus('idle');
        }
      }
    } catch (error) {
      console.error('Error checking meeting status:', error);
      if (isMountedRef.current) {
        setMeetingStatus('idle');
      }
    }
  };

  const getCurrentLocation = async (): Promise<any> => {
    locationAttemptsRef.current++;
    
    if (location && 
        Date.now() - location.timestamp < 60000 && 
        location.accuracy < 100) {
      return location;
    }

    const strategy = locationAttemptsRef.current > 1 ? 'high' : 'balanced';
    
    const config = {
      accuracy: strategy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: strategy === 'high' ? 15000 : 10000,
    };

    try {
      const position = await Location.getCurrentPositionAsync(config);
      
      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
        recordedAt: new Date().toISOString(),
        milliseconds: Date.now(),
        source: 'fresh-' + strategy,
      };
      
      locationAttemptsRef.current = 0;
      return locationData;
    } catch (error: any) {
      let errorMessage = 'Unable to get location';
      if (error.code === 'E_LOCATION_PERMISSION_DENIED') {
        errorMessage = 'Location permission denied';
      } else if (error.code === 'E_LOCATION_SERVICES_DISABLED') {
        errorMessage = 'Location unavailable';
      } else if (error.code === 'E_LOCATION_TIMEOUT') {
        if (locationAttemptsRef.current < 3) {
          // Retry after delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          return getCurrentLocation();
        }
        errorMessage = 'Location request timed out';
      }
      
      throw new Error(errorMessage);
    }
  };

  const handleCheckIn = async () => {
    locationAttemptsRef.current = 0;
    
    try {
      const currentMeeting = await AsyncStorage.getItem('@current_meeting');
      if (currentMeeting) {
        const meetingData = JSON.parse(currentMeeting);
        
        // Get current device ID
        let currentDeviceId;
        if (Platform.OS === 'android') {
          currentDeviceId = Application.androidId || `android-${Date.now()}`;
        } else {
          const storedId = await AsyncStorage.getItem('@device_id');
          if (storedId) {
            currentDeviceId = storedId;
          } else {
            currentDeviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
            await AsyncStorage.setItem('@device_id', currentDeviceId);
          }
        }
        
        if (meetingData.deviceInfo?.deviceId === currentDeviceId) {
          Alert.alert(
            'Already Checked In',
            'You are already checked into a meeting. Please check out first.',
            [
              { 
                text: 'Check Out', 
                onPress: () => handleCheckOut()
              },
              { 
                text: 'Cancel', 
                style: 'cancel' 
              }
            ]
          );
          return;
        }
      }
    } catch (error) {
      // Silent
    }

    if (!hasLocationPermission) {
      Alert.alert(
        'Location Required',
        'Location permission is required for check-in.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable Location', onPress: requestLocationPermission }
        ]
      );
      return;
    }

    if (!isLocationEnabled) {
      Alert.alert(
        'Location Services Disabled',
        'Please enable location services on your device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => {
              if (Platform.OS === 'android') {
                Linking.openSettings();
              } else {
                Linking.openURL('app-settings:');
              }
            }
          }
        ]
      );
      return;
    }

    if (!userPin) {
      Alert.alert(
        'PIN Required',
        'User PIN is required for check-in. Please login again.',
        [
          { text: 'OK', onPress: () => navigation.navigate('Login') }
        ]
      );
      return;
    }

    if (isMountedRef.current) {
      setLoading(true);
    }

    let locationAcquired = false;
    let locationData: any = null;

    try {
      try {
        locationData = await getCurrentLocation();
        locationAcquired = true;
      } catch (error: any) {
        const continueWithoutLocation = await new Promise((resolve) => {
          Alert.alert(
            'Location Unavailable',
            `${error.message}. Continue check-in anyway?`,
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Continue', onPress: () => resolve(true) }
            ]
          );
        });

        if (!continueWithoutLocation) {
          if (isMountedRef.current) {
            setLoading(false);
          }
          return;
        }

        locationData = {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          recordedAt: new Date().toISOString(),
          milliseconds: Date.now(),
          note: 'Location unavailable at check-in',
        };
      }

      // Get device info
      let currentDeviceId;
      if (Platform.OS === 'android') {
        currentDeviceId = Application.androidId || `android-${Date.now()}`;
      } else {
        const storedId = await AsyncStorage.getItem('@device_id');
        if (storedId) {
          currentDeviceId = storedId;
        } else {
          currentDeviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
          await AsyncStorage.setItem('@device_id', currentDeviceId);
        }
      }

      const deviceInfo = {
        deviceId: currentDeviceId,
        deviceName: Device.deviceName || 'Unknown Device',
        deviceModel: Device.modelName || 'Unknown',
        deviceBrand: Device.brand || 'Unknown',
        systemVersion: Device.osVersion || 'Unknown',
        manufacturer: Device.manufacturer || 'Unknown',
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion || '1.0.0',
        buildNumber: Application.nativeBuildVersion || '1',
        timestamp: new Date().toISOString(),
        milliseconds: Date.now(),
        locationStatus: locationAcquired ? 'acquired' : 'unavailable',
      };

      const checkInData = {
        userId: userData?.nationalId,
        nationalId: userData?.nationalId,
        userName: userData?.name,
        userMobile: userData?.mobileNumber,
        userEmail: userData?.email,
        userOrganization: userData?.organization,
        pin: userPin,
        deviceInfo: deviceInfo,
        checkInTime: new Date().toISOString(),
        checkInTimestamp: Date.now(),
        location: locationData,
        locationAcquired: locationAcquired,
      };

      const response = await checkInMeeting(checkInData);

      if (response.success) {
        const meetingData = {
          ...checkInData,
          meetingId: response.attendanceId || response.data?.attendanceId || `local-${Date.now()}`,
          backendConfirmed: true,
          attendanceData: response.data,
          locationDetails: response.locationDetails,
        };
        
        await AsyncStorage.setItem('@current_meeting', JSON.stringify(meetingData));

        if (isMountedRef.current) {
          setMeetingStatus('checked-in');
          setCheckInTime(meetingData.checkInTime);
          setLocation(locationData);
        }

        Alert.alert(
          'Check-in Successful',
          'Your attendance has been recorded.',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(response.message || 'Check-in failed');
      }

    } catch (error: any) {
      if (error.message && error.message.includes('already checked in')) {
        if (isMountedRef.current) {
          setMeetingStatus('checked-in');
        }
        Alert.alert(
          'Already Checked In',
          'You are already checked into a meeting. Please use the check-out button.',
          [{ text: 'OK' }]
        );
      } else if (error.message && error.message.includes('Device is already checked in')) {
        Alert.alert(
          'Device Already Checked In',
          'Device already checked in, first check out to proceed!',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Check-in Failed', error.message || 'Failed to check in. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleCheckOut = async () => {
    if (isMountedRef.current) {
      setLoading(true);
    }
    
    try {
      const currentMeeting = await AsyncStorage.getItem('@current_meeting');
      
      // Get device ID
      let currentDeviceId;
      if (Platform.OS === 'android') {
        currentDeviceId = Application.androidId || `android-${Date.now()}`;
      } else {
        const storedId = await AsyncStorage.getItem('@device_id');
        if (storedId) {
          currentDeviceId = storedId;
        } else {
          currentDeviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
          await AsyncStorage.setItem('@device_id', currentDeviceId);
        }
      }

      const checkOutData: any = {
        nationalId: userData?.nationalId,
        pin: userPin,
        deviceId: currentDeviceId,
      };

      let locationData;
      try {
        locationData = await getCurrentLocation();
        checkOutData.location = locationData;
      } catch (error) {
        locationData = {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          recordedAt: new Date().toISOString(),
          milliseconds: Date.now(),
          note: 'Location unavailable at check-out',
        };
        checkOutData.location = locationData;
      }

      if (currentMeeting) {
        const meetingData = JSON.parse(currentMeeting);
        checkOutData.meetingId = meetingData.meetingId;
        
        const checkInTime = new Date(meetingData.checkInTime);
        const checkOutTime = new Date();
        const durationMs = checkOutTime.getTime() - checkInTime.getTime();
        const durationMinutes = Math.round(durationMs / 1000 / 60);
        const durationText = durationMinutes >= 60 
          ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
          : `${durationMinutes}m`;

        const response = await checkOutMeeting(checkOutData);

        if (response.success) {
          await AsyncStorage.removeItem('@current_meeting');

          if (isMountedRef.current) {
            setMeetingStatus('idle');
            setCheckInTime('');
            setLocation(null);
          }

          Alert.alert(
            'Check-out Successful',
            `Meeting Duration: ${durationText}`,
            [{ text: 'OK' }]
          );
        } else {
          throw new Error(response.message || 'Check-out failed');
        }
      } else {
        checkOutData.force = true;
        
        const response = await checkOutMeeting(checkOutData);

        if (response.success) {
          await AsyncStorage.removeItem('@current_meeting');
          
          if (isMountedRef.current) {
            setMeetingStatus('idle');
            setCheckInTime('');
            setLocation(null);
          }

          Alert.alert(
            'Force Check-out Successful',
            'You have been checked out from any active meeting.',
            [{ text: 'OK' }]
          );
        } else {
          throw new Error(response.message || 'Force check-out failed');
        }
      }

    } catch (error: any) {
      if (error.message.includes('No check-in found')) {
        Alert.alert('Not Checked In', 'You are not currently checked into any meeting.');
        await AsyncStorage.removeItem('@current_meeting');
        if (isMountedRef.current) {
          setMeetingStatus('idle');
        }
      } else {
        Alert.alert('Check-out Failed', error.message || 'Failed to check out. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(['@user_session', '@user_data', '@user_pin']);
              navigation.navigate('Login');
            } catch (error) {
              navigation.navigate('Login');
            }
          }
        }
      ]
    );
  };

  const refreshLocation = async () => {
    if (isMountedRef.current) {
      setLocationLoading(true);
    }
    getQuickLocation();
  };

  const openLocationSettings = () => {
    Linking.openSettings();
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#2c3e50" barStyle="light-content" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Meeting Dashboard</Text>
          <Text style={styles.headerSubtitle}>{userData?.name || 'User'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.userInfoCard}>
          <Text style={styles.userInfoTitle}>User Information</Text>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>Name:</Text>
            <Text style={styles.userInfoValue}>{userData?.name || 'N/A'}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>National ID:</Text>
            <Text style={styles.userInfoValue}>{userData?.nationalId || 'N/A'}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>Mobile:</Text>
            <Text style={styles.userInfoValue}>{userData?.mobileNumber || 'N/A'}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>Email:</Text>
            <Text style={styles.userInfoValue}>{userData?.email || 'N/A'}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>Organization:</Text>
            <Text style={styles.userInfoValue}>{userData?.organization || 'N/A'}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>Device ID:</Text>
            <Text style={styles.deviceIdValue}>{deviceId.substring(0, 8)}...</Text>
          </View>
        </View>

        <View style={styles.meetingStatusCard}>
          <Text style={styles.meetingStatusTitle}>Meeting Status</Text>
          <View style={[
            styles.statusIndicator,
            meetingStatus === 'checked-in' ? styles.statusActive : styles.statusIdle
          ]}>
            <Text style={styles.statusText}>
              {meetingStatus === 'checked-in' ? 'IN MEETING' : 'READY FOR MEETING'}
            </Text>
          </View>
          
          {meetingStatus === 'checked-in' && (
            <View style={styles.meetingDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Checked In:</Text>
                <Text style={styles.detailValue}>
                  {checkInTime ? new Date(checkInTime).toLocaleTimeString() : 'Previously'}
                </Text>
              </View>
              {checkInTime && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duration:</Text>
                  <Text style={styles.detailValue}>
                    {`${Math.round((Date.now() - new Date(checkInTime).getTime()) / 1000 / 60)} minutes`}
                  </Text>
                </View>
              )}
              {location && location.latitude !== 0 && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>GPS Coordinates:</Text>
                    <Text style={styles.coordinateValue}>
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </Text>
                  </View>
                  {location.accuracy && location.accuracy > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>GPS Accuracy:</Text>
                      <Text style={styles.detailValue}>
                        ±{Math.round(location.accuracy)} meters
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>

        <View style={styles.locationStatusCard}>
          <Text style={styles.locationStatusTitle}>Current Location Status</Text>
          <View style={styles.locationStatusRow}>
            <View style={[
              styles.locationStatusDot,
              hasLocationPermission && isLocationEnabled ? styles.locationGood : styles.locationBad
            ]}>
              <Text style={styles.locationStatusDotText}>
                {hasLocationPermission && isLocationEnabled ? '✓' : '!'}
              </Text>
            </View>
            <Text style={styles.locationStatusText}>
              {hasLocationPermission 
                ? (isLocationEnabled 
                  ? 'Location services enabled' 
                  : 'Location services disabled')
                : 'Location permission required'}
            </Text>
          </View>
          
          {location && location.latitude !== 0 && (
            <View style={styles.locationDetails}>
              <Text style={styles.locationDetailTitle}>📍 Current Location Details:</Text>
              <View style={styles.locationDetailItem}>
                <Text style={styles.locationDetailLabel}>Coordinates:</Text>
                <Text style={styles.locationDetailValue}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Text>
              </View>
              {location.accuracy && location.accuracy > 0 && (
                <View style={styles.locationDetailItem}>
                  <Text style={styles.locationDetailLabel}>GPS Accuracy:</Text>
                  <Text style={styles.locationDetailValue}>
                    ±{Math.round(location.accuracy)} meters
                  </Text>
                </View>
              )}
            </View>
          )}
          
          <View style={styles.locationActions}>
            <TouchableOpacity 
              style={styles.locationActionButton}
              onPress={refreshLocation}
              disabled={locationLoading}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color="#3498db" />
              ) : (
                <Text style={styles.locationActionText}>Refresh Location</Text>
              )}
            </TouchableOpacity>
            
            {(!hasLocationPermission || !isLocationEnabled) && (
              <TouchableOpacity 
                style={[styles.locationActionButton, styles.locationSettingsButton]}
                onPress={openLocationSettings}
              >
                <Text style={styles.locationActionText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.checkInButton,
              (meetingStatus === 'checked-in' || loading || !userPin) && styles.buttonDisabled
            ]}
            onPress={handleCheckIn}
            disabled={meetingStatus === 'checked-in' || loading || !userPin}
          >
            {loading && meetingStatus !== 'checked-in' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.actionButtonText}>📝 Check In to Meeting</Text>
                <Text style={styles.actionButtonSubtext}>
                  Record attendance with location data
                </Text>
                {meetingStatus === 'checked-in' && (
                  <Text style={styles.statusIndicatorText}>Already checked in</Text>
                )}
                {!userPin && (
                  <Text style={styles.statusIndicatorText}>PIN required</Text>
                )}
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.checkOutButton,
              (loading || !userPin) && styles.buttonDisabled
            ]}
            onPress={handleCheckOut}
            disabled={loading || !userPin}
          >
            {loading && meetingStatus === 'checked-in' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.actionButtonText}>
                  {meetingStatus === 'checked-in' ? '🚪 Check Out of Meeting' : '🚪 Force Check Out'}
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  {meetingStatus === 'checked-in' 
                    ? 'Complete attendance' 
                    : 'Check out from any active meeting'}
                </Text>
                {!userPin && (
                  <Text style={styles.statusIndicatorText}>PIN required</Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>📋 How It Works:</Text>
          <Text style={styles.instruction}>1. <Text style={styles.bold}>Check In</Text> when meeting starts</Text>
          <Text style={styles.instruction}>2. <Text style={styles.bold}>Check Out</Text> when meeting ends</Text>
          <Text style={styles.instructionNote}>
            <Text style={styles.bold}>Press Back Button:</Text> Press back to go to previous screen
          </Text>
          <Text style={styles.instructionNote}>
            <Text style={styles.bold}>Double Tap Back:</Text> Quickly press back twice to exit app
          </Text>
        </View>

        <View style={styles.connectionStatus}>
          <View style={styles.connectionDot} />
          <Text style={styles.connectionText}>Connected</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#bdc3c7',
    fontSize: 14,
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  userInfoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userInfoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 20,
  },
  userInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  userInfoLabel: {
    fontSize: 15,
    color: '#7f8c8d',
    flex: 1,
  },
  userInfoValue: {
    fontSize: 15,
    color: '#2c3e50',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  deviceIdValue: {
    fontSize: 13,
    color: '#95a5a6',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  meetingStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  meetingStatusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 20,
  },
  statusIndicator: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusActive: {
    backgroundColor: '#27ae60',
  },
  statusIdle: {
    backgroundColor: '#3498db',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  meetingDetails: {
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    paddingTop: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  coordinateValue: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  locationStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 16,
  },
  locationStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationStatusDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationGood: {
    backgroundColor: '#27ae60',
  },
  locationBad: {
    backgroundColor: '#e74c3c',
  },
  locationStatusDotText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  locationStatusText: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '600',
  },
  locationDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  locationDetailTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  locationDetailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationDetailLabel: {
    fontSize: 13,
    color: '#7f8c8d',
    flex: 1,
  },
  locationDetailValue: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  locationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locationActionButton: {
    flex: 1,
    backgroundColor: '#3498db',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginRight: 10,
  },
  locationSettingsButton: {
    backgroundColor: '#95a5a6',
    marginRight: 0,
  },
  locationActionText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionsContainer: {
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  checkInButton: {
    borderLeftWidth: 6,
    borderLeftColor: '#27ae60',
  },
  checkOutButton: {
    borderLeftWidth: 6,
    borderLeftColor: '#e74c3c',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  actionButtonSubtext: {
    fontSize: 13,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 18,
  },
  statusIndicatorText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  instructions: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  instruction: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 8,
    lineHeight: 18,
  },
  instructionNote: {
    fontSize: 12,
    color: '#3498db',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
  bold: {
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#e8f6f3',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27ae60',
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#27ae60',
    marginRight: 10,
  },
  connectionText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
  },
});

export default MeetingDashboard;