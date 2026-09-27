package android.content;
import android.net.Uri;
import android.os.Parcelable;
import java.util.HashMap;
import java.util.Map;
public class Intent implements Parcelable {
    public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;
    public static final int FLAG_ACTIVITY_SINGLE_TOP = 0x20000000;
    public static final int FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;
    public static final int FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY = 0x00100000;
    public static final String ACTION_MAIN = "android.intent.action.MAIN";
    public static final String ACTION_VIEW = "android.intent.action.VIEW";
    private String action;
    private Uri data;
    private int flags;
    private final Map<String, Object> extras = new HashMap<>();
    public Class<?> component;
    public Intent() {}
    public Intent(String action) { this.action = action; }
    public Intent(String action, Uri data) { this.action = action; this.data = data; }
    public Intent(Context c, Class<?> cls) { this.component = cls; }
    public String getAction() { return action; }
    public Intent setAction(String a) { action = a; return this; }
    public Uri getData() { return data; }
    public Intent addFlags(int f) { flags |= f; return this; }
    public Intent setFlags(int f) { flags = f; return this; }
    public int getFlags() { return flags; }
    @SuppressWarnings("unchecked")
    public <T extends Parcelable> T getParcelableExtra(String name) { return (T) extras.get(name); }
    public Parcelable[] getParcelableArrayExtra(String name) { return (Parcelable[]) extras.get(name); }
    public Intent putExtra(String name, Parcelable v) { extras.put(name, v); return this; }
    public Intent putExtra(String name, Parcelable[] v) { extras.put(name, v); return this; }
    public Intent putExtra(String name, int v) { extras.put(name, v); return this; }
    public int getIntExtra(String name, int d) { Object v = extras.get(name); return v instanceof Integer ? (Integer) v : d; }
    public boolean hasExtra(String name) { return extras.containsKey(name); }
    @Override public String toString() { return "Intent{" + action + (data != null ? " " + data : "") + "}"; }
}
