import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  testApiConnection, 
  configureManualUrl, 
  saveNgrokUrl, 
  setConnectionMode,
  getConnectionInfo,
  initializeApi
} from '../services/api';
import { useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';

const InternetSetupScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  
  // Form states
  const [publicUrl, setPublicUrl] = useState('');
  const [localUrl, setLocalUrl] = useState('http://192.168.0.109:3000');
  const [connectionMode, setConnectionModeState] = useState<'local' | 'internet' | 'auto'>('auto');
  const [useNgrok, setUseNgrok] = useState(true);
  const [ngrokUrl, setNgrokUrl] = useState('');

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const loadCurrentSettings = async () => {
    setLoading(true);
    try {
      const info = await getConnectionInfo();
      setConnectionInfo(info);
      
      setConnectionModeState(info.mode);
      setPublicUrl(info.savedPublicUrl || '');
      setLocalUrl(info.savedLocalUrl || 'http://192.168.0.109:3000');
      
      if (info.currentUrl.includes('ngrok')) {
        setNgrokUrl(info.currentUrl);
        setUseNgrok(true);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (url: string) => {
    setTesting(true);
    try {
      const result = await testApiConnection();
      
      if (result.success) {
        Alert.alert(
          '✅ Connection Successful',
          `Connected to: ${result.url}\n\nServer Status: ${result.data.status}\nTimestamp: ${new Date(result.data.timestamp).toLocaleString()}`,
          [{ text: 'OK' }]
        );
        return true;
      } else {
        Alert.alert(
          '❌ Connection Failed',
          `Cannot connect to server.\n\nError: ${result.error}\n\nPlease check:\n1. Server is running\n2. Correct URL\n3. Internet connection`
        );
        return false;
      }
    } catch (error: any) {
      Alert.alert('❌ Test Failed', error.message);
      return false;
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfiguration = async () => {
    let urlToUse = '';
    let mode: 'local' | 'internet' = 'local';

    if (useNgrok && ngrokUrl) {
      urlToUse = ngrokUrl;
      mode = 'internet';
    } else if (connectionMode === 'internet' && publicUrl) {
      urlToUse = publicUrl;
      mode = 'internet';
    } else {
      urlToUse = localUrl;
      mode = 'local';
    }

    if (!urlToUse) {
      Alert.alert('Error', 'Please enter a valid URL');
      return;
    }

    setLoading(true);
    try {
      const result = await configureManualUrl(urlToUse, mode);
      
      if (result.success) {
        Alert.alert(
          '✅ Configuration Saved',
          `Successfully configured ${mode} connection:\n\n${urlToUse}\n\nYou can now use the app from anywhere with internet!`,
          [
            {
              text: 'Test Connection',
              onPress: () => testConnection(urlToUse)
            },
            {
              text: 'Continue to App',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert('❌ Configuration Failed', result.error);
      }
    } catch (error: any) {
      Alert.alert('❌ Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoConfigure = async () => {
    setLoading(true);
    try {
      const result = await initializeApi();
      
      Alert.alert(
        '✅ Auto-Configuration Complete',
        `Connected via ${result.mode} mode:\n\n${result.url}\n\nThe app will automatically use this connection.`,
        [
          {
            text: 'Test',
            onPress: () => testConnection(result.url)
          },
          {
            text: 'Continue',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error: any) {
      Alert.alert(
        '❌ Auto-Configuration Failed',
        'Could not automatically find API server.\n\nPlease configure manually.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const showNgrokInstructions = () => {
    Alert.alert(
      '📱 Ngrok Setup Instructions',
      `For INTERNET access (different networks):

1. On your LAPTOP (backend server):
   - Install ngrok: npm install -g ngrok
   - Start ngrok: ngrok http 3000
   - Copy the public URL (looks like https://abc123.ngrok.io)

2. On your PHONE (this app):
   - Paste the ngrok URL below
   - Save configuration
   - You can now connect from anywhere!

Benefits:
✅ Works on different WiFi networks
✅ Works on mobile data
✅ No router configuration needed
✅ Secure HTTPS connection

Note: Free ngrok URLs change each time you restart ngrok.`,
      [
        { text: 'Visit Ngrok Website', onPress: () => Linking.openURL('https://ngrok.com') },
        { text: 'OK' }
      ]
    );
  };

  const showPortForwardingInstructions = () => {
    Alert.alert(
      '🔧 Port Forwarding Instructions',
      `For PERMANENT internet access:

1. On your ROUTER:
   - Login to router admin (usually 192.168.0.1)
   - Find "Port Forwarding" section
   - Forward port 3000 to your laptop's IP

2. Find your PUBLIC IP:
   - Visit: https://whatismyipaddress.com
   - Your IP looks like: 123.45.67.89

3. Configure this app:
   - Use URL: http://[YOUR_PUBLIC_IP]:3000
   - Save configuration

Benefits:
✅ Permanent URL (doesn't change)
✅ Direct connection
✅ No third-party service

Note: This requires router access and may have security implications.`,
      [{ text: 'OK' }]
    );
  };

  const showQRCodeForUrl = () => {
    const url = ngrokUrl || publicUrl || localUrl;
    if (!url) {
      Alert.alert('Error', 'No URL configured');
      return;
    }

    Alert.alert(
      '📱 Scan QR Code',
      'Scan this QR code from another device to share the server URL:',
      [
        { text: 'OK' }
      ],
      { cancelable: true }
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Internet Setup</Text>
          <Text style={styles.subtitle}>Configure connection for anywhere access</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3498db" />
            <Text style={styles.loadingText}>Loading configuration...</Text>
          </View>
        ) : (
          <>
            {/* Current Status */}
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>Current Status</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, connectionInfo?.isConnected ? styles.connected : styles.disconnected]} />
                <Text style={styles.statusText}>
                  {connectionInfo?.isConnected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              {connectionInfo?.currentUrl && (
                <Text style={styles.currentUrl}>{connectionInfo.currentUrl}</Text>
              )}
              <Text style={styles.statusMode}>Mode: {connectionInfo?.mode || 'Not set'}</Text>
            </View>

            {/* Connection Mode Selection */}
            <View style={styles.modeCard}>
              <Text style={styles.modeTitle}>Connection Mode</Text>
              
              <TouchableOpacity
                style={[styles.modeOption, connectionMode === 'auto' && styles.modeSelected]}
                onPress={() => setConnectionModeState('auto')}
              >
                <Text style={styles.modeOptionText}>🔄 Auto (Recommended)</Text>
                <Text style={styles.modeOptionDescription}>
                  Automatically find best connection
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeOption, connectionMode === 'local' && styles.modeSelected]}
                onPress={() => setConnectionModeState('local')}
              >
                <Text style={styles.modeOptionText}>🏠 Local Network</Text>
                <Text style={styles.modeOptionDescription}>
                  Same WiFi network required
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeOption, connectionMode === 'internet' && styles.modeSelected]}
                onPress={() => setConnectionModeState('internet')}
              >
                <Text style={styles.modeOptionText}>🌐 Internet Access</Text>
                <Text style={styles.modeOptionDescription}>
                  Connect from anywhere
                </Text>
              </TouchableOpacity>
            </View>

            {/* Ngrok Configuration */}
            <View style={styles.configCard}>
              <View style={styles.configHeader}>
                <Text style={styles.configTitle}>🌐 Ngrok (Easy Internet Access)</Text>
                <Switch
                  value={useNgrok}
                  onValueChange={setUseNgrok}
                  trackColor={{ false: '#767577', true: '#27ae60' }}
                />
              </View>
              
              {useNgrok && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="https://abc123.ngrok.io"
                    value={ngrokUrl}
                    onChangeText={setNgrokUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#95a5a6"
                  />
                  <TouchableOpacity
                    style={styles.helpButton}
                    onPress={showNgrokInstructions}
                  >
                    <Text style={styles.helpButtonText}>📋 Ngrok Setup Instructions</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Manual Configuration */}
            <View style={styles.configCard}>
              <Text style={styles.configTitle}>🔧 Manual Configuration</Text>
              
              <Text style={styles.inputLabel}>Public URL (Internet):</Text>
              <TextInput
                style={styles.input}
                placeholder="http://your-public-ip:3000 or https://your-domain.com"
                value={publicUrl}
                onChangeText={setPublicUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#95a5a6"
              />
              
              <Text style={styles.inputLabel}>Local URL (Same WiFi):</Text>
              <TextInput
                style={styles.input}
                placeholder="http://192.168.x.x:3000"
                value={localUrl}
                onChangeText={setLocalUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#95a5a6"
              />
              
              <TouchableOpacity
                style={styles.helpButton}
                onPress={showPortForwardingInstructions}
              >
                <Text style={styles.helpButtonText}>🔧 Port Forwarding Guide</Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={handleAutoConfigure}
                disabled={loading}
              >
                <Text style={styles.actionButtonText}>🔄 Auto Configure</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={handleSaveConfiguration}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.actionButtonText}>💾 Save Configuration</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.testButton]}
                onPress={() => testConnection(connectionInfo?.currentUrl || '')}
                disabled={testing || !connectionInfo?.currentUrl}
              >
                {testing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.actionButtonText}>🔍 Test Connection</Text>
                )}
              </TouchableOpacity>

              {(ngrokUrl || publicUrl) && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.qrButton]}
                  onPress={showQRCodeForUrl}
                >
                  <Text style={styles.actionButtonText}>📱 Show QR Code</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Instructions */}
            <View style={styles.instructions}>
              <Text style={styles.instructionsTitle}>📋 Quick Setup Guide:</Text>
              
              <Text style={styles.instructionStep}>
                <Text style={styles.stepNumber}>1.</Text> For INTERNET access (different networks):
              </Text>
              <Text style={styles.instruction}>   • Use Ngrok (recommended for testing)</Text>
              <Text style={styles.instruction}>   • Or setup Port Forwarding</Text>
              
              <Text style={styles.instructionStep}>
                <Text style={styles.stepNumber}>2.</Text> For LOCAL access (same WiFi):
              </Text>
              <Text style={styles.instruction}>   • Use local IP address (192.168.x.x)</Text>
              
              <Text style={styles.instructionStep}>
                <Text style={styles.stepNumber}>3.</Text> Auto mode will try both
              </Text>
            </View>

            {/* QR Code Display (conditional) */}
            {(ngrokUrl || publicUrl) && (
              <View style={styles.qrContainer}>
                <Text style={styles.qrTitle}>Scan to share server URL:</Text>
                <View style={styles.qrCodeContainer}>
                  <QRCode
                    value={ngrokUrl || publicUrl}
                    size={200}
                    backgroundColor="#ffffff"
                    color="#000000"
                  />
                </View>
                <Text style={styles.qrUrl}>{ngrokUrl || publicUrl}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>← Back to App</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 30,
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#3498db',
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  connected: {
    backgroundColor: '#27ae60',
  },
  disconnected: {
    backgroundColor: '#e74c3c',
  },
  statusText: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '600',
  },
  currentUrl: {
    fontSize: 14,
    color: '#3498db',
    marginTop: 5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusMode: {
    fontSize: 14,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  modeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  modeOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e8f4fc',
  },
  modeOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  modeOptionDescription: {
    fontSize: 13,
    color: '#7f8c8d',
  },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 8,
    marginTop: 15,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2c3e50',
    marginBottom: 12,
  },
  helpButton: {
    backgroundColor: '#f39c12',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  helpButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionsContainer: {
    marginBottom: 20,
  },
  actionButton: {
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  secondaryButton: {
    backgroundColor: '#27ae60',
  },
  testButton: {
    backgroundColor: '#9b59b6',
  },
  qrButton: {
    backgroundColor: '#e74c3c',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructions: {
    backgroundColor: '#e8f4fc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  instructionStep: {
    fontSize: 15,
    color: '#2c3e50',
    marginBottom: 8,
    fontWeight: '600',
  },
  stepNumber: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: 'bold',
  },
  instruction: {
    fontSize: 14,
    color: '#2c3e50',
    marginBottom: 6,
    marginLeft: 20,
    lineHeight: 20,
  },
  qrContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  qrCodeContainer: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#dfe6e9',
  },
  qrUrl: {
    fontSize: 12,
    color: '#7f8c8d',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 10,
  },
  backButton: {
    backgroundColor: '#2c3e50',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default InternetSetupScreen;