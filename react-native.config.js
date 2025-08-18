/**
 * react-native.config.js for this package.
 *
 * The Android native implementation lives in ./android (library-style module).
 * iOS is intentionally left empty until an iOS Podspec is provided.
 *
 * Consumers should install the peer dependency 'react-native-webview' in the host app.
 */
module.exports = {
  dependency: {
    platforms: {
      // We provide Android native code in ./android
      android: {
        sourceDir: './android',
      },
      // iOS module is not implemented yet
      ios: null,
    },
  },
};
