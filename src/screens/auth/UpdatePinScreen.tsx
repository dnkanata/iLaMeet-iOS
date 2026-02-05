// src/screens/auth/UpdatePinScreen.tsx
import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import { updateUserPin } from '../../services/api';

const UpdatePinScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { nationalId, location: routeLocation } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);

  useEffect(() => {
    // Get device info
    const getDeviceInfo = async () => {
      try {
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

        setDeviceInfo({
          deviceId,
          deviceName: Device.deviceName || 'Unknown Device',
          deviceModel: Device.modelName || 'Unknown',
          deviceBrand: Device.brand || 'Unknown',
          systemVersion: Device.osVersion || 'Unknown',
          platform: Platform.OS,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error getting device info:', error);
      }
    };

    getDeviceInfo();
    
    // Get current location if not provided in route
    if (!routeLocation) {
      getCurrentLocation();
    } else {
      setCurrentLocation(routeLocation);
    }
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const fallbackLocation = {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          recordedAt: new Date().toISOString(),
          source: 'fallback',
          note: 'Location permission denied'
        };
        setCurrentLocation(fallbackLocation);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
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
      setCurrentLocation(locationData);
    } catch (error) {
      console.log('Location error:', error);
      // Create fallback location
      const fallbackLocation = {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        recordedAt: new Date().toISOString(),
        source: 'fallback',
        note: 'Location unavailable during PIN update'
      };
      setCurrentLocation(fallbackLocation);
    }
  };

  const handlePinInput = (value: string, index: number, isConfirm = false) => {
    if (isConfirm) {
      const newConfirmPin = [...confirmPin];
      newConfirmPin[index] = value;
      setConfirmPin(newConfirmPin);
    } else {
      const newPin = [...pin];
      newPin[index] = value;
      setPin(newPin);
    }
  };

  const handleSubmit = async () => {
    const pinString = pin.join('');
    const confirmPinString = confirmPin.join('');

    if (pinString.length !== 4) {
      Alert.alert('Error', 'Please enter a 4-digit PIN');
      return;
    }

    if (!/^\d+$/.test(pinString)) {
      Alert.alert('Error', 'PIN must contain only numbers');
      return;
    }

    if (pinString !== confirmPinString) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }

    if (!nationalId) {
      Alert.alert('Error', 'National ID is required');
      return;
    }

    setLoading(true);

    try {
      // Prepare PIN update data with location and device info
      const updateData = {
        nationalId: nationalId.trim(),
        newPin: pinString,
        location: currentLocation,
        deviceInfo: deviceInfo
      };

      // Update PIN on server
      const result = await updateUserPin(updateData);
      
      if (result.success) {
        // Save PIN locally
        await AsyncStorage.setItem('@user_pin', pinString);
        
        Alert.alert(
          '✅ PIN Set Successfully',
          'Your PIN has been updated. You can now login and check in/out.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Clear PIN inputs
                setPin(['', '', '', '']);
                setConfirmPin(['', '', '', '']);
                // Navigate to login
                navigation.navigate('Login');
              }
            }
          ]
        );
      } else {
        Alert.alert('❌ Error', result.message || 'Failed to update PIN');
      }
    } catch (error: any) {
      Alert.alert('❌ Error', error.message || 'Failed to update PIN');
    } finally {
      setLoading(false);
    }
  };

  const PinInput = ({ value, index, isConfirm = false }: { value: string, index: number, isConfirm?: boolean }) => (
    <TextInput
      style={styles.pinInput}
      value={value}
      onChangeText={(text) => handlePinInput(text, index, isConfirm)}
      keyboardType="number-pad"
      maxLength={1}
      secureTextEntry
      editable={!loading}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>🔐 Set New PIN</Text>
          <Text style={styles.subtitle}>
            For National ID: {nationalId || 'Not provided'}
          </Text>
          <Text style={styles.instructions}>
            Please enter a new 4-digit PIN for your account
          </Text>
          
          {currentLocation && (
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>
                📍 Location recorded: {currentLocation.latitude !== 0 ? 
                  `Lat: ${currentLocation.latitude.toFixed(4)}, Lon: ${currentLocation.longitude.toFixed(4)}` : 
                  'Location not available'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          <View style={styles.pinSection}>
            <Text style={styles.label}>New PIN</Text>
            <View style={styles.pinContainer}>
              {pin.map((digit, index) => (
                <PinInput key={index} value={digit} index={index} />
              ))}
            </View>
            {pin.join('').length === 4 && (
              <Text style={styles.validationText}>✓ 4-digit PIN entered</Text>
            )}
          </View>

          <View style={styles.pinSection}>
            <Text style={styles.label}>Confirm PIN</Text>
            <View style={styles.pinContainer}>
              {confirmPin.map((digit, index) => (
                <PinInput key={index} value={digit} index={index} isConfirm />
              ))}
            </View>
            {confirmPin.join('').length === 4 && pin.join('') === confirmPin.join('') && (
              <Text style={styles.validationText}>✓ PINs match</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Set New PIN</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📋 Important Information:</Text>
          <Text style={styles.infoText}>• PIN must be 4 digits (0-9 only)</Text>
          <Text style={styles.infoText}>• PIN is required for check-in and check-out</Text>
          <Text style={styles.infoText}>• Keep your PIN secure and confidential</Text>
          <Text style={styles.infoText}>• Location is recorded for security purposes</Text>
          <Text style={styles.infoText}>• You can reset your PIN anytime if forgotten</Text>
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
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 10,
  },
  instructions: {
    fontSize: 14,
    color: '#3498db',
    textAlign: 'center',
    marginBottom: 15,
  },
  locationInfo: {
    backgroundColor: '#e8f4fc',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  locationText: {
    fontSize: 12,
    color: '#2c3e50',
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  pinSection: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 15,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pinInput: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#dfe6e9',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 24,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
  },
  validationText: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
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
  cancelButton: {
    padding: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#e74c3c',
    fontSize: 16,
  },
  infoBox: {
    marginTop: 30,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 6,
    lineHeight: 20,
  },
});

export default UpdatePinScreen;