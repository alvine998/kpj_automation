import React, {useEffect, useMemo, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Login from './src/screens/Login/Login';
import Waiting from './src/screens/Waiting/Waiting';
import Home from './src/screens/Home/Home';
import DataTerkumpul from './src/screens/DataTerkumpul/DataTerkumpul';
import Akun from './src/screens/Akun/Akun';
import SippWebView from './src/screens/WebView/SippWebView';
import LasikWebView from './src/screens/WebView/LasikWebView';
import DPTWebView from './src/screens/WebView/DPTWebView';
import {loadSession} from './src/utils/session';

export type RootStackParamList = {
  Login: undefined;
  Waiting: {userId: string};
  MainTabs: undefined;
  SippWebView: undefined;
  LasikWebView: undefined;
  DPTWebView: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export type MainTabParamList = {
  Beranda: undefined;
  'Data Terkumpul': undefined;
  Akun: undefined;
};
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarIcon: ({color, size, focused}) => {
          let name: string = 'ellipse';
          if (route.name === 'Beranda') {
            name = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Data Terkumpul') {
            name = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Akun') {
            name = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}>
      <Tab.Screen name="Beranda" component={Home} />
      <Tab.Screen name="Data Terkumpul" component={DataTerkumpul} />
      <Tab.Screen name="Akun" component={Akun} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList>('Login');
  const [waitingUserId, setWaitingUserId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await loadSession();
        if (!mounted) return;

        if (session?.userId) {
          if (session.active === true) {
            setInitialRoute('MainTabs');
          } else {
            setInitialRoute('Waiting');
            setWaitingUserId(session.userId);
          }
        } else {
          setInitialRoute('Login');
        }
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const waitingInitialParams = useMemo(() => {
    return waitingUserId ? {userId: waitingUserId} : undefined;
  }, [waitingUserId]);

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={stylesBoot.container}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
          }}>
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen
            name="Waiting"
            component={Waiting}
            initialParams={waitingInitialParams as any}
          />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="SippWebView" component={SippWebView} />
          <Stack.Screen name="LasikWebView" component={LasikWebView} />
          <Stack.Screen name="DPTWebView" component={DPTWebView} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const stylesBoot = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
