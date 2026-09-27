package android.nfc.tech;
import android.nfc.FormatException;
import android.nfc.NdefMessage;
import android.nfc.Tag;
import java.io.IOException;
public final class NdefFormatable extends BasicTech {
    public NdefMessage formatted; public IOException failFormat;
    public NdefFormatable(Tag t) { super(t); }
    public static NdefFormatable get(Tag t) { return t.formatable; }
    public void format(NdefMessage m) throws IOException, FormatException {
        checkConnected(); tag.checkStale();
        if (failFormat != null) { throw failFormat; }
        formatted = m;
    }
}
