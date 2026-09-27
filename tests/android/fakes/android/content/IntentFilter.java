package android.content;
import java.util.ArrayList;
import java.util.List;
public class IntentFilter {
    private final List<String> actions = new ArrayList<>();
    private final List<String> types = new ArrayList<>();
    public static class MalformedMimeTypeException extends Exception {
        public MalformedMimeTypeException(String m) { super(m); }
    }
    public IntentFilter() {}
    public IntentFilter(String action) { if (action != null) { actions.add(action); } }
    public void addAction(String a) { actions.add(a); }
    public int countActions() { return actions.size(); }
    public String getAction(int i) { return actions.get(i); }
    public boolean matchAction(String a) { return actions.contains(a); }
    public void addDataType(String t) throws MalformedMimeTypeException {
        if (t == null || !t.contains("/")) { throw new MalformedMimeTypeException(t); }
        types.add(t);
    }
    public int countDataTypes() { return types.size(); }
    public String getDataType(int i) { return i < types.size() ? types.get(i) : null; }
}
