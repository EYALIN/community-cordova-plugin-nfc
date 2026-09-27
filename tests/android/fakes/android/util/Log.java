package android.util;

/** Test fake: prints nothing unless NFC_TEST_VERBOSE is set. */
public final class Log {
    private static final boolean V = System.getenv("NFC_TEST_VERBOSE") != null;
    private static int p(String l, String t, String m, Throwable e) {
        if (V) { System.out.println("  [" + l + "/" + t + "] " + m + (e != null ? " :: " + e : "")); }
        return 0;
    }
    public static int d(String t, String m) { return p("D", t, m, null); }
    public static int i(String t, String m) { return p("I", t, m, null); }
    public static int w(String t, String m) { return p("W", t, m, null); }
    public static int w(String t, String m, Throwable e) { return p("W", t, m, e); }
    public static int e(String t, String m) { return p("E", t, m, null); }
    public static int e(String t, String m, Throwable e) { return p("E", t, m, e); }
    public static int wtf(String t, String m) { return p("F", t, m, null); }
}
