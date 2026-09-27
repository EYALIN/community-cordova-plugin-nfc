package android.nfc.tech;
import android.nfc.Tag;
import java.io.Closeable;
import java.io.IOException;
public interface TagTechnology extends Closeable {
    Tag getTag();
    void connect() throws IOException;
    void close() throws IOException;
    boolean isConnected();
}
