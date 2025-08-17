import React, {useMemo, useRef, useCallback, useEffect} from 'react';
import {
  Platform,
  requireNativeComponent,
  NativeSyntheticEvent,
  UIManager,
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import type {WebViewProps} from 'react-native-webview';
import {WebView} from 'react-native-webview';
import {buildInjected} from './injected';

export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch';
  userAgent?: string;
};

export type InterceptProps = WebViewProps & {
  onIntercept?: (e: InterceptEvent) => void;
  // Called when a URL matches nativeUrlRegex (receives the matched URL)
  onNativeMatch?: (url: string) => void;
  nativeUrlRegex?: string; // Android only
  aggressiveDomHooking?: boolean;
  echoAllRequestsFromJS?: boolean;
};

const COMPONENT_NAME_ANDROID = 'RNInterceptWebViewAndroid';

let RNInterceptNative: any = null;
if (Platform.OS === 'android') {
  try {
    const maybe = requireNativeComponent(COMPONENT_NAME_ANDROID);
    // Ensure UIManager has the view manager registered and its viewConfig is available.
    // If not, don't use the native component to avoid "bubblingEventTypes of null" errors.
    const cfg =
      (UIManager as any).getViewManagerConfig &&
      (UIManager as any).getViewManagerConfig(COMPONENT_NAME_ANDROID);
    if (cfg) {
      RNInterceptNative = maybe;
    } else {
      RNInterceptNative = null;
    }
  } catch (e) {
    RNInterceptNative = null;
  }
}

// Diagnostic: print whether native component is available and its view manager config.
// This helps determine why native interception events may not be reaching JS.
try {
  // eslint-disable-next-line no-console
  console.log(
    '[InterceptWebView] Native component available:',
    RNInterceptNative ? true : false,
    'viewManagerConfig:',
    (UIManager as any).getViewManagerConfig
      ? (UIManager as any).getViewManagerConfig(COMPONENT_NAME_ANDROID)
      : null,
  );
} catch (e) {
  // ignore
}

export function buildDefaultVideoRegex() {
  return String(
    /(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i,
  );
}

/**
 * InterceptWebView is a React Native WebView component that intercepts requests.
 * It wraps the native Android WebView component with the RNInterceptWebViewAndroid
 * native module for Android interception, and falls back to the react-native-webview
 * WebView component for iOS and other platforms.
 *
 * @param {InterceptProps} props - The props for InterceptWebView.
 * @param {(e: InterceptEvent) => void} [props.onIntercept] - Called when a request is intercepted.
 * @param {(url: string) => void} [props.onNativeMatch] - Called when a URL matches nativeUrlRegex.
 * @param {string} [props.nativeUrlRegex] - Android only, a regex string that matches URLs to intercept.
 * @param {boolean} [props.aggressiveDomHooking=true] - Whether to aggressively hook into the DOM.
 * @param {boolean} [props.echoAllRequestsFromJS=false] - Whether to echo all requests from JavaScript.
 * @param {string} [props.injectedJavaScriptBeforeContentLoaded] - JavaScript to inject before content is loaded.
 * @param {(e: NativeSyntheticEvent<any>) => void} [props.onMessage] - Called when a WebView message is received.
 * @param {WebViewProps} rest - The rest of the WebView props.
 * @return {ReactElement} The rendered WebView component.
 */
export const InterceptWebView: React.FC<InterceptProps> = ({
  onIntercept,
  onNativeMatch,
  nativeUrlRegex,
  aggressiveDomHooking = true,
  echoAllRequestsFromJS = false,
  injectedJavaScriptBeforeContentLoaded,
  onMessage,
  ...rest
}) => {
  const ref = useRef<WebView>(null);

  const injected = useMemo(
    () => buildInjected({aggressiveDomHooking, echoAllRequestsFromJS}),
    [aggressiveDomHooking, echoAllRequestsFromJS],
  );

  const handleMessage = useCallback(
    (e: NativeSyntheticEvent<any>) => {
      // eslint-disable-next-line no-console
      console.log('Intercept RAW:', e?.nativeEvent?.data);
      try {
        const data = JSON.parse(e.nativeEvent.data);
        if (data && data.__rnIntercept) {
          const payload = data.payload as InterceptEvent;
          if (onIntercept) {
            onIntercept(payload);
          }
          // If the payload comes from native and a nativeUrlRegex + onNativeMatch are provided,
          // run the regex check and call the hook when it matches.
          try {
            if (
              onNativeMatch &&
              nativeUrlRegex &&
              payload &&
              payload.url &&
              payload.kind === 'native'
            ) {
              const re = new RegExp(nativeUrlRegex, 'i');
              if (re.test(String(payload.url))) {
                onNativeMatch(String(payload.url));
              }
            }
          } catch (rxErr) {
            // ignore regex errors
          }
          return;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Intercept parse error:', err);
      }
      onMessage?.(e);
    },
    [onIntercept, onMessage, onNativeMatch, nativeUrlRegex],
  );

  // Subscribe to global native fallback emitter in case per-view events don't arrive.
  useEffect(() => {
    // Subscribe if the caller wants either the general intercept callback or the native-match hook.
    if (!onIntercept && !onNativeMatch) return;
    const sub = DeviceEventEmitter.addListener(
      'RNInterceptNative',
      (url: string) => {
        try {
          if (!url) return;
          if (onIntercept) {
            onIntercept({url: String(url), kind: 'native'});
          }
          if (onNativeMatch && nativeUrlRegex) {
            try {
              const re = new RegExp(nativeUrlRegex, 'i');
              if (re.test(String(url))) {
                onNativeMatch(String(url));
              }
            } catch (rxErr) {
              // ignore invalid regex
            }
          }
        } catch (e) {
          // ignore
        }
      },
    );
    return () => {
      try {
        sub.remove();
      } catch (e) {}
    };
  }, [onIntercept, onNativeMatch, nativeUrlRegex]);

  // Use native intercepting WebView when available
  if (Platform.OS === 'android' && RNInterceptNative) {
    const manualPing = `
      (function(){
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ __rnIntercept: true, payload: { kind: 'dom', url: '__manual_post_injected__' } })
            );
          }
        } catch(e) {}
      })();
      true;
    `;

    const props: any = {
      ...rest,
      // Ensure Android JS bridge (window.ReactNativeWebView.postMessage) is wired up
      messagingEnabled: true,
      // Explicitly enable JS and DOM storage on Android path
      javaScriptEnabled: true,
      domStorageEnabled: true,
      nativeUrlRegex: nativeUrlRegex || buildDefaultVideoRegex(),
      injectedJavaScriptBeforeContentLoaded:
        injected + (injectedJavaScriptBeforeContentLoaded || ''),
      // Also inject after content load to sanity-check bridge availability
      injectedJavaScript:
        injected + (injectedJavaScriptBeforeContentLoaded || '') + manualPing,
      // Map native onIntercept events into the public onIntercept prop
      onIntercept: (e: any) => {
        try {
          const url =
            e && e.nativeEvent && e.nativeEvent.url
              ? e.nativeEvent.url
              : e && e.url;
          // console.log('Intercept NATIVE:', url);
          if (onIntercept && url) {
            onIntercept({url: String(url), kind: 'native'});
          }
        } catch (err) {
          // ignore
        }
      },
      onMessage: handleMessage,
      ref,
    };
    return React.createElement(RNInterceptNative, props);
  }

  return (
    <WebView
      {...rest}
      injectedJavaScript={
        injected + (injectedJavaScriptBeforeContentLoaded || '')
      }
      injectedJavaScriptBeforeContentLoaded={
        injected + (injectedJavaScriptBeforeContentLoaded || '')
      }
      javaScriptEnabled
      domStorageEnabled
      onMessage={handleMessage}
      ref={ref}
    />
  );
};
