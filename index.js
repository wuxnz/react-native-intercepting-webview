/**
 * Entry point for react-native-intercepting-webview
 *
 * Exports:
 *  - default: InterceptWebView (React component)
 *  - named: InterceptWebView
 *
 * This file provides a CommonJS-compatible entry so consumers can:
 *   const InterceptWebView = require('react-native-intercepting-webview');
 * or
 *   import InterceptWebView, { InterceptWebView as Named } from 'react-native-intercepting-webview';
 */
const mod = require('./src/intercepting-webview/index');
const InterceptWebView = mod && (mod.InterceptWebView || mod.default || mod);

// Default export (CommonJS)
module.exports = InterceptWebView;

// Named export
module.exports.InterceptWebView = InterceptWebView;
module.exports.default = InterceptWebView;
