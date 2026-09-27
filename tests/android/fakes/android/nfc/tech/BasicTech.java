package android.nfc.tech;
import android.nfc.Tag;
import java.io.IOException;
/** Shared behaviour of the fake technologies (mirrors android.nfc.tech.BasicTagTechnology). */
public abstract class BasicTech implements TagTechnology {
    /** Hands every raw command to the test; throw IOException / TagLostException to simulate failures. */
    public interface Transceiver { byte[] transceive(byte[] cmd) throws IOException; }
    protected final Tag tag;
    protected boolean connected;
    public IOException failConnect;
    public Transceiver transceiver;
    public int timeout = -1;
    public int connectCount;
    protected BasicTech(Tag tag) { this.tag = tag; }
    public Tag getTag() { return tag; }
    public void connect() throws IOException {
        tag.checkStale();
        if (failConnect != null) { throw failConnect; }
        tag.setConnectedTechnology(this);
        connected = true; connectCount++;
    }
    public void close() throws IOException {
        try { tag.checkStale(); } finally { connected = false; tag.setTechnologyDisconnected(this); }
    }
    public boolean isConnected() { return connected; }
    /** Test helper: the field left the RF field; the framework reports not-connected. */
    public void simulateLost() { connected = false; }
    protected void checkConnected() {
        if (!connected || tag.connectedTech != this) { throw new IllegalStateException("Call connect() first!"); }
    }
    public byte[] transceive(byte[] data) throws IOException {
        checkConnected(); tag.checkStale();
        if (transceiver == null) { throw new IOException("Transceive failed"); }
        return transceiver.transceive(data);
    }
    public int getMaxTransceiveLength() { return 253; }
    public void setTimeout(int t) { timeout = t; }
    public int getTimeout() { return timeout; }
}
