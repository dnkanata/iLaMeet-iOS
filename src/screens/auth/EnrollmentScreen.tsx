// src/screens/auth/EnrollmentScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  BackHandler,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { enrollUser, checkUserExists } from '../../services/api';

const EnrollmentScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [location, setLocation] = useState<any>(null);
  const [timezone, setTimezone] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    nationalId: '',
    mobileNumber: '',
    email: '',
    organization: '',
    pin: '',
    confirmPin: '',
  });

  // Handle back button
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          'Exit Enrollment',
          'Are you sure you want to cancel enrollment?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', onPress: () => navigation.goBack() }
          ]
        );
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [navigation])
  );

  // Request location permission
  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Check if user already exists
  useEffect(() => {
    const checkExistingUser = async () => {
      const nationalId = formData.nationalId.trim();
      if (nationalId.length >= 5) {
        setCheckingUser(true);
        try {
          const result = await checkUserExists(nationalId);
          if (result.exists) {
            Alert.alert(
              'User Already Exists',
              'This National ID/Passport is already registered. Please use login instead.',
              [
                { 
                  text: 'Go to Login', 
                  onPress: () => navigation.navigate('Login')
                },
                { 
                  text: 'Cancel', 
                  style: 'cancel' 
                }
              ]
            );
          }
        } catch (error) {
          // Silent error
        } finally {
          setCheckingUser(false);
        }
      }
    };

    const timeoutId = setTimeout(checkExistingUser, 1000);
    return () => clearTimeout(timeoutId);
  }, [formData.nationalId]);

  const requestLocationPermission = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setLocationGranted(true);
        getCurrentLocation();
      } else {
        setLocationGranted(false);
        Alert.alert(
          'Location Permission Required',
          'This app needs access to your location for accurate meeting attendance.',
          [
            { text: 'Cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (error) {
      setLocationGranted(false);
    }
  };

  const getCurrentLocation = async () => {
    if (!locationGranted) return;

    setGettingLocation(true);
    
    try {
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 10000
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
        source: 'expo-gps',
        recordedAt: new Date().toISOString(),
      };
      
      setLocation(locationData);
      
      // Get timezone
      try {
        const timezoneResponse = await fetch(
          `https://api.timezonedb.com/v2.1/get-time-zone?key=DPBCSBQY5OB3&format=json&by=position&lat=${location.coords.latitude}&lng=${location.coords.longitude}`
        );
        const timezoneData = await timezoneResponse.json();
        if (timezoneData.status === 'OK') {
          setTimezone(timezoneData.zoneName || 'UTC');
        } else {
          setTimezone('UTC');
        }
      } catch (error) {
        setTimezone('UTC');
      }
      
    } catch (error) {
      const fallbackLocation = {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        recordedAt: new Date().toISOString(),
        source: 'fallback',
        note: 'Location unavailable during enrollment'
      };
      setLocation(fallbackLocation);
      setTimezone('UTC');
    } finally {
      setGettingLocation(false);
    }
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.name.trim()) {
      errors.push('Please enter your full name');
    }
    
    if (!formData.nationalId.trim()) {
      errors.push('Please enter your National ID/Passport');
    }
    
    if (!formData.mobileNumber.trim()) {
      errors.push('Please enter your mobile number');
    } else {
      const cleanMobile = formData.mobileNumber.replace(/\D/g, '');
      if (cleanMobile.length < 10 || cleanMobile.length > 15) {
        errors.push('Mobile number must be 10-15 digits');
      }
    }
    
    if (!formData.email.trim()) {
      errors.push('Please enter your email address');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errors.push('Please enter a valid email address');
      }
    }
    
    if (!formData.organization.trim()) {
      errors.push('Please enter your organization');
    }
    
    if (!formData.pin || formData.pin.length !== 4) {
      errors.push('PIN must be exactly 4 digits');
    } else if (!/^\d+$/.test(formData.pin)) {
      errors.push('PIN must contain only numbers');
    }
    
    if (formData.pin !== formData.confirmPin) {
      errors.push('PINs do not match');
    }

    if (errors.length > 0) {
      Alert.alert('Validation Error', errors.join('\n• '));
      return false;
    }

    return true;
  };

  const handleEnroll = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      // Get device info
      let deviceId;
      if (Platform.OS === 'android') {
        deviceId = Application.androidId || `android-${Date.now()}`;
      } else {
        // iOS: create persistent ID
        const storedId = await AsyncStorage.getItem('@device_id');
        if (storedId) {
          deviceId = storedId;
        } else {
          deviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
          await AsyncStorage.setItem('@device_id', deviceId);
        }
      }

      // Get location
      let locationData = null;
      try {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeout: 10000
        });
        
        locationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
          recordedAt: new Date().toISOString(),
          source: 'expo-enrollment'
        };
      } catch (error) {
        locationData = {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          recordedAt: new Date().toISOString(),
          source: 'fallback',
          note: 'Location unavailable'
        };
      }

      // Prepare enrollment data
      const enrollmentData = {
        name: formData.name.trim(),
        nationalId: formData.nationalId.trim(),
        mobile: formData.mobileNumber.trim().replace(/\D/g, ''),
        email: formData.email.trim().toLowerCase(),
        organization: formData.organization.trim(),
        pin: formData.pin,
        location: locationData,
        deviceInfo: {
          deviceId,
          deviceName: Device.deviceName || 'Unknown Device',
          deviceModel: Device.modelName || 'Unknown',
          deviceBrand: Device.brand || 'Unknown',
          systemVersion: Device.osVersion || 'Unknown',
          platform: Platform.OS,
          appVersion: Application.nativeApplicationVersion || '1.0.0',
          timestamp: new Date().toISOString(),
        }
      };

      const response = await enrollUser(enrollmentData);

      if (response.success) {
        // Save user data
        const userData = {
          name: enrollmentData.name,
          nationalId: enrollmentData.nationalId,
          mobileNumber: enrollmentData.mobile,
          email: enrollmentData.email,
          organization: enrollmentData.organization,
          pin: enrollmentData.pin,
          enrolledAt: new Date().toISOString(),
          deviceId: deviceId,
          userId: response.data?.id || `user-${Date.now()}`
        };
        
        await AsyncStorage.setItem('@user_pin', enrollmentData.pin);
        await AsyncStorage.setItem('@user_data', JSON.stringify(userData));
        await AsyncStorage.setItem('@first_launch', 'false');

        Alert.alert(
          'Enrollment Successful!',
          'Your account has been created successfully.',
          [
            { 
              text: 'Continue', 
              onPress: () => {
                setFormData({
                  name: '', nationalId: '', mobileNumber: '',
                  email: '', organization: '', pin: '', confirmPin: '',
                });
                navigation.navigate('MeetingDashboard');
              }
            }
          ]
        );
      } else {
        throw new Error(response.message || 'Enrollment failed');
      }

    } catch (error: any) {
      Alert.alert('Enrollment Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (label: string, value: string, onChangeText: (text: string) => void, options: any = {}) => {
    const {
      placeholder = '',
      keyboardType = 'default',
      secureTextEntry = false,
      maxLength,
      autoCapitalize = 'none',
      editable = true,
    } = options;

    return (
      <View style={styles.inputContainer}>
        <Text style={styles.label}>
          {label}
          {options.required && <Text style={styles.required}> *</Text>}
        </Text>
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled]}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          editable={editable && !loading}
          placeholderTextColor="#95a5a6"
        />
      </View>
    );
  };

  const refreshLocation = () => {
    if (locationGranted) {
      getCurrentLocation();
    } else {
      requestLocationPermission();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#2c3e50" barStyle="light-content" />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>👤</Text>
            </View>
            <Text style={styles.title}>User Enrollment</Text>
            <Text style={styles.subtitle}>
              Register for meeting attendance tracking
            </Text>
          </View>

          {/* Status Indicators */}
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                locationGranted ? styles.statusSuccess : styles.statusWarning
              ]}>
                <Text style={styles.statusDotText}>
                  {locationGranted ? '✓' : '!'}
                </Text>
              </View>
              <Text style={styles.statusText}>
                {locationGranted ? 'Location access granted' : 'Location permission needed'}
              </Text>
            </View>
            
            {gettingLocation && (
              <View style={styles.locationLoading}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.locationLoadingText}>Getting your location...</Text>
              </View>
            )}
            
            {location && (
              <View style={styles.locationInfo}>
                <Text style={styles.locationInfoText}>
                  📍 Location: {location.latitude !== 0 ? 
                    'Acquired' : 'Not available'}
                </Text>
                {location.latitude !== 0 && (
                  <Text style={styles.locationInfoText}>
                    Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </Text>
                )}
                {timezone && (
                  <Text style={styles.locationInfoText}>
                    🕐 Timezone: {timezone}
                  </Text>
                )}
              </View>
            )}
            
            <TouchableOpacity 
              style={styles.locationActionButton}
              onPress={refreshLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#3498db" />
              ) : (
                <Text style={styles.locationActionText}>Refresh Location</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {renderInput('Full Name', formData.name, (text) => 
              setFormData({...formData, name: text}),
              {
                placeholder: 'Enter your full name',
                autoCapitalize: 'words',
                required: true
              }
            )}

            {renderInput('National ID / Passport', formData.nationalId, (text) => 
              setFormData({...formData, nationalId: text}),
              {
                placeholder: 'Enter National ID or Passport number',
                autoCapitalize: 'characters',
                required: true,
                maxLength: 50
              }
            )}

            {checkingUser && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.checkingText}>Checking if user exists...</Text>
              </View>
            )}

            {renderInput('Mobile Number', formData.mobileNumber, (text) => 
              setFormData({...formData, mobileNumber: text.replace(/\D/g, '')}),
              {
                placeholder: 'e.g., 0712 345 678',
                keyboardType: 'phone-pad',
                required: true,
                maxLength: 15
              }
            )}

            {renderInput('Email Address', formData.email, (text) => 
              setFormData({...formData, email: text}),
              {
                placeholder: 'Enter your email address',
                keyboardType: 'email-address',
                required: true,
                autoCapitalize: 'none'
              }
            )}

            {renderInput('Organization', formData.organization, (text) => 
              setFormData({...formData, organization: text}),
              {
                placeholder: 'Enter your organization/company',
                autoCapitalize: 'words',
                required: true
              }
            )}

            {renderInput('Create 4-digit PIN', formData.pin, (text) => 
              setFormData({...formData, pin: text.replace(/\D/g, '').substring(0, 4)}),
              {
                placeholder: 'Enter 4-digit PIN',
                keyboardType: 'number-pad',
                secureTextEntry: true,
                required: true,
                maxLength: 4
              }
            )}

            {renderInput('Confirm PIN', formData.confirmPin, (text) => 
              setFormData({...formData, confirmPin: text.replace(/\D/g, '').substring(0, 4)}),
              {
                placeholder: 'Confirm your 4-digit PIN',
                keyboardType: 'number-pad',
                secureTextEntry: true,
                required: true,
                maxLength: 4
              }
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.enrollButton, loading && styles.buttonDisabled]}
              onPress={handleEnroll}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.enrollButtonText}>Enroll Now</Text>
                  <Text style={styles.enrollButtonSubtext}>
                    Create your attendance account
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Keep all your existing styles (they should work as-is)
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  logo: {
    fontSize: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 25,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusSuccess: {
    backgroundColor: '#27ae60',
  },
  statusWarning: {
    backgroundColor: '#f39c12',
  },
  statusDotText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusText: {
    fontSize: 15,
    color: '#2c3e50',
    fontWeight: '600',
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingLeft: 36,
  },
  locationLoadingText: {
    fontSize: 14,
    color: '#3498db',
    marginLeft: 10,
  },
  locationInfo: {
    backgroundColor: '#e8f4fc',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  locationInfoText: {
    fontSize: 13,
    color: '#2c3e50',
    marginBottom: 4,
  },
  locationActionButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  locationActionText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  form: {
    width: '100%',
    marginBottom: 25,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  required: {
    color: '#e74c3c',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dfe6e9',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2c3e50',
  },
  inputDisabled: {
    backgroundColor: '#f8f9fa',
    borderColor: '#e0e0e0',
    color: '#95a5a6',
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  checkingText: {
    fontSize: 14,
    color: '#3498db',
    marginLeft: 10,
  },
  actionsContainer: {
    marginBottom: 30,
  },
  enrollButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#95a5a6',
  },
  enrollButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  enrollButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
});

export default EnrollmentScreen;