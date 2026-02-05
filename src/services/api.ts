// src/services/api.ts - EXPO COMPATIBLE VERSION
import axios from 'axios';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

const API_BASE_URL = 'https://unstalemated-redundantly-basilia.ngrok-free.dev';

// Get device info for Expo
const getDeviceInfo = async () => {
  try {
    let deviceId;
    
    if (Platform.OS === 'android') {
      deviceId = Application.androidId || `android-${Date.now()}`;
    } else {
      // iOS: Use model + timestamp
      deviceId = `ios-${Device.modelId || 'unknown'}-${Date.now()}`;
    }
    
    return {
      deviceId,
      deviceName: Device.deviceName || 'Unknown Device',
      deviceModel: Device.modelName || 'Unknown',
      deviceBrand: Device.brand || 'Unknown',
      systemVersion: Device.osVersion || 'Unknown',
      platform: Platform.OS,
      appVersion: Application.nativeApplicationVersion || '1.0.0',
      buildNumber: Application.nativeBuildVersion || '1',
      timestamp: new Date().toISOString(),
      manufacturer: Device.manufacturer || 'Unknown'
    };
  } catch (error) {
    return {
      deviceId: 'unknown',
      deviceName: 'Unknown Device',
      platform: Platform.OS,
      timestamp: Date.now(),
    };
  }
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '69420',
  },
});

// Add request interceptor
api.interceptors.request.use(
  async (config) => {
    const deviceInfo = await getDeviceInfo();
    
    config.headers['X-Device-ID'] = deviceInfo.deviceId;
    config.headers['X-Device-Name'] = deviceInfo.deviceName;
    config.headers['X-Platform'] = deviceInfo.platform;
    config.headers['X-App-Version'] = deviceInfo.appVersion;
    config.headers['X-Timestamp'] = Date.now().toString();
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      return Promise.reject(new Error('Network Error: Cannot connect to server. Check your internet connection.'));
    }
    return Promise.reject(error);
  }
);

// Test connection
export const testConnection = async () => {
  try {
    const response = await api.get('/health');
    return {
      success: true,
      data: response.data,
      url: API_BASE_URL,
      message: '✅ Connected to iLaMeet!'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      url: API_BASE_URL,
      message: '❌ Cannot connect to iLaMeet server'
    };
  }
};

// Enrollment API
export const enrollUser = async (userData: any) => {
  try {
    const deviceInfo = await getDeviceInfo();
    
    const response = await api.post('/api/auth/enroll', {
      name: userData.name,
      nationalId: userData.nationalId,
      mobile: userData.mobile,
      email: userData.email,
      organization: userData.organization,
      pin: userData.pin,
      location: userData.location,
      deviceInfo: deviceInfo
    });
    
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.message || 
                        'Failed to enroll user';
    
    throw new Error(errorMessage);
  }
};

// Login/Verify API
export const loginUser = async (credentials: any) => {
  try {
    const response = await api.post('/api/auth/verify', {
      nationalId: credentials.nationalId,
      pin: credentials.pin
    });
    
    if (response.data.verified && response.data.user) {
      return {
        success: true,
        verified: true,
        message: response.data.message,
        user: {
          name: response.data.user.name,
          nationalId: response.data.user.nationalId,
          mobileNumber: response.data.user.mobile,
          email: response.data.user.email,
          organization: response.data.user.organization,
          userId: response.data.user.id
        }
      };
    } else if (response.data.requiresPinReset) {
      return {
        success: false,
        verified: false,
        requiresPinReset: true,
        message: response.data.message || 'PIN reset required.',
        user: response.data.user ? {
          name: response.data.user.name,
          nationalId: response.data.user.nationalId,
          mobileNumber: response.data.user.mobile,
          email: response.data.user.email,
          organization: response.data.user.organization,
          userId: response.data.user.id
        } : null
      };
    } else {
      return {
        success: false,
        verified: false,
        message: response.data.message || 'Invalid credentials'
      };
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      return {
        success: false,
        verified: false,
        message: 'User not found. Please enroll first.'
      };
    }
    
    if (error.response?.status === 401 && error.response?.data?.requiresPinReset) {
      return {
        success: false,
        verified: false,
        requiresPinReset: true,
        message: error.response.data.message || 'PIN reset required.',
        user: error.response.data.user
      };
    }
    
    throw new Error(error.response?.data?.message || 'Login failed');
  }
};

// Check-in API
export const checkInMeeting = async (checkInData: any) => {
  try {
    const deviceInfo = await getDeviceInfo();
    
    const response = await api.post('/api/auth/checkin', {
      nationalId: checkInData.nationalId,
      pin: checkInData.pin,
      location: checkInData.location,
      deviceInfo: deviceInfo
    });
    
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Check-in failed');
  }
};

// Check-out API
export const checkOutMeeting = async (checkOutData: any) => {
  try {
    const nationalId = checkOutData.nationalId || checkOutData.userId;
    
    if (!nationalId) {
      throw new Error('National ID is required for check-out');
    }
    
    if (!checkOutData.pin) {
      throw new Error('PIN is required for check-out');
    }
    
    const deviceInfo = await getDeviceInfo();
    
    let location: any = null;
    
    if (checkOutData.location) {
      const latitude = checkOutData.location.latitude || checkOutData.location.lat;
      const longitude = checkOutData.location.longitude || checkOutData.location.lng;
      
      if (latitude !== undefined && longitude !== undefined) {
        location = {
          latitude: latitude,
          longitude: longitude,
          accuracy: checkOutData.location.accuracy || 0,
          timestamp: checkOutData.location.timestamp || Date.now(),
          recordedAt: checkOutData.location.recordedAt || new Date().toISOString(),
        };
      }
    }
    
    if (!location && checkOutData.force) {
      location = {
        latitude: 0,
        longitude: 0,
        accuracy: 9999,
        timestamp: Date.now(),
        recordedAt: new Date().toISOString(),
        isEstimated: true,
        forceCheckout: true
      };
    }
    
    const payload: any = {
      nationalId: nationalId,
      pin: checkOutData.pin,
      deviceInfo: deviceInfo,
      force: checkOutData.force || false
    };
    
    if (location) {
      payload.location = location;
    }
    
    const response = await api.post('/api/auth/checkout', payload);
    
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.message || 
                        'Check-out failed';
    
    throw new Error(errorMessage);
  }
};

// Check if user exists
export const checkUserExists = async (nationalId: string) => {
  try {
    try {
      const response = await api.post('/api/auth/verify', {
        nationalId: nationalId,
        pin: '0000'
      });
      
      return { 
        exists: response.data.verified === true,
        user: response.data.user
      };
    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.data?.verified === false) {
        return { exists: false };
      }
      throw error;
    }
  } catch (error: any) {
    return { exists: false };
  }
};

// PIN Reset API
export const requestPinReset = async (pinResetData: any) => {
  try {
    const response = await api.post('/api/auth/reset-pin', {
      nationalId: pinResetData.nationalId,
      location: pinResetData.location || null
    });
    
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.message || 
                        'Failed to reset PIN';
    
    throw new Error(errorMessage);
  }
};

// Update PIN API
export const updateUserPin = async (updateData: any) => {
  try {
    const payload: any = {
      nationalId: updateData.nationalId,
      newPin: updateData.newPin
    };
    
    if (updateData.oldPin) {
      payload.oldPin = updateData.oldPin;
    }
    
    if (updateData.location) {
      payload.location = updateData.location;
    }
    
    if (updateData.deviceInfo) {
      payload.deviceInfo = updateData.deviceInfo;
    }
    
    const response = await api.post('/api/auth/update-pin', payload);
    
    return response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.message || 
                        'Failed to update PIN';
    
    throw new Error(errorMessage);
  }
};

export default api;