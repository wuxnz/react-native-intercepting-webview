declare module 'react-native-webview' {
  import type { ComponentType } from 'react';

  export interface WebViewProps {
    source?: { uri?: string; html?: string };
    injectedJavaScript?: string;
    injectedJavaScriptBeforeContentLoaded?: string;
    onMessage?: (e: { nativeEvent: { data?: string } }) => void;
    style?: any;
    [key: string]: any;
  }

  export const WebView: ComponentType<WebViewProps>;
  export default WebView;
}
