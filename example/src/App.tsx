import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { InterceptingWebView } from 'react-native-intercepting-webview';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>InterceptingWebView Demo (Android-only)</Text>
        <Text style={styles.subtitle}>
          Open the console/logcat to see intercepted URLs.
        </Text>
      </View>
      <View style={styles.body}>
        <InterceptingWebView
          style={styles.webview}
          source={{ uri: 'https://news.ycombinator.com' }}
          nativeUrlRegex={
            String(/(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i)
          }
          aggressiveDomHooking
          echoAllRequestsFromJS={false}
          onIntercept={(e) => {
            // eslint-disable-next-line no-console
            console.log('[Example] onIntercept:', e);
          }}
          onNativeMatch={(url) => {
            // eslint-disable-next-line no-console
            console.log('[Example] onNativeMatch:', url);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 4 },
  body: { flex: 1 },
  webview: { flex: 1 },
});
