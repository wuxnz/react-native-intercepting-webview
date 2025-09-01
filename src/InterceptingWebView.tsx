import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DeviceEventEmitter,
  Platform,
  UIManager,
  requireNativeComponent,
} from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { WebView } from 'react-native-webview';
import { buildInjected } from './injected';

/**
 * Intercept events emitted from JS or native.
 */
export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  userAgent?: string;
};

/**
 * Props for InterceptingWebView.
 * This component prefers a native Android view when available
 * (RNNativeInterceptWebView or RNInterceptWebViewAndroid),
 * otherwise it falls back to the JS WebView.
 */
export type InterceptProps = WebViewProps & {
  /** Called whenever a request is intercepted (native or JS). */
  onIntercept?: (e: InterceptEvent) => void;
  /** If provided, when a native URL matches the regex, this callback will be invoked. */
  onNativeMatch?: (url: string) => void;
  /** Android-only regex that narrows which URLs are emitted by native. */
  nativeUrlRegex?: string;
  /** Android-only: additional native filtering (reserved for parity; may be ignored). */
  filterRegexes?: string[];
  /** When true, aggressively watches the DOM for new <video>/<source>/<iframe> tags. */
  aggressiveDomHooking?: boolean;
  /** When true, echo all JS-initiated requests (fetch/xhr) to RN. */
  echoAllRequestsFromJS?: boolean;
  /** Force fallback to JS WebView even on Android. Useful for debugging. */
  forceFallback?: boolean;
};

const COMPONENT_CANDIDATES_ANDROID = [
  'RNNativeInterceptWebView',
  'RNInterceptWebViewAndroid',
];

let RNInterceptNative: any = null;
let RNInterceptNativeName: string | null = null;
if (Platform.OS === 'android') {
  try {
    for (const name of COMPONENT_CANDIDATES_ANDROID) {
      const cfg = (UIManager as any).getViewManagerConfig?.(name);
      if (cfg) {
        const comp = requireNativeComponent(name);
        RNInterceptNative = comp;
        RNInterceptNativeName = name;
        break;
      }
    }
  } catch (e) {
    RNInterceptNative = null;
    RNInterceptNativeName = null;
  }
}

/** Default regex to detect common media URLs. */
export function buildDefaultVideoRegex() {
  return String(/(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i);
}

/**
 * Android-first WebView with native request interception and rich JS hooks.
 * iOS is intentionally not implemented and will use the JS fallback path.
 */
export const InterceptingWebView: React.FC<InterceptProps> = ({
  onIntercept,
  onNativeMatch,
  nativeUrlRegex,
  filterRegexes,
  aggressiveDomHooking = true,
  echoAllRequestsFromJS = false,
  forceFallback,
  injectedJavaScriptBeforeContentLoaded,
  onMessage,
  ...rest
}) => {
  const ref = useRef<WebView>(null);

  const injected = useMemo(
    () => buildInjected({ aggressiveDomHooking, echoAllRequestsFromJS }),
    [aggressiveDomHooking, echoAllRequestsFromJS]
  );

  const handleMessage = useCallback(
    (e: NativeSyntheticEvent<any>) => {
      try {
        const data = JSON.parse(e.nativeEvent?.data);
        if (data && data.__rnIntercept) {
          const payload = data.payload as InterceptEvent;
          onIntercept?.(payload);
          try {
            if (
              onNativeMatch &&
              nativeUrlRegex &&
              payload?.url &&
              payload.kind === 'native'
            ) {
              const re = new RegExp(nativeUrlRegex, 'i');
              if (re.test(String(payload.url))) onNativeMatch(String(payload.url));
            }
          } catch { }
          return;
        }
      } catch { }
      onMessage?.(e);
    },
    [onIntercept, onMessage, onNativeMatch, nativeUrlRegex]
  );

  // Global native fallback emitter
  useEffect(() => {
    if (!onIntercept && !onNativeMatch) return;
    const sub = DeviceEventEmitter.addListener('RNInterceptNative', (url: string) => {
      try {
        if (!url) return;
        onIntercept?.({ url: String(url), kind: 'native' });
        if (onNativeMatch && nativeUrlRegex) {
          try {
            const re = new RegExp(nativeUrlRegex, 'i');
            if (re.test(String(url))) onNativeMatch(String(url));
          } catch { }
        }
      } catch { }
    });
    return () => {
      try { sub.remove(); } catch { }
    };
  }, [onIntercept, onNativeMatch, nativeUrlRegex]);

  if (Platform.OS === 'android' && RNInterceptNative && !forceFallback) {
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
      messagingEnabled: true,
      javaScriptEnabled: true,
      domStorageEnabled: true,
      nativeUrlRegex: nativeUrlRegex || buildDefaultVideoRegex(),
      filterRegexes,
      injectedJavaScriptBeforeContentLoaded:
        injected + (injectedJavaScriptBeforeContentLoaded || ''),
      injectedJavaScript:
        injected + (injectedJavaScriptBeforeContentLoaded || '') + manualPing,
      onIntercept: (e: any) => {
        try {
          const url = e?.nativeEvent?.url ?? e?.url;
          if (url) onIntercept?.({ url: String(url), kind: 'native' });
        } catch { }
      },
      onMessage: handleMessage,
      ref,
    };
    return React.createElement(RNInterceptNative, props);
  }

  // Fallback path: plain WebView
  const manualPing = `
    (function(){
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ __rnIntercept: true, payload: { kind: 'dom', url: '__manual_post_injected_fallback__' } })
          );
        } else {
          window.__rnInterceptQueue = window.__rnInterceptQueue || [];
          window.__rnInterceptQueue.push(JSON.stringify({ __rnIntercept: true, payload: { kind: 'dom', url: '__manual_post_queued__' } }));
        }
      } catch(e) {}
    })();
    true;
  `;

  return (
    <WebView
      {...rest}
      injectedJavaScript={
        injected + (injectedJavaScriptBeforeContentLoaded || '') + manualPing
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

export default InterceptingWebView;
