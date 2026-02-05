// src/screens/auth/LoginScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import { loginUser, requestPinReset } from '../../services/api';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState({
    nationalId: '',
    pin: '',
  });
  
  // Add cleanup ref to prevent state updates after unmounting
  const isMountedRef = useRef(true);
  const [location, setLocation] = useState<any>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setHasLocationPermission(status === 'granted');
    } catch (error) {
      setHasLocationPermission(false);
    }
  };

  const getCurrentLocation = async (): Promise<any> => {
    if (!isMountedRef.current) {
      throw new Error('Component unmounted');
    }

    setGettingLocation(true);
    
    try {
      // Request permission if not granted
      if (!hasLocationPermission) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Location permission denied');
        }
        setHasLocationPermission(true);
      }

      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
      });
      
      const locationResponse = {
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
        accuracy: locationData.coords.accuracy,
        altitude: locationData.coords.altitude,
        altitudeAccuracy: locationData.coords.altitudeAccuracy,
        heading: locationData.coords.heading,
        speed: locationData.coords.speed,
        timestamp: locationData.timestamp,
        source: 'expo-gps',
        recordedAt: new Date().toISOString(),
        milliseconds: Date.now(),
      };
      
      if (isMountedRef.current) {
        setLocation(locationResponse);
      }
      return locationResponse;
    } catch (error: any) {
      let errorMessage = 'Unable to get location';
      if (error.code === 'E_LOCATION_PERMISSION_DENIED') {
        errorMessage = 'Location permission denied';
      } else if (error.code === 'E_LOCATION_SERVICES_DISABLED') {
        errorMessage = 'Location services disabled';
      } else if (error.code === 'E_LOCATION_TIMEOUT') {
        errorMessage = 'Location request timed out';
      }
      
      console.log('Location error:', errorMessage);
      
      // Create fallback location
      const fallbackLocation = {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        recordedAt: new Date().toISOString(),
        source: 'fallback',
        note: errorMessage,
        milliseconds: Date.now(),
      };
      
      if (isMountedRef.current) {
        setLocation(fallbackLocation);
      }
      return fallbackLocation;
    } finally {
      if (isMountedRef.current) {
        setGettingLocation(false);
      }
    }
  };

  const handleLogin = async () => {
    // Validation
    if (!credentials.nationalId.trim()) {
      Alert.alert('Error', 'Please enter your National ID/Passport');
      return;
    }
    
    if (!credentials.pin || credentials.pin.length !== 4) {
      Alert.alert('Error', 'Please enter your 4-digit PIN');
      return;
    }

    if (!/^\d+$/.test(credentials.pin)) {
      Alert.alert('Error', 'PIN must contain only numbers');
      return;
    }

    // Safe state update
    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      // Get device info using Expo packages
      let deviceId;
      if (Platform.OS === 'android') {
        deviceId = Application.androidId || `android-${Date.now()}`;
      } else {
        const storedId = await AsyncStorage.getItem('@device_id');
        if (storedId) {
          deviceId = storedId;
        } else {
          deviceId = `ios-${Device.modelId || 'device'}-${Date.now()}`;
          await AsyncStorage.setItem('@device_id', deviceId);
        }
      }

      const deviceName = Device.deviceName || 'Unknown Device';
      
      // Prepare login/verify data
      const loginData = {
        nationalId: credentials.nationalId.trim(),
        pin: credentials.pin,
        deviceInfo: {
          deviceId,
          deviceName: typeof deviceName === 'string' ? deviceName : 'Unknown Device',
          deviceModel: Device.modelName || 'Unknown',
          deviceBrand: Device.brand || 'Unknown',
          systemVersion: Device.osVersion || 'Unknown',
          platform: Platform.OS,
          timestamp: new Date().toISOString(),
        },
      };

      console.log('🔐 Login attempt for:', loginData.nationalId);
      console.log('📤 Sending verification request...');

      // Call backend API for verification
      const response = await loginUser(loginData);

      if (response.success && response.user) {
        // SUCCESS: User verified
        console.log('✅ User verified successfully:', response.user.name);
        
        // Get user data from response
        const userData = {
          nationalId: credentials.nationalId.trim(),
          name: response.user.name || 'User',
          mobileNumber: response.user.mobileNumber || '',
          email: response.user.email || '',
          organization: response.user.organization || '',
          pin: credentials.pin, // Store PIN temporarily
          userId: response.user.userId || credentials.nationalId.trim()
        };

        // SAVE PIN SEPARATELY - CRITICAL FOR CHECK-IN/OUT
        try {
          await AsyncStorage.setItem('@user_pin', credentials.pin);
          console.log('🔐 PIN saved to storage');
          
          // Verify PIN was saved
          const savedPin = await AsyncStorage.getItem('@user_pin');
          if (!savedPin || savedPin !== credentials.pin) {
            throw new Error('PIN storage verification failed');
          }
          console.log('✅ PIN storage verified');
        } catch (pinError) {
          console.error('❌ PIN storage error:', pinError);
          if (isMountedRef.current) {
            Alert.alert(
              'Security Error',
              'Failed to save PIN securely. Please try login again.',
              [{ text: 'OK', onPress: () => {
                if (isMountedRef.current) setLoading(false);
              }}]
            );
          }
          return;
        }

        // Save user data locally (without PIN for security)
        const userDataWithoutPin = {
          nationalId: userData.nationalId,
          name: userData.name,
          mobileNumber: userData.mobileNumber,
          email: userData.email,
          organization: userData.organization,
          userId: userData.userId
        };
        
        await AsyncStorage.setItem('@user_data', JSON.stringify(userDataWithoutPin));
        console.log('✅ User data saved with email and organization');

        // Create session
        const sessionData = {
          nationalId: userData.nationalId,
          name: userData.name,
          mobileNumber: userData.mobileNumber,
          email: userData.email,
          organization: userData.organization,
          isLoggedIn: true,
          loginTimestamp: new Date().toISOString(),
          deviceId: deviceId,
          userId: userData.userId,
          pinAvailable: true
        };
        
        await AsyncStorage.setItem('@user_session', JSON.stringify(sessionData));
        console.log('✅ Session created with email and organization');

        // Show success message
        Alert.alert(
          '✅ Login Successful',
          `Welcome back, ${userData.name}!`,
          [{ 
            text: 'Continue', 
            onPress: () => {
              checkAndNavigate();
            }
          }]
        );

      } else if (response.requiresPinReset) {
        // PIN reset required - user cannot login
        Alert.alert(
          '🔑 PIN Reset Required',
          response.message || 'Your PIN has been reset. Please click on set a new PIN.',
          [
            { 
              text: 'Reset PIN', 
              onPress: () => {
                if (isMountedRef.current) {
                  setLoading(false);
                  handleForgotPin();
                }
              }
            },
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                if (isMountedRef.current) setLoading(false);
              }
            }
          ]
        );
        return;

      } else if (response.verified === false) {
        // User not found in backend - check if exists locally
        const userDataString = await AsyncStorage.getItem('@user_data');
        const storedPin = await AsyncStorage.getItem('@user_pin');
        
        if (userDataString && storedPin) {
          const localUserData = JSON.parse(userDataString);
          
          if (localUserData.nationalId === credentials.nationalId.trim() && 
              storedPin === credentials.pin) {
            // Local login successful - but require internet for backend sync
            Alert.alert(
              '⚠️ Internet Required',
              'Internet connection is required to verify your credentials.',
              [
                { 
                  text: 'Continue Offline', 
                  onPress: async () => {
                    try {
                      // Save PIN again to ensure it's stored
                      await AsyncStorage.setItem('@user_pin', credentials.pin);
                      console.log('🔐 PIN saved for offline use');
                    } catch (error) {
                      console.error('Error saving PIN for offline:', error);
                    }
                    checkAndNavigate();
                  }
                },
                { 
                  text: 'Try Again', 
                  style: 'cancel',
                  onPress: () => {
                    if (isMountedRef.current) setLoading(false);
                  }
                }
              ]
            );
            return;
          } else {
            if (isMountedRef.current) {
              Alert.alert('❌ Login Failed', 'Invalid National ID or PIN.');
              setLoading(false);
            }
          }
        } else {
          Alert.alert(
            '❌ User Not Found',
            'No user found with these credentials. Would you like to enroll?',
            [
              { 
                text: 'Cancel', 
                style: 'cancel', 
                onPress: () => {
                  if (isMountedRef.current) setLoading(false);
                }
              },
              { 
                text: 'Enroll', 
                onPress: () => {
                  if (isMountedRef.current) {
                    setLoading(false);
                    navigation.navigate('Enrollment');
                  }
                }
              }
            ]
          );
        }
      } else {
        if (isMountedRef.current) {
          Alert.alert('❌ Login Failed', response.message || 'Invalid credentials.');
          setLoading(false);
        }
      }

    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      if (error.message && (error.message.includes('PIN reset required') || error.message.includes('requiresPinReset'))) {
        Alert.alert(
          '🔑 PIN Reset Required',
          'Your PIN has been reset. Please use the PIN reset process to set a new PIN.',
          [
            { 
              text: 'Reset PIN', 
              onPress: () => {
                if (isMountedRef.current) {
                  setLoading(false);
                  handleForgotPin();
                }
              }
            },
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                if (isMountedRef.current) setLoading(false);
              }
            }
          ]
        );
      } else if (error.message && (
          error.message.includes('User not found') || 
          error.message.includes('AuditLog.userId') ||
          error.message.includes('AuditLog') ||
          error.message.includes('userId')
      )) {
        Alert.alert(
          '❌ User Not Found',
          'Please enroll first to create an account.',
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                if (isMountedRef.current) setLoading(false);
              }
            },
            { 
              text: 'Enroll', 
              onPress: () => {
                if (isMountedRef.current) {
                  setLoading(false);
                  navigation.navigate('Enrollment');
                }
              }
            }
          ]
        );
      } else if (error.message && error.message.includes('Network Error')) {
        Alert.alert(
          '🌐 Internet Connection Required',
          'Unable to connect. Please check your internet connection and try again.',
          [
            { 
              text: 'Try Again', 
              onPress: handleLogin 
            },
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                if (isMountedRef.current) setLoading(false);
              }
            }
          ]
        );
      } else if (error.message && error.message.includes('Invalid PIN')) {
        Alert.alert(
          '❌ Invalid PIN',
          'The PIN you entered is incorrect. Please try again.',
          [
            { 
              text: 'OK', 
              onPress: () => {
                if (isMountedRef.current) {
                  setCredentials({...credentials, pin: ''});
                  setLoading(false);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(
          '❌ Login Failed', 
          error.message || 'Login failed. Please try again.',
          [{ 
            text: 'OK', 
            onPress: () => {
              if (isMountedRef.current) setLoading(false);
            }
          }]
        );
      }
      
    } finally {
      // Only update loading state if component is still mounted
      if (isMountedRef.current && loading) {
        // Loading state handled in specific cases
      }
    }
  };

  const checkAndNavigate = async () => {
    try {
      // Check locally if user has existing meeting
      const currentMeeting = await AsyncStorage.getItem('@current_meeting');
      
      if (currentMeeting) {
        Alert.alert(
          '📋 Resume Meeting',
          'You have an ongoing meeting session. Do you want to resume?',
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                if (isMountedRef.current) {
                  setLoading(false);
                  navigation.navigate('MeetingDashboard');
                }
              }
            },
            { 
              text: 'Resume', 
              onPress: () => {
                if (isMountedRef.current) {
                  setLoading(false);
                  navigation.navigate('MeetingDashboard');
                }
              }
            }
          ]
        );
      } else {
        // No active meeting, go to dashboard
        if (isMountedRef.current) {
          setLoading(false);
          navigation.navigate('MeetingDashboard');
        }
      }
    } catch (error) {
      console.error('Error checking meeting status:', error);
      if (isMountedRef.current) {
        setLoading(false);
        navigation.navigate('MeetingDashboard');
      }
    }
  };

  const handleEnrollmentNavigate = () => {
    Alert.alert(
      '📝 New Enrollment',
      'Are you a new user? You need to enroll first to create your account.',
      [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        { 
          text: 'Enroll Now', 
          onPress: () => navigation.navigate('Enrollment')
        }
      ]
    );
  };

  const handleForgotPin = async () => {
    if (!credentials.nationalId || credentials.nationalId.trim() === '') {
      Alert.alert('National ID Required', 'Please enter your National ID to request PIN reset.');
      return;
    }

    // Get current location for PIN reset
    if (isMountedRef.current) setLoading(true);
    
    try {
      const currentLocation = await getCurrentLocation();
      
      Alert.alert(
        '🔑 Reset PIN',
        `Do you want to reset PIN for National ID: ${credentials.nationalId}?\n\NO-Cancel YES-Reset.`,
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => {
              if (isMountedRef.current) setLoading(false);
            }
          },
          { 
            text: 'Reset PIN', 
            onPress: async () => {
              if (isMountedRef.current) setLoading(true);
              try {
                // Prepare PIN reset data with location
                const pinResetData = {
                  nationalId: credentials.nationalId.trim(),
                  location: currentLocation
                };

                console.log('📤 Sending PIN reset data:', {
                  nationalId: pinResetData.nationalId,
                  hasLocation: !!pinResetData.location,
                  locationSource: pinResetData.location?.source,
                  locationLat: pinResetData.location?.latitude,
                  locationLon: pinResetData.location?.longitude,
                  locationType: typeof pinResetData.location
                });

                const result = await requestPinReset(pinResetData);
                
                if (result.success) {
                  Alert.alert(
                    '✅ PIN Reset Request Sent',
                    result.message || 'An email has been sent to your registered email address. Please use the PIN reset process to set a new PIN.',
                    [
                      { 
                        text: 'Set New PIN', 
                        onPress: () => {
                          if (isMountedRef.current) {
                            setLoading(false);
                            // Navigate to update PIN screen
                            navigation.navigate('UpdatePin', { 
                              nationalId: credentials.nationalId.trim(),
                              location: currentLocation 
                            });
                          }
                        }
                      },
                      { 
                        text: 'OK', 
                        style: 'cancel',
                        onPress: () => {
                          if (isMountedRef.current) {
                            setCredentials({...credentials, pin: ''});
                            setLoading(false);
                          }
                        }
                      }
                    ]
                  );
                } else {
                  Alert.alert('❌ PIN Reset Failed', result.message || 'Failed to request PIN reset. Please try again.');
                  if (isMountedRef.current) setLoading(false);
                }
              } catch (error: any) {
                console.error('❌ PIN reset error:', error);
                Alert.alert('❌ Error', error.message || 'Failed to request PIN reset. Please try again.');
                if (isMountedRef.current) setLoading(false);
              }
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('❌ Location Error', error.message || 'Unable to get location. Please try again.');
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>🔐</Text>
          </View>
          <Text style={styles.title}>Meeting Attendance System</Text>
          <Text style={styles.subtitle}>Secure login for your meeting attendance</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>National ID / Passport</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your National ID or Passport"
              value={credentials.nationalId}
              onChangeText={(text) => setCredentials({...credentials, nationalId: text})}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
              placeholderTextColor="#95a5a6"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              4-digit PIN 
              <Text style={styles.labelHint}> (required for check-in/out)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your 4-digit PIN"
              value={credentials.pin}
              onChangeText={(text) => {
                const cleanedText = text.replace(/\D/g, '').substring(0, 4);
                setCredentials({...credentials, pin: cleanedText});
              }}
              keyboardType="number-pad"
              secureTextEntry
              editable={!loading}
              maxLength={4}
              placeholderTextColor="#95a5a6"
            />
            {credentials.pin.length === 4 && (
              <Text style={styles.pinHint}>✓ Ok</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Login to Meeting Dashboard</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linksContainer}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleEnrollmentNavigate}
            disabled={loading}
          >
            <Text style={styles.linkText}>
              👤 New user? Enroll here
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleForgotPin}
            disabled={loading || !credentials.nationalId.trim()}
          >
            <Text style={styles.linkTextSecondary}>
              🔑 Forgot PIN? Enter your NationalID/Passport above and click here
            </Text>
          </TouchableOpacity>
          
          {gettingLocation && (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color="#3498db" />
              <Text style={styles.locationLoadingText}>Getting location for PIN reset...</Text>
            </View>
          )}
          
          {location && location.latitude !== 0 && (
            <View style={styles.locationInfo}>
              <Text style={styles.locationInfoText}>
                📍 Location: {location.source === 'expo-gps' ? 'GPS acquired' : 'Fallback'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>📋 Important Information:</Text>
          <Text style={styles.instruction}>✅ Internet connection is required for all operations</Text>
          <Text style={styles.instruction}>📧 Email notifications are active</Text>
          <Text style={styles.instruction}>🆔 Use your registered National ID/Passport number</Text>
          <Text style={styles.instruction}>🔢 Enter your 4-digit PIN (required for check-in/out)</Text>
          <Text style={styles.instruction}>📱 Forgot PIN? Click "Reset Link" above</Text>
          <Text style={styles.instruction}>📍 PIN reset requires location for security</Text>
          <Text style={styles.instruction}>⚠️ After PIN reset, you must set a new PIN before logging in</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  labelHint: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#7f8c8d',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2c3e50',
  },
  pinHint: {
    fontSize: 12,
    color: '#27ae60',
    marginTop: 5,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#27ae60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#95a5a6',
    shadowOpacity: 0.1,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linksContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  linkButton: {
    padding: 12,
  },
  linkText: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  linkTextSecondary: {
    color: '#e74c3c',
    fontSize: 14,
    textDecorationLine: 'underline',
    marginTop: 8,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
  },
  locationLoadingText: {
    fontSize: 13,
    color: '#3498db',
    marginLeft: 10,
  },
  locationInfo: {
    backgroundColor: '#e8f4fc',
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  locationInfoText: {
    fontSize: 12,
    color: '#2c3e50',
    fontWeight: '500',
  },
  instructions: {
    marginTop: 40,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  instruction: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 6,
    lineHeight: 20,
  },
});

export default LoginScreen;