# react-native-intercepting-webview

Android‑first WebView with native request interception and rich JS hooks. On iOS or when the native view is unavailable, the component renders a plain `View` (no web content is displayed).

This library lets you observe network requests initiated inside the WebView (e.g., HLS/DASH manifests, media segments, XHR/fetch) and DOM activity, and react to them from React Native.

Key points:

- Native (Android) emits an intercept event for every request. For URLs that match `nativeUrlRegex`, the Android layer proxies the request to capture response metadata and serves it back to the WebView.
- `nativeUrlRegex` determines which requests are fully proxied (and thus include response info). Non‑matching requests still emit a request event but are not proxied.
- A global fallback event is also emitted via `DeviceEventEmitter` with the name `RNInterceptNative` (now emits a structured payload instead of a plain URL string).

## Requirements

- React Native: `0.81.x`
- React: `19.x`
- Android: Native module preferred (Fabric view). iOS native view is not implemented.

## Installation

Install the package:

```sh
yarn add react-native-intercepting-webview
# or
npm i react-native-intercepting-webview
```

On Android, autolinking should register the native view. No additional setup is required.

## Quick start

```tsx
import React from 'react';
import { View } from 'react-native';
import { InterceptingWebView } from 'react-native-intercepting-webview';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <InterceptingWebView
        source={{ uri: 'https://example.com' }}
        // Receive all intercept events (native or JS). e.request has URL/method/headers; e.response is present when proxied.
        onIntercept={(e) => {
          console.log('[intercept]', e.kind, e.request.url, e.response?.status);
        }}
        // Android: called with full payload when URL matches nativeUrlRegex (proxied request)
        onNativeMatch={(e) => {
          console.log('[native match]', e.request.url, e.response?.status);
        }}
        // Android: decides which native requests are proxied (and populate e.response)
        nativeUrlRegex={String(/\.(m3u8|mp4|webm|mpd|ts)(\?.*)?$/i)}
      />
    </View>
  );
}
```

## API

### Component: `InterceptingWebView`

Android‑first WebView. On Android it prefers a native Fabric view for request interception. On iOS or when the native view is unavailable, it renders a plain `View` (no web content).

```ts
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
  response?: InterceptResponse; // present when URL matched nativeUrlRegex and was proxied
  userAgent?: string;
};

export type InterceptSource =
  | { uri: string }
  | { html: string };

export type InterceptProps = {
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  source: InterceptSource;                    // Android native view only
  onIntercept?: (e: InterceptEvent) => void;  // native and JS-originated events
  onNativeMatch?: (e: InterceptEvent) => void;// Android only helper, full payload
  nativeUrlRegex?: string;                    // Android only; decides which requests are proxied
  filterRegexes?: string[];                   // Android only (reserved)
  aggressiveDomHooking?: boolean;             // default: true (Android)
  echoAllRequestsFromJS?: boolean;            // default: false (Android)
  forceFallback?: boolean;                    // Force plain View even on Android
  injectedJavaScriptBeforeContentLoaded?: string; // Android only
  injectedJavaScript?: string;                    // Android only
  onMessage?: (e: import('react-native').NativeSyntheticEvent<{ data?: string }>) => void; // Android only
};
```

#### Props

- __`onIntercept`__: Called for every intercepted event (native or JS). For Android native requests that match `nativeUrlRegex`, `e.response` will be populated with response metadata and the WebView will be served the proxied response.
- __`onNativeMatch` (Android)__: Fired with the full payload when a native URL matches `nativeUrlRegex`.
- __`nativeUrlRegex` (Android)__: Case‑insensitive regex string that decides which native requests are fully proxied and thus include `response`. Defaults to a media‑focused regex (m3u8, mp4, webm, mpd, ts) via `buildDefaultVideoRegex()`.
- __`filterRegexes` (Android)__: Additional native filtering (reserved for parity; may be ignored).
- __`aggressiveDomHooking` (Android)__: When true, the injected script watches the DOM for new `<video>`, `<source>`, `<iframe>` and posts events.
- __`echoAllRequestsFromJS` (Android)__: When true, proxies JS `fetch`/`XMLHttpRequest` to RN via `postMessage`.
- __`forceFallback`__: Force the plain `View` path even on Android (helpful for debugging).

#### Events

`onIntercept(e: InterceptEvent)`:

- __`e.kind`__: One of `native | dom | video | xhr | fetch | perf`.
- __`e.request`__: `{ url, method?, headers?, isMainFrame?, hasUserGesture? }`.
- __`e.response?`__: Present when Android proxied the request due to `nativeUrlRegex` match: `{ status, reason, headers, mimeType, contentEncoding, contentLength }`.

### Named exports

```ts
import {
  InterceptingWebView,
  buildDefaultVideoRegex,
  type InterceptEvent,
  type InterceptProps,
} from 'react-native-intercepting-webview';
```

- __`buildDefaultVideoRegex()`__: Returns a stringified regex that matches common media URLs.

## Platform notes

- __Android__: Tries to instantiate one of the native components `RNNativeInterceptWebView` or `RNInterceptWebViewAndroid`. If found, it renders a native WebView, enables native request interception, and injects helpers for DOM/JS events.
- __iOS__: The native view is not implemented. The component renders a plain `View` and does not display web content. Interception and injected script features are unavailable on iOS.

## Advanced usage

```tsx
<InterceptingWebView
  source={{ uri: 'https://video.example.com' }}
  aggressiveDomHooking
  echoAllRequestsFromJS
  nativeUrlRegex={String(/video|m3u8|mp4/i)}
  onIntercept={(e) => {
    if (e.kind === 'native') {
      console.log('native request:', e.request.url, e.request.method);
      if (e.response) {
        console.log('status:', e.response.status, 'mime:', e.response.mimeType);
      }
    }
  }}
  onNativeMatch={(e) => {
    // Android-only: handy shortcut with full payload when URL matches nativeUrlRegex
    console.log('matched native URL:', e.request.url, 'status:', e.response?.status);
  }}
/> 
```

### Global native event (Android)

In addition to the component event, a global event is broadcast for robustness:

```ts
import { DeviceEventEmitter } from 'react-native';

const sub = DeviceEventEmitter.addListener('RNInterceptNative', (e: InterceptEvent | string) => {
  const full = typeof e === 'string' ? { kind: 'native', request: { url: e } } : e;
  console.log('[global native intercept]', full.request.url, full.response?.status);
});

// Remember to remove it when appropriate:
sub.remove();
```

## Troubleshooting

- __No native interception on Android__
  - The library auto-detects native view managers. If not found, it falls back to JS. Make sure Android autolinking is working and you rebuilt the app.

- __iOS differences__
  - iOS has no native implementation. The component renders a plain `View` (no web content). Interception and JS hooks are not available.

## Notes & limitations

- Android `WebView` does not expose request bodies to `shouldInterceptRequest`. For JS‑initiated requests (fetch/XHR), consider enabling `echoAllRequestsFromJS` to capture request bodies via JS hooks. Non‑JS POST bodies (e.g., form submissions) are not available to the API.
- iOS remains unchanged: only the JS fallback is available and does not provide native request interception.

## Planned features

- __Ad blocking (Android)__
  - Apply filter lists or custom rules to block network requests and hide known ad/trackers within the native WebView.
  - Likely implemented via native request interception + CSS/JS cosmetic filters.

- __Autoplay for video and iframe elements (Android)__
  - Enable autoplay for `<video>` and embedded `<iframe>` players when permitted by site and OS policies.
  - Provide prop flags to control autoplay behavior and fallbacks.

__Now available (Android)__: Full native request interception/proxying
  - The Android layer can fully proxy matching requests (via `nativeUrlRegex`), capture response metadata, and serve the proxied response back to the WebView.
  - Intercept events deliver structured payloads: `e.request` (url/method/headers/flags) and `e.response` (status/reason/headers/mime/encoding/contentLength) when proxied.
  - Use `onIntercept` for all events and `onNativeMatch` for proxied matches.

- __iOS support__
  - Implement a native iOS view with request interception and DOM/JS hooks.
  - Aim for feature parity with Android where permitted by WebKit and platform policies.

## Example app

See `example/` for a minimal app using this component. Run with the usual RN commands from that workspace.

## Contributing

- __Development workflow__: see [CONTRIBUTING.md#development-workflow](CONTRIBUTING.md#development-workflow)
- __Sending a pull request__: see [CONTRIBUTING.md#sending-a-pull-request](CONTRIBUTING.md#sending-a-pull-request)
- __Code of conduct__: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

