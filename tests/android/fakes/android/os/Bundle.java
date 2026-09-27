package android.os;
import java.util.HashMap;
import java.util.Map;
public class Bundle {
    public final Map<String, Object> values = new HashMap<>();
    public void putInt(String k, int v) { values.put(k, v); }
    public int getInt(String k, int d) { Object v = values.get(k); return v instanceof Integer ? (Integer) v : d; }
    public boolean containsKey(String k) { return values.containsKey(k); }
}
