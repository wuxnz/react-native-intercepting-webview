import * as React from 'react';
import {WebViewProps} from 'react-native-webview';

export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch';
  userAgent?: string;
};

export type InterceptProps = WebViewProps & {
  onIntercept?: (e: InterceptEvent) => void;
  onNativeMatch?: (url: string) => void;
  nativeUrlRegex?: string;
  aggressiveDomHooking?: boolean;
  echoAllRequestsFromJS?: boolean;
};

declare const InterceptWebView: React.FC<InterceptProps>;

export default InterceptWebView;
export {InterceptWebView, InterceptEvent, InterceptProps};
