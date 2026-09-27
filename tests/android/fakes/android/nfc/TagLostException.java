package android.nfc;
import java.io.IOException;
public class TagLostException extends IOException {
    public TagLostException() { super(); }
    public TagLostException(String m) { super(m); }
}
