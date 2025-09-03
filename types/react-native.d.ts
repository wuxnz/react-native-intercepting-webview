declare module 'react-native' {
  import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react';

  // Minimal surface to satisfy our d.ts build. These are intentionally loose.
  export type ViewStyle = any;
  export type StyleProp<T> = any;
  export type NativeSyntheticEvent<T = any> = { nativeEvent: T };
  export interface ViewProps { style?: any }
  export const View: ForwardRefExoticComponent<ViewProps & RefAttributes<any>>;

  export const DeviceEventEmitter: {
    addListener(eventType: string, listener: (...args: any[]) => any): { remove(): void };
  };
  export const Platform: { OS: 'ios' | 'android' | 'windows' | 'macos' | 'web' };
  export const UIManager: any;
  export function requireNativeComponent<T = any>(name: string): ForwardRefExoticComponent<any & RefAttributes<any>> & T;
  export function codegenNativeComponent<T = any>(name: string): ForwardRefExoticComponent<any & RefAttributes<any>> & T;
}
