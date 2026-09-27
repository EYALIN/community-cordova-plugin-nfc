package org.apache.cordova;
import android.app.Activity;
import java.util.concurrent.ExecutorService;
public interface CordovaInterface {
    Activity getActivity();
    ExecutorService getThreadPool();
}
