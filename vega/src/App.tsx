// Couch Game Studio for Fire TV (Vega OS).
// A thin, careful native host around the studio's TV web app:
//  - native splash until the studio is on screen (TTFF), TTFD reported for cold + warm starts
//  - D-pad / Back / Play-Pause go straight to the web app (allowSystemKeyEvents)
//  - Back on the home screen closes the app; a friendly retry screen if the studio is unreachable
import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, BackHandler, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useHideSplashScreenCallback, usePreventHideSplashScreen} from '@amazon-devices/react-native-kepler';
import {useReportFullyDrawn} from '@amazon-devices/kepler-performance-api';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {STUDIO_URL} from './config';

const TV_URL = `${STUDIO_URL.replace(/\/$/, '')}/tv/?platform=vega`;

export const App = () => {
  const webRef = useRef<any>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reportFullyDrawn = useReportFullyDrawn();
  const appState = useRef(AppState.currentState ?? 'active');

  // Keep the native splash up until the studio page has actually loaded.
  usePreventHideSplashScreen();
  const hideSplash = useHideSplashScreenCallback();

  // Warm start: report fully drawn when we come back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') reportFullyDrawn();
      appState.current = next;
    });
    return () => sub.remove();
  }, [reportFullyDrawn]);

  const fail = useCallback((why: string) => {
    hideSplash();
    setFailed(why);
  }, [hideSplash]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((a) => a + 1);
  }, []);

  if (failed) {
    return (
      <View style={styles.offline}>
        <Text style={styles.emoji}>📺💤</Text>
        <Text style={styles.title}>Can't reach the game studio</Text>
        <Text style={styles.body}>Make sure the Couch Game Studio server is running, then press OK to try again.</Text>
        <TouchableOpacity hasTVPreferredFocus style={styles.button} onPress={retry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
        <Text style={styles.detail}>{failed}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={attempt}
        ref={webRef}
        style={styles.webview}
        source={{uri: TV_URL}}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="never"
        // The web app posts 'exit' when Back is pressed on its home screen.
        onMessage={(event: {nativeEvent: {data: string}}) => {
          if (event.nativeEvent.data === 'exit') BackHandler.exitApp();
        }}
        onLoad={(event: WebViewNavigationEvent) => {
          hideSplash();
          // Cold start: the TV app is on screen and ready for the remote.
          if (event.nativeEvent.url?.includes('/tv/')) reportFullyDrawn();
        }}
        onError={({nativeEvent: {code, url, description}}: WebViewErrorEvent) => {
          console.error(`[studio] load error ${code} ${url}: ${description}`);
          fail(`${description || 'Network error'} (${code})`);
        }}
        onHttpError={({nativeEvent: {url, statusCode, isMainFrame}}: WebViewHttpErrorEvent) => {
          console.error(`[studio] HTTP ${statusCode} for ${url}`);
          if (isMainFrame) fail(`The studio answered with HTTP ${statusCode}`);
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[studio] SSL error ${code} ${url}: ${description}`);
          fail('Secure connection failed');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#12102b'},
  webview: {backgroundColor: '#12102b'},
  offline: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12102b', padding: 80},
  emoji: {fontSize: 120},
  title: {color: '#fff8ec', fontSize: 64, fontWeight: '700', marginTop: 24},
  body: {color: '#b9b3e0', fontSize: 34, marginTop: 18, textAlign: 'center', maxWidth: 1300},
  button: {marginTop: 48, backgroundColor: '#ffd166', borderRadius: 999, paddingHorizontal: 64, paddingVertical: 22},
  buttonText: {color: '#2b1d00', fontSize: 40, fontWeight: '700'},
  detail: {color: '#6f6a99', fontSize: 22, marginTop: 36},
});
