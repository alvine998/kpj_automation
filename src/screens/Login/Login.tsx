import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import normalize from 'react-native-normalize';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {db} from '../../utils/firebase';
import {hashPassword} from '../../utils/crypto';
import {saveSession} from '../../utils/session';

interface LoginProps {
  onLogin?: (email: string, password: string) => void;
  onSignUp?: () => void;
}

const Login: React.FC<LoginProps> = ({onLogin, onSignUp}) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      // You can add validation/error handling here
      return;
    }

    setIsLoading(true);
    try {
      if (onLogin) {
        await onLogin(email, password);
      } else {
        const hashedPassword = hashPassword(password);
        const emailValue = email.trim().toLowerCase();

        const q = query(
          collection(db, 'users'),
          where('email', '==', emailValue),
          where('password', '==', hashedPassword),
          limit(1),
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          Alert.alert('Error', 'Invalid email or password');
          return;
        }

        const userDoc = snap.docs[0];
        const data = userDoc.data() as {active?: boolean; role?: string};

        if (data.active === true) {
          await saveSession({
            userId: userDoc.id,
            email: emailValue,
            role: data.role,
            active: true,
          });
          navigation.reset({
            index: 0,
            routes: [{name: 'MainTabs'}],
          });
          return;
        }

        // Not active yet -> go to waiting screen with userId
        await saveSession({
          userId: userDoc.id,
          email: emailValue,
          role: data.role,
          active: false,
        });
        navigation.replace('Waiting', {userId: userDoc.id});
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      // Hash the password using SHA-256
      const hashedPassword = hashPassword(password);

      // Create user document in Firestore
      const userData = {
        active: false,
        createdAt: serverTimestamp(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: 'user',
        updatedAt: serverTimestamp(),
      };

      // Prevent duplicate emails
      const emailValue = email.trim().toLowerCase();
      const existsQ = query(
        collection(db, 'users'),
        where('email', '==', emailValue),
        limit(1),
      );
      const existsSnap = await getDocs(existsQ);
      if (!existsSnap.empty) {
        Alert.alert('Error', 'Email already exists');
        return;
      }

      const ref = await addDoc(collection(db, 'users'), {
        ...userData,
        email: emailValue,
      });

      Alert.alert('Success', 'Account created successfully!', [
        {
          text: 'OK',
          onPress: async () => {
            // Clear form then go to waiting
            setEmail('');
            setPassword('');
            await saveSession({
              userId: ref.id,
              email: emailValue,
              role: 'user',
              active: false,
            });
            navigation.replace('Waiting', {userId: ref.id});
          },
        },
      ]);
    } catch (error: any) {
      console.error('Sign up error:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to create account. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, normalize(40)),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                <Text style={styles.eyeButtonText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity style={styles.forgotPassword} disabled={isLoading}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              (!email.trim() || !password.trim() || isLoading) &&
                styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={!email.trim() || !password.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Sign Up Button */}
          <TouchableOpacity
            style={[
              styles.signUpButton,
              (!email.trim() || !password.trim() || isLoading) &&
                styles.signUpButtonDisabled,
            ]}
            onPress={handleSignUp}
            disabled={!email.trim() || !password.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#007AFF" />
            ) : (
              <Text style={styles.signUpButtonText}>Sign Up</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: normalize(24),
  },
  header: {
    marginTop: normalize(40),
    marginBottom: normalize(48),
  },
  title: {
    fontSize: normalize(32),
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: normalize(8),
  },
  subtitle: {
    fontSize: normalize(16),
    color: '#666',
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: normalize(24),
  },
  label: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: '#333',
    marginBottom: normalize(8),
  },
  input: {
    height: normalize(52),
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: normalize(12),
    paddingHorizontal: normalize(16),
    fontSize: normalize(16),
    color: '#1a1a1a',
    backgroundColor: '#f9f9f9',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: normalize(12),
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    height: normalize(52),
    paddingHorizontal: normalize(16),
    fontSize: normalize(16),
    color: '#1a1a1a',
  },
  eyeButton: {
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(14),
  },
  eyeButtonText: {
    fontSize: normalize(14),
    color: '#007AFF',
    fontWeight: '500',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: normalize(32),
  },
  forgotPasswordText: {
    fontSize: normalize(14),
    color: '#007AFF',
    fontWeight: '500',
  },
  loginButton: {
    height: normalize(52),
    backgroundColor: '#007AFF',
    borderRadius: normalize(12),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: '#fff',
  },
  signUpButton: {
    height: normalize(52),
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: normalize(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: normalize(16),
  },
  signUpButtonDisabled: {
    borderColor: '#ccc',
    opacity: 0.5,
  },
  signUpButtonText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: '#007AFF',
  },
});

export default Login;
