import { codegenNativeComponent, type ViewProps } from 'react-native';

/**
 * Props for the generated native component `InterceptingWebviewView`.
 * This is currently a placeholder for potential native props.
 */
export interface NativeProps extends ViewProps {
  /** Example prop to demonstrate typing expansion. */
  color?: string;
}

/**
 * Codegen wrapper for the native view. Not exported publicly from the package
 * root; used internally by the library if/when needed.
 */
export default codegenNativeComponent<NativeProps>('InterceptingWebviewView');
