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
export type InterceptRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  isMainFrame?: boolean;
  hasUserGesture?: boolean;
};

export type InterceptResponse = {
  status?: number;
  reason?: string;
  headers?: Record<string, string>;
  mimeType?: string;
  contentEncoding?: string;
  contentLength?: number;
};

export type InterceptEvent = {
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  request: InterceptRequest;
  response?: InterceptResponse;
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
  /** If provided, when a native URL matches the regex, this callback will be invoked with the full payload. */
  onNativeMatch?: (e: InterceptEvent) => void;
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
          let payload = data.payload as any;
          // Adapt legacy JS payloads that may only contain { kind, url }
          if (payload && typeof payload === 'object' && !payload.request && payload.url) {
            payload = {
              kind: payload.kind || 'dom',
              request: { url: String(payload.url) },
            } as InterceptEvent;
          }
          onIntercept?.(payload as InterceptEvent);
          try {
            if (
              onNativeMatch &&
              nativeUrlRegex &&
              (payload as InterceptEvent)?.request?.url &&
              payload.kind === 'native'
            ) {
              const re = new RegExp(nativeUrlRegex, 'i');
              const url = String((payload as InterceptEvent).request.url);
              if (re.test(url)) onNativeMatch(payload as InterceptEvent);
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
    const sub = DeviceEventEmitter.addListener('RNInterceptNative', (payload: any) => {
      try {
        if (!payload) return;
        // If native sent only a url string (very old), adapt it
        const full: InterceptEvent = typeof payload === 'string'
          ? { kind: 'native', request: { url: String(payload) } }
          : payload;
        try { console.log('[IWV] global onIntercept', full?.request?.url); } catch {}
        onIntercept?.(full);
        if (onNativeMatch && nativeUrlRegex && full?.request?.url) {
          const re = parseRegexString(nativeUrlRegex);
          if (re && re.test(String(full.request.url))) onNativeMatch(full);
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
          const payload = e?.nativeEvent ?? e;
          const full: InterceptEvent = payload?.request?.url
            ? payload
            : { kind: 'native', request: { url: String(payload?.url ?? '') } };
          if (full?.request?.url) {
            try { console.log('[IWV] direct onIntercept', String(full.request.url)); } catch {}
            onIntercept?.(full);
            if (onNativeMatch && nativeUrlRegex && full.kind === 'native') {
              const re = parseRegexString(nativeUrlRegex);
              if (re && re.test(String(full.request.url))) onNativeMatch(full);
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
