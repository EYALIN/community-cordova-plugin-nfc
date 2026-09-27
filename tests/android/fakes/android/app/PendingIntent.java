package android.app;
import android.content.Context;
import android.content.Intent;
public class PendingIntent {
    public static final int FLAG_MUTABLE = 0x02000000;
    public static final int FLAG_IMMUTABLE = 0x04000000;
    public final Intent intent; public final int flags;
    private PendingIntent(Intent i, int f) { intent = i; flags = f; }
    public static PendingIntent getActivity(Context c, int req, Intent i, int flags) { return new PendingIntent(i, flags); }
}
