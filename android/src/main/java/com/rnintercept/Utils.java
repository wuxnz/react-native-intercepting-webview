package com.rnintercept;

/**
 * Utility helpers used by the native Android library.
 */
public class Utils {
    /**
     * Escape a string so it can be safely embedded inside a JavaScript double-quoted string literal.
     * Replaces backslashes, double quotes, newlines, carriage returns, tabs and control characters.
     */
    public static String sanitizeForJs(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\':
                    sb.append("\\\\");
                    break;
                case '"':
                    sb.append("\\\"");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        // Control characters and JS line/paragraph separators: use unicode escape
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}