package android.content;
import java.util.ArrayList;
import java.util.List;
public class Context {
    public static final int RECEIVER_EXPORTED = 0x2;
    public static final int RECEIVER_NOT_EXPORTED = 0x4;
    public final List<BroadcastReceiver> receivers = new ArrayList<>();
    public final List<IntentFilter> receiverFilters = new ArrayList<>();
    public int lastReceiverFlags = -1;
    public Context getApplicationContext() { return this; }
    public Intent registerReceiver(BroadcastReceiver r, IntentFilter f) { receivers.add(r); receiverFilters.add(f); return null; }
    public Intent registerReceiver(BroadcastReceiver r, IntentFilter f, int flags) { lastReceiverFlags = flags; return registerReceiver(r, f); }
    public void unregisterReceiver(BroadcastReceiver r) {
        int i = receivers.indexOf(r);
        if (i < 0) { throw new IllegalArgumentException("Receiver not registered: " + r); }
        receivers.remove(i); receiverFilters.remove(i);
    }
    /** Test helper: deliver a broadcast to every registered receiver whose filter matches. */
    public void broadcast(Intent intent) {
        for (int i = 0; i < new ArrayList<>(receivers).size(); i++) {
            if (receiverFilters.get(i).matchAction(intent.getAction())) { receivers.get(i).onReceive(this, intent); }
        }
    }
    public void startActivity(Intent intent) {}
}
