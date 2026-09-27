package android.nfc.tech;
import android.nfc.Tag;
public final class NfcA extends BasicTech {
    public NfcA(Tag t) { super(t); }
    public static NfcA get(Tag t) { return t.nfcA; }
}
