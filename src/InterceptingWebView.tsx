import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import {
  DeviceEventEmitter,
  Platform,
  UIManager,
  requireNativeComponent,
  View,
  type ViewStyle,
} from 'react-native';
import type { NativeSyntheticEvent, StyleProp } from 'react-native';
import { buildInjected } from './injected';

/**
 * Represents an intercepted network or media event originating from either
 * the native Android layer or from injected DOM/JS hooks.
 */
export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  userAgent?: string;
};

/**
 * Source for the web content.
 * Either a remote URL via `uri` or raw HTML content via `html`.
 */
export type InterceptSource =
  | { uri: string }
  | { html: string };

/**
 * Props for `InterceptingWebView`.
 *
 * This component prefers a native Android view when available
 * (RNNativeInterceptWebView or RNInterceptWebViewAndroid),
 * otherwise it falls back to a plain JS `View` (no iOS native impl yet).
 */
export type InterceptProps = {
  /** Optional style for the container/view. */
  style?: StyleProp<ViewStyle>;
  source: InterceptSource;
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
  /** Raw JS executed before content loads. */
  injectedJavaScriptBeforeContentLoaded?: string;
  /** Raw JS executed after content loads. */
  injectedJavaScript?: string;
  /** Receive raw postMessage events from the page. */
  onMessage?: (e: NativeSyntheticEvent<{ data?: string }>) => void;
};

const COMPONENT_CANDIDATES_ANDROID = [
  'RNInterceptWebViewAndroid',
  'RNNativeInterceptWebView',
];

let RNInterceptNative: any = null;
if (Platform.OS === 'android') {
  try {
    for (const name of COMPONENT_CANDIDATES_ANDROID) {
      const cfg = (UIManager as any).getViewManagerConfig?.(name);
      if (cfg) {
        const comp = requireNativeComponent(name);
        RNInterceptNative = comp;
        break;
      }
    }
  } catch (e) {
    RNInterceptNative = null;
  }
}

/** Default regex to detect common media URLs. */
/**
 * Build a default case-insensitive regex string that matches common
 * streaming or media file extensions (e.g. m3u8, mp4, webm, mpd, ts).
 */
export function buildDefaultVideoRegex() {
  return String(/(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i);
}

function parseRegexString(s?: string): RegExp | null {
  if (!s) return null;
  try {
    const trimmed = String(s).trim();
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      const last = trimmed.lastIndexOf('/');
      const body = trimmed.slice(1, last);
      const flags = trimmed.slice(last + 1);
      return new RegExp(body, flags || '');
    }
    return new RegExp(trimmed, 'i');
  } catch {
    return null;
  }
}

/**
 * Android-first WebView with native request interception and rich JS hooks.
 * iOS is intentionally not implemented and will use the JS fallback path.
 */
/**
 * Android-first WebView-like component with native interception and rich JS hooks.
 *
 * Notes:
 * - On Android, if a compatible native view manager is available, it will be used.
 * - On iOS or when `forceFallback` is true or native is unavailable, falls back to a plain `View`.
 */
export const InterceptingWebView: FC<InterceptProps> = ({
  style,
  source,
  onIntercept,
  onNativeMatch,
  nativeUrlRegex,
  filterRegexes,
  aggressiveDomHooking = true,
  echoAllRequestsFromJS = false,
  forceFallback,
  injectedJavaScriptBeforeContentLoaded,
  injectedJavaScript,
  onMessage,
}) => {
  // Using any here avoids tight coupling to React Native type surface during d.ts emit
  const ref = useRef<any>(null);

  const injected = useMemo(
    () => buildInjected({ aggressiveDomHooking, echoAllRequestsFromJS }),
    [aggressiveDomHooking, echoAllRequestsFromJS]
  );

  const handleMessage = useCallback(
    (e: NativeSyntheticEvent<{ data?: string }>) => {
      try {
        try { console.log('[IWV] onMessage', String(e?.nativeEvent?.data ?? '')); } catch {}
        const data = JSON.parse(String(e.nativeEvent?.data ?? ''));
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
        try { console.log('[IWV] global onIntercept', String(url)); } catch {}
        onIntercept?.({ url: String(url), kind: 'native' });
        if (onNativeMatch && nativeUrlRegex) {
          try {
            const re = parseRegexString(nativeUrlRegex);
            if (re && re.test(String(url))) onNativeMatch(String(url));
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
      style,
      source,
      nativeUrlRegex: nativeUrlRegex || buildDefaultVideoRegex(),
      filterRegexes,
      echoAllRequestsFromJS,
      injectedJavaScriptBeforeContentLoaded:
        injected + (injectedJavaScriptBeforeContentLoaded || ''),
      injectedJavaScript:
        injected + (injectedJavaScriptBeforeContentLoaded || '') + (injectedJavaScript || '') + manualPing,
      onIntercept: (e: any) => {
        try {
          const url = e?.nativeEvent?.url ?? e?.url;
          if (url) {
            try { console.log('[IWV] direct onIntercept', String(url)); } catch {}
            onIntercept?.({ url: String(url), kind: 'native' });
            if (onNativeMatch && nativeUrlRegex) {
              try {
                const re = parseRegexString(nativeUrlRegex);
                if (re && re.test(String(url))) onNativeMatch(String(url));
              } catch {}
            }
          }
        } catch { }
      },
      onMessage: handleMessage,
      ref,
    };
    try { console.log('[IWV] Using native view'); } catch {}
    return <RNInterceptNative {...props} />;
  }

  // iOS and fallback: not implemented as native. Render an empty View.
  // The library currently focuses on Android native interception.
  // Cast ref to any to satisfy minimal RN stubs during type emit
  return <View style={style} ref={ref as any} />;
};

export default InterceptingWebView;
