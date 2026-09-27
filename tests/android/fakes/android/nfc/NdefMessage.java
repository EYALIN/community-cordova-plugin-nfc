package android.nfc;
import android.os.Parcelable;
public final class NdefMessage implements Parcelable {
    private final NdefRecord[] records;
    public NdefMessage(NdefRecord[] records) { this.records = records; }
    public NdefRecord[] getRecords() { return records; }
    public byte[] toByteArray() {
        int n = 0;
        for (NdefRecord r : records) { n += 3 + r.getType().length + r.getId().length + r.getPayload().length; }
        return new byte[n];
    }
}
