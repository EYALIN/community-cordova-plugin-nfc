package org.apache.cordova;
import java.util.Base64;
import org.json.JSONArray;
import org.json.JSONException;
public class CordovaArgs {
    private final JSONArray a;
    public CordovaArgs(JSONArray a) { this.a = a; }
    /** Cordova sends an ArrayBuffer argument as a base64 string. */
    public byte[] getArrayBuffer(int i) throws JSONException { return Base64.getDecoder().decode(a.getString(i)); }
}
