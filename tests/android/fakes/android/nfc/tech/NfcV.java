package android.nfc.tech;
import android.nfc.Tag;
public final class NfcV extends BasicTech {
    public NfcV(Tag t) { super(t); }
    public static NfcV get(Tag t) { return t.nfcV; }
}
