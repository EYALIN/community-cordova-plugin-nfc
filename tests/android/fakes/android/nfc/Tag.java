package android.nfc;
import android.nfc.tech.IsoDep;
import android.nfc.tech.MifareClassic;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.nfc.tech.NfcA;
import android.nfc.tech.NfcV;
import android.os.Parcelable;
/**
 * Test fake of android.nfc.Tag. Mirrors the two framework behaviours the plugin trips over:
 * only ONE technology may be connected at a time ("Close other technology first!", an
 * IllegalStateException from Tag.setConnectedTechnology), and a tag whose handle has expired
 * throws SecurityException("... is out of date") from every service call.
 */
public final class Tag implements Parcelable {
    private final byte[] id; private final String[] techs;
    public Ndef ndef; public NdefFormatable formatable; public NfcA nfcA; public NfcV nfcV;
    public MifareClassic mifareClassic; public IsoDep isoDep;
    public boolean stale;
    public Object connectedTech;
    public final String name;
    public Tag(String name, byte[] id, String... techs) { this.name = name; this.id = id; this.techs = techs; }
    public byte[] getId() { return id; }
    public String[] getTechList() { return techs; }
    public void checkStale() {
        if (stale) { throw new SecurityException("Permission Denial: Tag ( ID: " + name + " ) is out of date"); }
    }
    public void setConnectedTechnology(Object tech) {
        if (connectedTech != null) { throw new IllegalStateException("Close other technology first!"); }
        connectedTech = tech;
    }
    public void setTechnologyDisconnected(Object tech) { if (connectedTech == tech) { connectedTech = null; } }
    @Override public String toString() { return "Tag(" + name + ")"; }
}
