package org.apache.cordova;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
public class CordovaPreferences {
    private final Map<String, String> prefs = new HashMap<>();
    public void set(String name, String value) { prefs.put(name.toLowerCase(Locale.ENGLISH), value); }
    public String getString(String name, String d) { String v = prefs.get(name.toLowerCase(Locale.ENGLISH)); return v != null ? v : d; }
    public boolean getBoolean(String name, boolean d) { String v = prefs.get(name.toLowerCase(Locale.ENGLISH)); return v != null ? Boolean.parseBoolean(v) : d; }
    public int getInteger(String name, int d) { String v = prefs.get(name.toLowerCase(Locale.ENGLISH)); return v != null ? Integer.parseInt(v) : d; }
}
