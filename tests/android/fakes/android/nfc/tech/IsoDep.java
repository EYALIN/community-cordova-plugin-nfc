package android.nfc.tech;
import android.nfc.Tag;
public final class IsoDep extends BasicTech {
    public IsoDep(Tag t) { super(t); }
    public static IsoDep get(Tag t) { return t.isoDep; }
}
