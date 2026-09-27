package android.nfc;
import android.os.Parcelable;
public final class NdefRecord implements Parcelable {
    public static final short TNF_EMPTY = 0x00;
    public static final short TNF_WELL_KNOWN = 0x01;
    private final short tnf; private final byte[] type, id, payload;
    public NdefRecord(short tnf, byte[] type, byte[] id, byte[] payload) {
        this.tnf = tnf; this.type = type; this.id = id; this.payload = payload;
    }
    public short getTnf() { return tnf; }
    public byte[] getType() { return type; }
    public byte[] getId() { return id; }
    public byte[] getPayload() { return payload; }
}
