package android.app;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
public class Activity extends Context {
    /** Every exception that escaped a UI-thread or thread-pool runnable: on a device each one is a crash. */
    public static final List<Throwable> CRASHES = new ArrayList<>();
    private Intent intent = new Intent(Intent.ACTION_MAIN);
    public boolean finishing;
    public final List<Intent> started = new ArrayList<>();
    public final Set<String> unavailableActions = new HashSet<>();
    public Intent getIntent() { return intent; }
    public void setIntent(Intent i) { intent = i; }
    public boolean isFinishing() { return finishing; }
    public void runOnUiThread(Runnable r) {
        try { r.run(); } catch (Throwable t) { CRASHES.add(t); }
    }
    @Override public void startActivity(Intent i) {
        if (i.getAction() != null && unavailableActions.contains(i.getAction())) {
            throw new ActivityNotFoundException("No Activity found to handle " + i);
        }
        started.add(i);
    }
}
