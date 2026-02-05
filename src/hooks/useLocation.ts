import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import LocationService from '../services/location';

export const useLocation = () => {
  const [location, setLocation] = useState<any>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocationPermission = useCallback(async () => {
    try {
      // Ensure app is active
      if (AppState.currentState !== 'active') {
        setError('App must be in foreground to request location');
        return false;
      }
      
      const granted = await LocationService.requestPermissions();
      setPermissionGranted(granted);
      return granted;
    } catch (err: any) {
      setError(`Permission error: ${err.message}`);
      return false;
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    try {
      if (!permissionGranted) {
        const granted = await requestLocationPermission();
        if (!granted) {
          throw new Error('Location permission not granted');
        }
      }
      
      const currentLocation = await LocationService.getCurrentLocation();
      setLocation(currentLocation);
      setError(null);
      return currentLocation;
    } catch (err: any) {
      setError(`Location error: ${err.message}`);
      throw err;
    }
  }, [permissionGranted, requestLocationPermission]);

  // Auto-request permission when component mounts and app is active
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        requestLocationPermission();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Initial check
    if (AppState.currentState === 'active') {
      requestLocationPermission();
    }

    return () => subscription.remove();
  }, [requestLocationPermission]);

  return {
    location,
    permissionGranted,
    error,
    requestLocationPermission,
    getCurrentLocation,
    isWithinMeetingPremises: LocationService.isWithinMeetingPremises,
  };
};