package android.nfc.tech;
import android.nfc.FormatException;
import android.nfc.NdefMessage;
import android.nfc.Tag;
import java.io.IOException;
public final class Ndef extends BasicTech {
    public static final String NFC_FORUM_TYPE_1 = "org.nfcforum.ndef.type1";
    public static final String NFC_FORUM_TYPE_2 = "org.nfcforum.ndef.type2";
    public static final String NFC_FORUM_TYPE_3 = "org.nfcforum.ndef.type3";
    public static final String NFC_FORUM_TYPE_4 = "com.nxp.ndef.type4";
    public boolean writable = true, canMakeRO = true;
    public int maxSize = 492;
    public NdefMessage cached, written;
    public IOException failWrite; public RuntimeException failWriteRuntime;
    public IOException failMakeReadOnly; public RuntimeException failMakeReadOnlyRuntime;
    public int writes;
    public Ndef(Tag t) { super(t); }
    public static Ndef get(Tag t) { return t.ndef; }
    public String getType() { return NFC_FORUM_TYPE_2; }
    public int getMaxSize() { return maxSize; }
    public boolean isWritable() { return writable; }
    public NdefMessage getCachedNdefMessage() { return cached; }
    public boolean canMakeReadOnly() { return canMakeRO; }
    public void writeNdefMessage(NdefMessage m) throws IOException, FormatException {
        checkConnected(); tag.checkStale();
        if (failWrite != null) { throw failWrite; }
        if (failWriteRuntime != null) { throw failWriteRuntime; }
        written = m; writes++;
    }
    public boolean makeReadOnly() throws IOException {
        checkConnected(); tag.checkStale();
        if (failMakeReadOnly != null) { throw failMakeReadOnly; }
        if (failMakeReadOnlyRuntime != null) { throw failMakeReadOnlyRuntime; }
        writable = false; return true;
    }
}
