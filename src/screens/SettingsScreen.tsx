// screens/SettingsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from '../config';
import api from '../services/api';

const SettingsScreen = () => {
  const [backendUrl, setBackendUrl] = useState(Config.getCurrent().API_BASE_URL);
  const [environment, setEnvironment] = useState(Config.getCurrent().ENVIRONMENT);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const environments = [
    { id: 'development', name: 'Development', url: 'http://192.168.0.111:3000' },
    { id: 'staging', name: 'Staging (Render)', url: 'https://i-meet-backend.onrender.com' },
    { id: 'production', name: 'Production', url: 'https://api.imeet.yourdomain.com' },
    { id: 'custom', name: 'Custom URL', url: '' },
  ];

  const testConnection = async (url: string) => {
    setIsLoading(true);
    setTestResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: '✅ Connection successful!',
          data: data,
        });
        return true;
      } else {
        setTestResult({
          success: false,
          message: `❌ Server responded with ${response.status}`,
        });
        return false;
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `❌ Connection failed: ${error.message}`,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    const isValid = await testConnection(backendUrl);
    
    if (isValid) {
      try {
        await AsyncStorage.setItem('@backend_url', backendUrl);
        await AsyncStorage.setItem('@environment', environment);
        
        Alert.alert(
          '✅ Settings Saved',
          'Backend URL has been updated successfully.',
          [{ text: 'OK' }]
        );
        
        // Reload app or notify to restart
      } catch (error) {
        Alert.alert('Error', 'Failed to save settings');
      }
    } else {
      Alert.alert(
        '❌ Invalid URL',
        'Cannot connect to the specified backend URL. Please check and try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const selectEnvironment = (env: any) => {
    setEnvironment(env.id);
    if (env.id !== 'custom') {
      setBackendUrl(env.url);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Backend Settings</Text>
        <Text style={styles.headerSubtitle}>Configure server connection</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🌐 Environment Selection</Text>
        {environments.map((env) => (
          <TouchableOpacity
            key={env.id}
            style={[
              styles.envOption,
              environment === env.id && styles.envOptionSelected,
            ]}
            onPress={() => selectEnvironment(env)}
          >
            <View style={styles.envOptionContent}>
              <View style={styles.envRadio}>
                {environment === env.id && <View style={styles.envRadioSelected} />}
              </View>
              <View style={styles.envText}>
                <Text style={styles.envName}>{env.name}</Text>
                {env.url && <Text style={styles.envUrl}>{env.url}</Text>}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🔗 Custom Backend URL</Text>
        <TextInput
          style={styles.input}
          value={backendUrl}
          onChangeText={setBackendUrl}
          placeholder="https://your-backend-url.com"
          autoCapitalize="none"
          autoCorrect={false}
          editable={environment === 'custom'}
        />
        <Text style={styles.helpText}>
          Enter the full URL of your i-Meet backend server
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.testButton, isLoading && styles.buttonDisabled]}
        onPress={() => testConnection(backendUrl)}
        disabled={isLoading}
      >
        <Text style={styles.testButtonText}>
          {isLoading ? 'Testing...' : 'Test Connection'}
        </Text>
      </TouchableOpacity>

      {testResult && (
        <View style={[
          styles.resultCard,
          testResult.success ? styles.resultSuccess : styles.resultError
        ]}>
          <Text style={styles.resultTitle}>
            {testResult.success ? '✅ Connection Test Passed' : '❌ Connection Test Failed'}
          </Text>
          <Text style={styles.resultMessage}>{testResult.message}</Text>
          {testResult.data && (
            <View style={styles.resultDetails}>
              <Text style={styles.resultDetail}>
                Service: {testResult.data.service}
              </Text>
              <Text style={styles.resultDetail}>
                Status: {testResult.data.status}
              </Text>
              <Text style={styles.resultDetail}>
                Environment: {testResult.data.environment}
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, (!backendUrl || isLoading) && styles.buttonDisabled]}
        onPress={saveSettings}
        disabled={!backendUrl || isLoading}
      >
        <Text style={styles.saveButtonText}>Save Settings</Text>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>ℹ️ Connection Information</Text>
        <Text style={styles.infoText}>
          • Development: Your local computer (for testing){'\n'}
          • Staging: Render.com free hosting (for demo){'\n'}
          • Production: Your production server{'\n'}
          • Custom: Any publicly accessible server
        </Text>
        <Text style={styles.currentConfig}>
          Current: {Config.getCurrent().ENVIRONMENT} ({Config.getCurrent().API_BASE_URL})
        </Text>
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  envOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ecf0f1',
  },
  envOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e8f4fc',
  },
  envOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  envRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#3498db',
    marginRight: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  envRadioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3498db',
  },
  envText: {
    flex: 1,
  },
  envName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  envUrl: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  helpText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  testButton: {
    backgroundColor: '#3498db',
    borderRadius: 10,
    padding: 16,
    margin: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 10,
    padding: 16,
    margin: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    borderRadius: 10,
    padding: 15,
    margin: 16,
    marginTop: 8,
  },
  resultSuccess: {
    backgroundColor: '#d5f4e6',
    borderLeftWidth: 4,
    borderLeftColor: '#27ae60',
  },
  resultError: {
    backgroundColor: '#fde8e8',
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  resultMessage: {
    fontSize: 14,
    marginBottom: 10,
  },
  resultDetails: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 5,
    padding: 10,
  },
  resultDetail: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  infoCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 15,
    margin: 16,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e67e22',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#7f8c8d',
    lineHeight: 18,
  },
  currentConfig: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 10,
    fontFamily: 'monospace',
  },
});

export default SettingsScreen;