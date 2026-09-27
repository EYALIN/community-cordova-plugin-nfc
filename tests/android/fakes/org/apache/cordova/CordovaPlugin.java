package org.apache.cordova;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONException;
public class CordovaPlugin {
    public CordovaInterface cordova;
    protected CordovaPreferences preferences;
    public final void privateInitialize(CordovaInterface c, CordovaPreferences p) { cordova = c; preferences = p; pluginInitialize(); }
    protected void pluginInitialize() {}
    public boolean execute(String action, JSONArray args, CallbackContext cb) throws JSONException { return false; }
    public void onPause(boolean multitasking) {}
    public void onResume(boolean multitasking) {}
    public void onNewIntent(Intent intent) {}
    public void onDestroy() {}
}
