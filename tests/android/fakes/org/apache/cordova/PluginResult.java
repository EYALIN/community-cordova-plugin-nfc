package org.apache.cordova;
import java.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
public class PluginResult {
    public enum Status { NO_RESULT, OK, CLASS_NOT_FOUND_EXCEPTION, ILLEGAL_ACCESS_EXCEPTION, INSTANTIATION_EXCEPTION, MALFORMED_URL_EXCEPTION, IO_EXCEPTION, INVALID_ACTION, JSON_EXCEPTION, ERROR }
    public final Status status; public final Object message; private boolean keep;
    public PluginResult(Status s) { this(s, (Object) null); }
    private PluginResult(Status s, Object m) { status = s; message = m; }
    public PluginResult(Status s, String m) { this(s, (Object) m); }
    public PluginResult(Status s, JSONObject m) { this(s, (Object) m); }
    public PluginResult(Status s, JSONArray m) { this(s, (Object) m); }
    public PluginResult(Status s, int m) { this(s, (Object) m); }
    public PluginResult(Status s, boolean m) { this(s, (Object) m); }
    public PluginResult(Status s, byte[] m) { this(s, (Object) ("base64:" + Base64.getEncoder().encodeToString(m))); }
    public void setKeepCallback(boolean b) { keep = b; }
    public boolean getKeepCallback() { return keep; }
    public int getStatus() { return status.ordinal(); }
    @Override public String toString() { return status + (keep ? "(keep)" : "") + ":" + message; }
}
