# react-native-intercepting-webview

Android‑first WebView with native request interception and rich JS hooks. On iOS or when the native view is unavailable, the component renders a plain `View` (no web content is displayed).

This library lets you observe network requests initiated inside the WebView (e.g., HLS/DASH manifests, media segments, XHR/fetch) and DOM activity, and react to them from React Native.

Key points:

- Native (Android) emits an intercept event for every request.
- `nativeUrlRegex` is used solely to trigger `onNativeMatch`; it does not filter `onIntercept`.
- A global fallback event is also emitted via `DeviceEventEmitter` with the name `RNInterceptNative`.

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
        // Receive all intercept events (native or JS)
        onIntercept={(e) => {
          console.log('[intercept]', e.kind, e.url);
        }}
        // When a native URL matches, invoke this callback
        onNativeMatch={(url) => {
          console.log('[native match]', url);
        }}
        // Optional (Android): regex used ONLY for onNativeMatch (not for filtering onIntercept)
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
export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  userAgent?: string;
};

export type InterceptSource =
  | { uri: string }
  | { html: string };

export type InterceptProps = {
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  source: InterceptSource;                    // Android native view only
  onIntercept?: (e: InterceptEvent) => void;  // native and JS-originated events
  onNativeMatch?: (url: string) => void;      // Android only helper
  nativeUrlRegex?: string;                    // Android only; used ONLY for onNativeMatch
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

- __`onIntercept`__: Called for every intercepted event coming from native or JS. Payload is `InterceptEvent`. Not filtered by `nativeUrlRegex`.
- __`onNativeMatch` (Android)__: Convenience callback fired when a native URL matches `nativeUrlRegex`.
- __`nativeUrlRegex` (Android)__: Case‑insensitive regex string used only for `onNativeMatch`. Defaults to a media‑focused regex (m3u8, mp4, webm, mpd, ts) via `buildDefaultVideoRegex()`.
- __`filterRegexes` (Android)__: Additional native filtering (reserved for parity; may be ignored).
- __`aggressiveDomHooking` (Android)__: When true, the injected script watches the DOM for new `<video>`, `<source>`, `<iframe>` and posts events.
- __`echoAllRequestsFromJS` (Android)__: When true, proxies JS `fetch`/`XMLHttpRequest` to RN via `postMessage`.
- __`forceFallback`__: Force the plain `View` path even on Android (helpful for debugging).

#### Events

`onIntercept(e: InterceptEvent)`:

- __`e.url`__: The URL detected.
- __`e.kind`__: One of `native | dom | video | xhr | fetch | perf`.
- __`e.userAgent?`__: Optional UA if available.

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
    if (e.kind === 'native' || e.kind === 'video') {
      // e.g., detect HLS playlist or media segment
      console.log('media request:', e.url);
    }
  }}
  onNativeMatch={(url) => {
    // Android-only: handy shortcut when URL matches nativeUrlRegex
    console.log('matched native URL:', url);
  }}
/> 
```

### Global native event (Android)

In addition to the component event, a global event is broadcast for robustness:

```ts
import { DeviceEventEmitter } from 'react-native';

const sub = DeviceEventEmitter.addListener('RNInterceptNative', (url: string) => {
  console.log('[global native intercept]', url);
});

// Remember to remove it when appropriate:
sub.remove();
```

## Troubleshooting

- __No native interception on Android__
  - The library auto-detects native view managers. If not found, it falls back to JS. Make sure Android autolinking is working and you rebuilt the app.

- __iOS differences__
  - iOS has no native implementation. The component renders a plain `View` (no web content). Interception and JS hooks are not available.

## Planned features

- __Ad blocking (Android)__
  - Apply filter lists or custom rules to block network requests and hide known ad/trackers within the native WebView.
  - Likely implemented via native request interception + CSS/JS cosmetic filters.

- __Autoplay for video and iframe elements (Android)__
  - Enable autoplay for `<video>` and embedded `<iframe>` players when permitted by site and OS policies.
  - Provide prop flags to control autoplay behavior and fallbacks.

- __Intercepting headers (Android)__
  - Inspect and optionally modify request headers and response headers for matching URLs.
  - Expose safe hooks to view headers via `onIntercept` payload extensions.

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

