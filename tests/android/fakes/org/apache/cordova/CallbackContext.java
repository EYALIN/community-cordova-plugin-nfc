package org.apache.cordova;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
/** Records every result; a second result after a final one is a protocol violation. */
public class CallbackContext {
    public final String id;
    public final List<PluginResult> results = new ArrayList<>();
    public int violations;
    private boolean finished;
    public CallbackContext(String id) { this.id = id; }
    public String getCallbackId() { return id; }
    public boolean isFinished() { return finished; }
    public synchronized void sendPluginResult(PluginResult r) {
        if (finished) { violations++; return; }
        results.add(r);
        finished = !r.getKeepCallback();
    }
    public void success() { sendPluginResult(new PluginResult(PluginResult.Status.OK)); }
    public void success(String m) { sendPluginResult(new PluginResult(PluginResult.Status.OK, m)); }
    public void success(int m) { sendPluginResult(new PluginResult(PluginResult.Status.OK, m)); }
    public void success(JSONObject m) { sendPluginResult(new PluginResult(PluginResult.Status.OK, m)); }
    public void success(JSONArray m) { sendPluginResult(new PluginResult(PluginResult.Status.OK, m)); }
    public void success(byte[] m) { sendPluginResult(new PluginResult(PluginResult.Status.OK, m)); }
    public void error(String m) { sendPluginResult(new PluginResult(PluginResult.Status.ERROR, m)); }
    public void error(JSONObject m) { sendPluginResult(new PluginResult(PluginResult.Status.ERROR, m)); }
    public void error(int m) { sendPluginResult(new PluginResult(PluginResult.Status.ERROR, m)); }
    public PluginResult last() { return results.isEmpty() ? null : results.get(results.size() - 1); }
}
