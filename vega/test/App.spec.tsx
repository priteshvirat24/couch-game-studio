import * as React from 'react';
import {BackHandler} from 'react-native';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {App} from '../src/App';

const mockHideSplash = jest.fn();

jest.mock('@amazon-devices/webview', () => ({
  WebView: 'WebView',
}));

// react-native resolves to react-native-kepler in this preset; mock just what the app uses.
jest.mock('@amazon-devices/react-native-kepler', () => {
  const {createElement} = require('react');
  const host = (name: string) => (props: any) => createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    StyleSheet: {create: (s: unknown) => s, flatten: (s: unknown) => s},
    AppState: {currentState: 'active', addEventListener: jest.fn(() => ({remove: jest.fn()}))},
    BackHandler: {exitApp: jest.fn()},
    usePreventHideSplashScreen: jest.fn(),
    useHideSplashScreenCallback: jest.fn(() => mockHideSplash),
  };
});

const mockReportFullyDrawn = jest.fn();
jest.mock('@amazon-devices/kepler-performance-api', () => ({
  useReportFullyDrawn: jest.fn(() => mockReportFullyDrawn),
}));

jest.mock('../src/config', () => ({STUDIO_URL: 'https://studio.example/'}));

const webview = () => screen.UNSAFE_getByType('WebView' as never);

describe('Couch Game Studio host app', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the TV app on the configured studio', () => {
    render(<App />);
    expect(webview().props.source).toEqual({uri: 'https://studio.example/tv/?platform=vega'});
    expect(webview().props.allowSystemKeyEvents).toBe(true);
  });

  it('hides the splash and reports fully drawn once the studio loads', () => {
    render(<App />);
    act(() => webview().props.onLoad({nativeEvent: {url: 'https://studio.example/tv/?platform=vega'}}));
    expect(mockHideSplash).toHaveBeenCalled();
    expect(mockReportFullyDrawn).toHaveBeenCalledTimes(1);
  });

  it('closes the app when the web app asks (Back on the home screen)', () => {
    render(<App />);
    act(() => webview().props.onMessage({nativeEvent: {data: 'exit'}}));
    expect(BackHandler.exitApp).toHaveBeenCalled();
  });

  it('shows a friendly retry screen when the studio is unreachable', () => {
    render(<App />);
    act(() => webview().props.onError({nativeEvent: {code: -2, url: 'x', description: 'Host unreachable'}}));
    expect(screen.getByText("Can't reach the game studio")).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(webview()).toBeTruthy();
  });
});
