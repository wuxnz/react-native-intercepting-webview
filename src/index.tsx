import InterceptWebView from './InterceptWebView';
import InterceptingWebview from './NativeInterceptingWebview';

export function multiply(a: number, b: number): number {
  return InterceptingWebview.multiply(a, b);
}

export default InterceptWebView;
export { InterceptWebView };
