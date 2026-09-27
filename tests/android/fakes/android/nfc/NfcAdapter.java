package android.nfc;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.IntentFilter;
import android.os.Bundle;
public final class NfcAdapter {
    public static final String ACTION_NDEF_DISCOVERED = "android.nfc.action.NDEF_DISCOVERED";
    public static final String ACTION_TECH_DISCOVERED = "android.nfc.action.TECH_DISCOVERED";
    public static final String ACTION_TAG_DISCOVERED = "android.nfc.action.TAG_DISCOVERED";
    public static final String ACTION_ADAPTER_STATE_CHANGED = "android.nfc.action.ADAPTER_STATE_CHANGED";
    public static final String EXTRA_ADAPTER_STATE = "android.nfc.extra.ADAPTER_STATE";
    public static final String EXTRA_TAG = "android.nfc.extra.TAG";
    public static final String EXTRA_NDEF_MESSAGES = "android.nfc.extra.NDEF_MESSAGES";
    public static final String EXTRA_READER_PRESENCE_CHECK_DELAY = "presence";
    public static final int FLAG_READER_NFC_A = 0x1, FLAG_READER_SKIP_NDEF_CHECK = 0x80;
    public static final int STATE_OFF = 1, STATE_TURNING_ON = 2, STATE_ON = 3, STATE_TURNING_OFF = 4;
    public interface ReaderCallback { void onTagDiscovered(Tag tag); }

    public static NfcAdapter instance = new NfcAdapter();
    public boolean enabled = true;
    public boolean dispatchEnabled; public int dispatchCalls;
    public IntentFilter[] lastFilters; public String[][] lastTechLists; public boolean lastWasNull;
    public ReaderCallback readerCallback; public int readerFlags; public Bundle readerExtras;

    public static NfcAdapter getDefaultAdapter(Context c) { return instance; }
    public boolean isEnabled() { return enabled; }
    public void enableForegroundDispatch(Activity a, PendingIntent p, IntentFilter[] f, String[][] t) {
        if (p == null) { throw new NullPointerException("pendingIntent"); }
        if (t != null && t.length > 0 && (f == null || f.length == 0)) { throw new IllegalArgumentException("techLists need filters"); }
        dispatchEnabled = true; dispatchCalls++; lastFilters = f; lastTechLists = t; lastWasNull = (f == null && t == null);
    }
    public void disableForegroundDispatch(Activity a) { dispatchEnabled = false; }
    public void enableReaderMode(Activity a, ReaderCallback cb, int flags, Bundle extras) { readerCallback = cb; readerFlags = flags; readerExtras = extras; }
    public void disableReaderMode(Activity a) { readerCallback = null; }
}
