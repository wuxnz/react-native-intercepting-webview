/**
 * Prevent the React Native CLI autolinking step from scanning the repository's
 * example android/ and ios/ app directories when this package is installed
 * directly (for example from a git URL or local path). This project contains
 * an example app / full `android/` app directory and that can confuse the CLI
 * which expects a library-style native folder with a proper package namespace.
 *
 * We intentionally disable autolinking for platforms here to avoid build
 * failures in host apps. Consumers should install the peer dependency
 * 'react-native-webview' and follow the installation instructions in the README.
 *
 * If you later refactor this repository to export a library-style android/ and
 * ios/ directory (with proper Gradle and Podspec configuration), remove this
 * file so autolinking can pick up the native modules automatically.
 */
module.exports = {
  dependency: {
    platforms: {
      android: null,
      ios: null,
    },
  },
};
