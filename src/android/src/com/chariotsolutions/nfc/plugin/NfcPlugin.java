package com.chariotsolutions.nfc.plugin;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Iterator;
import java.util.List;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.IntentFilter.MalformedMimeTypeException;
import android.nfc.FormatException;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.TagLostException;
import android.nfc.tech.Ndef;
import android.nfc.tech.MifareClassic;
import android.nfc.tech.NdefFormatable;
import android.nfc.tech.TagTechnology;
import android.os.Bundle;
import android.os.Parcelable;
import android.util.Log;

public class NfcPlugin extends CordovaPlugin {
    private static final String REGISTER_MIME_TYPE = "registerMimeType";
    private static final String REMOVE_MIME_TYPE = "removeMimeType";
    private static final String REGISTER_NDEF = "registerNdef";
    private static final String REMOVE_NDEF = "removeNdef";
    private static final String REGISTER_NDEF_FORMATABLE = "registerNdefFormatable";
    private static final String REGISTER_DEFAULT_TAG = "registerTag";
    private static final String REMOVE_DEFAULT_TAG = "removeTag";
    private static final String WRITE_TAG = "writeTag";
    private static final String MAKE_READ_ONLY = "makeReadOnly";
    private static final String ERASE_TAG = "eraseTag";
    private static final String SHARE_TAG = "shareTag";
    private static final String UNSHARE_TAG = "unshareTag";
    private static final String HANDOVER = "handover"; // Android Beam
    private static final String STOP_HANDOVER = "stopHandover";
    private static final String ENABLED = "enabled";
    private static final String INIT = "init";
    private static final String SHOW_SETTINGS = "showSettings";

    private static final String NDEF = "ndef";
    private static final String NDEF_MIME = "ndef-mime";
    private static final String NDEF_FORMATABLE = "ndef-formatable";
    private static final String TAG_DEFAULT = "tag";

    private static final String READER_MODE = "readerMode";
    private static final String DISABLE_READER_MODE = "disableReaderMode";

    private static final String CONNECT = "connect";
    private static final String CLOSE = "close";
    private static final String TRANSCEIVE = "transceive";

    // 1.8.0
    private static final String REGISTER_STATE_CHANGE = "registerStateChange";
    private static final String REMOVE_STATE_CHANGE = "removeStateChange";
    private static final String MIFARE_CLASSIC_AUTHENTICATE = "mifareClassicAuthenticate";
    private static final String MIFARE_CLASSIC_READ_BLOCK = "mifareClassicReadBlock";
    private static final String MIFARE_CLASSIC_INFO = "mifareClassicInfo";
    private volatile TagTechnology tagTechnology = null;
    private volatile Class<?> tagTechnologyClass;

    private static final String CHANNEL = "channel";

    private static final String STATUS_NFC_OK = "NFC_OK";
    private static final String STATUS_NO_NFC = "NO_NFC";
    private static final String STATUS_NFC_DISABLED = "NFC_DISABLED";
    private static final String STATUS_NDEF_PUSH_DISABLED = "NDEF_PUSH_DISABLED";

    // Error codes. Every native error reaches JS as {code, message}; www/phonegap-nfc.js turns it
    // back into the legacy message string unless the app opted in with nfc.useErrorObjects(true).
    static final String ERR_TAG_LOST = "TAG_LOST";
    static final String ERR_TAG_STALE = "TAG_STALE";
    static final String ERR_IO = "IO_ERROR";
    static final String ERR_FORMAT = "FORMAT_ERROR";
    static final String ERR_ILLEGAL_STATE = "ILLEGAL_STATE";
    static final String ERR_NO_TAG = "NO_TAG";
    static final String ERR_NOT_CONNECTED = "NOT_CONNECTED";
    static final String ERR_UNSUPPORTED_TECH = "UNSUPPORTED_TECH";
    static final String ERR_READ_ONLY = "READ_ONLY";
    static final String ERR_CAPACITY = "CAPACITY_EXCEEDED";
    static final String ERR_NOT_NDEF = "NOT_NDEF";
    static final String ERR_INVALID_ARGUMENT = "INVALID_ARGUMENT";
    static final String ERR_NOT_SUPPORTED = "NOT_SUPPORTED";
    static final String ERR_AUTH_FAILED = "AUTH_FAILED";
    static final String ERR_UNKNOWN = "UNKNOWN";

    private static final String TAG = "NfcPlugin";
    private final List<IntentFilter> intentFilters = new ArrayList<>();
    private final ArrayList<String[]> techLists = new ArrayList<>();

    private PendingIntent pendingIntent = null;

    // The most recent tag seen by ANY path: foreground dispatch (onNewIntent), reader mode, or the
    // intent that launched the app. Newest wins; write/erase/makeReadOnly/connect all use it.
    private volatile Tag lastTag = null;

    private volatile CallbackContext readerModeCallback;
    private volatile CallbackContext stateChangeCallback;
    private BroadcastReceiver stateChangeReceiver;
    private Context stateChangeContext;
    private CallbackContext channelCallback;

    private PostponedPluginResult postponedPluginResult = null;

    class PostponedPluginResult {
        private Date moment;
        private PluginResult pluginResult;

        PostponedPluginResult(Date moment, PluginResult pluginResult) {
            this.moment = moment;
            this.pluginResult = pluginResult;
        }

        boolean isValid() {
            return this.moment.after(new Date(new Date().getTime() - 30000));
        }
    }

    @Override
    public boolean execute(String action, JSONArray data, CallbackContext callbackContext) throws JSONException {
        Log.d(TAG, "execute " + action);

        if (action.equalsIgnoreCase(SHOW_SETTINGS)) {
            showSettings(callbackContext);
            return true;
        }

        if (action.equalsIgnoreCase(CHANNEL)) {
            channelCallback = callbackContext;
            if (postponedPluginResult != null) {
                Log.i(TAG, "Postponed plugin result available");

                if (postponedPluginResult.isValid()) {
                    Log.i(TAG, "Postponed plugin result is valid, resending it now");
                    channelCallback.sendPluginResult(postponedPluginResult.pluginResult);
                } else {
                    Log.i(TAG, "Postponed plugin result not valid anymore, so ignoring it");
                }

                postponedPluginResult = null;
            }
            return true;
        }

        if (action.equalsIgnoreCase(DISABLE_READER_MODE)) {
            disableReaderMode(callbackContext);
            return true;
        }

        // NFC on/off events must work while NFC is off, so these run before the status check.
        if (action.equals(REGISTER_STATE_CHANGE)) {
            registerStateChange(callbackContext);
            return true;
        }
        if (action.equals(REMOVE_STATE_CHANGE)) {
            removeStateChange();
            callbackContext.success();
            return true;
        }

        String nfcStatus = getNfcStatus();
        if (!nfcStatus.equals(STATUS_NFC_OK)) {
            sendError(callbackContext, nfcStatus, nfcStatus);
            return true;
        }

        createPendingIntent();

        switch (action) {
            case READER_MODE:
                int flags = data.getInt(0);
                readerMode(flags, data.optJSONObject(1), callbackContext);
                break;

            case MIFARE_CLASSIC_AUTHENTICATE:
                mifareClassicAuthenticate(data.getInt(0), new CordovaArgs(data).getArrayBuffer(1),
                        data.optString(2, "A"), callbackContext);
                break;

            case MIFARE_CLASSIC_READ_BLOCK:
                mifareClassicReadBlock(data.getInt(0), callbackContext);
                break;

            case MIFARE_CLASSIC_INFO:
                mifareClassicInfo(callbackContext);
                break;

            case REGISTER_MIME_TYPE:
                registerMimeType(data, callbackContext);
                break;

            case REMOVE_MIME_TYPE:
                removeMimeType(data, callbackContext);
                break;

            case REGISTER_NDEF:
                registerNdef(callbackContext);
                break;

            case REMOVE_NDEF:
                removeNdef(callbackContext);
                break;

            case REGISTER_NDEF_FORMATABLE:
                registerNdefFormatable(callbackContext);
                break;

            case REGISTER_DEFAULT_TAG:
                registerDefaultTag(callbackContext);
                break;

            case REMOVE_DEFAULT_TAG:
                removeDefaultTag(callbackContext);
                break;

            case WRITE_TAG:
                writeTag(data, callbackContext);
                break;

            case MAKE_READ_ONLY:
                makeReadOnly(callbackContext);
                break;

            case ERASE_TAG:
                eraseTag(callbackContext);
                break;

            case SHARE_TAG:
                shareTag(data, callbackContext);
                break;

            case UNSHARE_TAG:
                unshareTag(callbackContext);
                break;

            case HANDOVER:
                handover(data, callbackContext);
                break;

            case STOP_HANDOVER:
                stopHandover(callbackContext);
                break;

            case INIT:
                init(callbackContext);
                break;

            case ENABLED:
                callbackContext.success(STATUS_NFC_OK);
                break;

            case CONNECT:
                String tech = data.getString(0);
                int timeout = data.optInt(1, -1);
                connect(tech, timeout, callbackContext);
                break;

            case TRANSCEIVE:
                CordovaArgs args = new CordovaArgs(data);
                byte[] command = args.getArrayBuffer(0);
                transceive(command, callbackContext);
                break;

            case CLOSE:
                close(callbackContext);
                break;

            default:
                return false;
        }

        return true;
    }

    private String getNfcStatus() {
        NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(getActivity());
        if (nfcAdapter == null) {
            return STATUS_NO_NFC;
        } else if (!nfcAdapter.isEnabled()) {
            return STATUS_NFC_DISABLED;
        } else {
            return STATUS_NFC_OK;
        }
    }

    private void readerMode(int flags, JSONObject options, CallbackContext callbackContext) {
        Bundle extras = new Bundle();
        if (options != null && options.has("presenceCheckDelay")) {
            // ms between presence checks while a tag is in the field (NfcAdapter default ~125 ms);
            // longer delays keep slow tags connected for transceive sequences
            extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, options.optInt("presenceCheckDelay"));
        }
        readerModeCallback = callbackContext;
        getActivity().runOnUiThread(() -> {
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(getActivity());
            if (nfcAdapter != null) {
                nfcAdapter.enableReaderMode(getActivity(), callback, flags, extras);
            } else {
                sendError(callbackContext, STATUS_NO_NFC, "NFC Adapter not available");
            }
        });
    }

    private void disableReaderMode(CallbackContext callbackContext) {
        getActivity().runOnUiThread(() -> {
            readerModeCallback = null;
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(getActivity());
            if (nfcAdapter != null) {
                nfcAdapter.disableReaderMode(getActivity());
            }
            callbackContext.success();
        });
    }

    // Runs on an NFC binder thread: anything escaping here kills the app, so it is fully guarded.
    private final NfcAdapter.ReaderCallback callback = tag -> {
        CallbackContext cb = readerModeCallback;
        try {
            JSONObject json;
            List<String> techList = Arrays.asList(tag.getTechList());
            if (techList.contains(Ndef.class.getName())) {
                Ndef ndef = Ndef.get(tag);
                json = Util.ndefToJSON(ndef);
            } else {
                json = Util.tagToJSON(tag);
            }

            rememberTag(tag);
            Activity activity = getActivity();
            if (activity != null) {
                Intent tagIntent = new Intent();
                tagIntent.putExtra(NfcAdapter.EXTRA_TAG, tag);
                activity.setIntent(tagIntent);
            }

            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            result.setKeepCallback(true);
            if (cb != null) {
                cb.sendPluginResult(result);
            } else {
                Log.i(TAG, "readerModeCallback is null - reader mode probably disabled in the meantime");
            }
        } catch (Throwable t) {
            if (t instanceof VirtualMachineError) {
                throw (VirtualMachineError) t;
            }
            Log.e(TAG, "Error handling reader-mode tag", t);
            if (cb != null) {
                PluginResult error = new PluginResult(PluginResult.Status.ERROR, errorJSON(t));
                error.setKeepCallback(true);   // reader mode stays on; the next tap still arrives
                cb.sendPluginResult(error);
            }
        }
    };

    private void registerDefaultTag(CallbackContext callbackContext) {
        addTagFilter();
        restartNfc();
        callbackContext.success();
    }

    private void removeDefaultTag(CallbackContext callbackContext) {
        removeTagFilter();
        restartNfc();
        callbackContext.success();
    }

    private void registerNdefFormatable(CallbackContext callbackContext) {
        addTechList(new String[]{NdefFormatable.class.getName()});
        restartNfc();
        callbackContext.success();
    }

    private void registerNdef(CallbackContext callbackContext) {
        addTechList(new String[]{Ndef.class.getName()});
        restartNfc();
        callbackContext.success();
    }

    private void removeNdef(CallbackContext callbackContext) {
        removeTechList(new String[]{Ndef.class.getName()});
        restartNfc();
        callbackContext.success();
    }

    // Android Beam (NDEF push) was removed from Android 10 (API 29) and the plugin stopped
    // implementing it in 1.4.0. 1.4.0-1.7.1 still answered success without doing anything.
    private static final String BEAM_REMOVED = "Android Beam (NDEF push) is not available: it was removed in Android 10";

    private void unshareTag(CallbackContext callbackContext) {
        sendError(callbackContext, ERR_NOT_SUPPORTED, BEAM_REMOVED);
    }

    private void init(CallbackContext callbackContext) {
        Log.d(TAG, "Enabling plugin " + getIntent());
        startNfc();
        if (!recycledIntent()) {
            parseMessage(true);   // the intent that launched the app (background tag reading)
        }
        callbackContext.success();
    }

    private void removeMimeType(JSONArray data, CallbackContext callbackContext) throws JSONException {
        String mimeType = data.getString(0);
        removeIntentFilter(mimeType);
        restartNfc();
        callbackContext.success();
    }

    private void registerMimeType(JSONArray data, CallbackContext callbackContext) throws JSONException {
        String mimeType = "";
        try {
            mimeType = data.getString(0);
            intentFilters.add(createIntentFilter(mimeType));
            restartNfc();
            callbackContext.success();
        } catch (MalformedMimeTypeException e) {
            sendError(callbackContext, ERR_INVALID_ARGUMENT, "Invalid MIME Type " + mimeType);
        }
    }

    private void eraseTag(CallbackContext callbackContext) {
        Tag tag = currentTag();
        if (tag == null) {
            sendError(callbackContext, ERR_NO_TAG, "Failed to erase tag, no tag has been scanned");
            return;
        }
        NdefRecord[] records = {
            new NdefRecord(NdefRecord.TNF_EMPTY, new byte[0], new byte[0], new byte[0])
        };
        writeNdefMessage(new NdefMessage(records), tag, callbackContext);
    }

    private void writeTag(JSONArray data, CallbackContext callbackContext) throws JSONException {
        Tag tag = currentTag();
        if (tag == null) {
            sendError(callbackContext, ERR_NO_TAG, "Failed to write tag, received null intent");
            return;
        }

        NdefRecord[] records = Util.jsonToNdefRecords(data.getString(0));
        writeNdefMessage(new NdefMessage(records), tag, callbackContext);
    }

   private void writeNdefMessage(final NdefMessage message, final Tag tag, final CallbackContext callbackContext) {
       runGuarded(callbackContext, "writeNdefMessage", () -> {
           try {
               // A newer tag may have been tapped between the JS call and this thread running.
               Tag freshTag = currentTag();
               if (freshTag == null) {
                   freshTag = tag;
               }

               // A raw connect()/transceive session on the same tag would make Ndef.connect() fail
               // with "Close other technology first!".
               closeCurrentTechnology();

               // The callback is answered only AFTER the technology is closed: JS may start the
               // next operation (makeReadOnly, another write) the moment it hears back.
               String errorCode = null;
               String errorMessage = null;
               Ndef ndef = Ndef.get(freshTag);
               if (ndef != null) {
                   try {
                       ndef.connect();
                       if (ndef.isWritable()) {
                           int size = message.toByteArray().length;
                           if (ndef.getMaxSize() < size) {
                               errorCode = ERR_CAPACITY;
                               errorMessage = "Tag capacity is " + ndef.getMaxSize() + " bytes, message is " + size + " bytes.";
                           } else {
                               ndef.writeNdefMessage(message);
                           }
                       } else {
                           errorCode = ERR_READ_ONLY;
                           errorMessage = "Tag is read only";
                       }
                   } finally {
                       closeQuietly(ndef);
                   }
               } else {
                   NdefFormatable formatable = NdefFormatable.get(freshTag);
                   if (formatable != null) {
                       try {
                           formatable.connect();
                           formatable.format(message);
                       } finally {
                           closeQuietly(formatable);
                       }
                   } else {
                       errorCode = ERR_NOT_NDEF;
                       errorMessage = "Tag doesn't support NDEF";
                   }
               }

               if (errorCode == null) {
                   callbackContext.success();
               } else {
                   sendError(callbackContext, errorCode, errorMessage);
               }
           } catch (SecurityException e) {
               // Tag out of date - the tag handle has expired
               String errorMessage = e.getMessage();
               if (errorMessage != null && errorMessage.contains("out of date")) {
                   sendError(callbackContext, ERR_TAG_STALE, "Tag connection expired. Please tap the tag again and write immediately.");
               } else {
                   sendError(callbackContext, ERR_TAG_STALE, errorMessage != null ? errorMessage : "Security error writing to tag");
               }
           }
           // Everything else (FormatException, TagLostException, IOException, IllegalStateException,
           // NPE, ...) is reported by runGuarded as {code, message}.
       });
   }

    private void makeReadOnly(final CallbackContext callbackContext) {
        final Tag tag = currentTag();
        if (tag == null) {
            sendError(callbackContext, ERR_NO_TAG, "Failed to make tag read only, tag is null");
            return;
        }

        runGuarded(callbackContext, "makeReadOnly", () -> {
            boolean success = false;
            String message = "Could not make tag read only";
            String code = ERR_IO;

            closeCurrentTechnology();
            Ndef ndef = Ndef.get(tag);

            try {
                if (ndef != null) {
                    ndef.connect();

                    if (!ndef.isWritable()) {
                        message = "Tag is not writable";
                        code = ERR_READ_ONLY;
                    } else if (ndef.canMakeReadOnly()) {
                        success = ndef.makeReadOnly();
                    } else {
                        message = "Tag cannot be made read only";
                        code = ERR_NOT_SUPPORTED;
                    }
                } else {
                    message = "Tag is not NDEF";
                    code = ERR_NOT_NDEF;
                }
            } catch (IOException e) {
                Log.e(TAG, "Failed to make tag read only", e);
                code = e instanceof TagLostException ? ERR_TAG_LOST : ERR_IO;
                if (e.getMessage() != null) {
                    message = e.getMessage();
                } else {
                    message = e.toString();
                }
            } finally {
                closeQuietly(ndef);   // leaving it open broke the next write ("Close other technology first!")
            }

            if (success) {
                callbackContext.success();
            } else {
                sendError(callbackContext, code, message);
            }
        });
    }

    private void shareTag(JSONArray data, CallbackContext callbackContext) throws JSONException {
        sendError(callbackContext, ERR_NOT_SUPPORTED, BEAM_REMOVED);
    }

    private void handover(JSONArray data, CallbackContext callbackContext) throws JSONException {
        sendError(callbackContext, ERR_NOT_SUPPORTED, BEAM_REMOVED);
    }

    private void stopHandover(CallbackContext callbackContext) {
        sendError(callbackContext, ERR_NOT_SUPPORTED, BEAM_REMOVED);
    }

    private void showSettings(CallbackContext callbackContext) {
        List<String> actions = new ArrayList<>();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            actions.add(android.provider.Settings.Panel.ACTION_NFC);   // in-app panel, Android 10+
        }
        actions.add(android.provider.Settings.ACTION_NFC_SETTINGS);
        actions.add(android.provider.Settings.ACTION_WIRELESS_SETTINGS);
        Activity activity = getActivity();
        for (String settingsAction : actions) {
            try {
                activity.startActivity(new Intent(settingsAction));
                callbackContext.success();
                return;
            } catch (ActivityNotFoundException e) {
                Log.w(TAG, "No activity for " + settingsAction + ", trying the next one");
            }
        }
        sendError(callbackContext, ERR_NOT_SUPPORTED, "No NFC settings screen on this device");
    }

    // ------------------------------------------------------------------ NFC on/off events (1.8.0)

    private void registerStateChange(final CallbackContext callbackContext) {
        Activity activity = getActivity();
        NfcAdapter adapter = activity != null ? NfcAdapter.getDefaultAdapter(activity) : null;
        if (adapter == null) {
            sendError(callbackContext, STATUS_NO_NFC, STATUS_NO_NFC);
            return;
        }
        removeStateChange();
        stateChangeCallback = callbackContext;
        stateChangeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || !NfcAdapter.ACTION_ADAPTER_STATE_CHANGED.equals(intent.getAction())) {
                    return;
                }
                sendState(intent.getIntExtra(NfcAdapter.EXTRA_ADAPTER_STATE, NfcAdapter.STATE_OFF), false);
            }
        };
        stateChangeContext = activity.getApplicationContext();
        IntentFilter filter = new IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            // a system broadcast: still delivered to a not-exported receiver
            stateChangeContext.registerReceiver(stateChangeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            stateChangeContext.registerReceiver(stateChangeReceiver, filter);
        }
        // the current state first, so the app does not need a separate enabled() call
        sendState(adapter.isEnabled() ? NfcAdapter.STATE_ON : NfcAdapter.STATE_OFF, true);
    }

    private void sendState(int state, boolean initial) {
        CallbackContext cb = stateChangeCallback;
        if (cb == null) {
            return;
        }
        String name;
        switch (state) {
            case NfcAdapter.STATE_ON: name = "on"; break;
            case NfcAdapter.STATE_TURNING_ON: name = "turning_on"; break;
            case NfcAdapter.STATE_TURNING_OFF: name = "turning_off"; break;
            default: name = "off"; break;
        }
        JSONObject json = new JSONObject();
        try {
            json.put("state", name);
            json.put("enabled", state == NfcAdapter.STATE_ON);
            json.put("initial", initial);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build state JSON", e);
        }
        PluginResult result = new PluginResult(PluginResult.Status.OK, json);
        result.setKeepCallback(true);
        cb.sendPluginResult(result);
    }

    private void removeStateChange() {
        stateChangeCallback = null;
        if (stateChangeReceiver != null && stateChangeContext != null) {
            try {
                stateChangeContext.unregisterReceiver(stateChangeReceiver);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "NFC state receiver was not registered");
            }
        }
        stateChangeReceiver = null;
        stateChangeContext = null;
    }

    @Override
    public void onDestroy() {
        removeStateChange();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ MIFARE Classic (1.8.0)
    // Needs nfc.connect('android.nfc.tech.MifareClassic') first (and a phone whose NFC controller
    // supports MIFARE Classic - NXP chipsets do, many others return no MifareClassic tech).

    private MifareClassic connectedMifareClassic(CallbackContext callbackContext) {
        TagTechnology technology = tagTechnology;
        if (!(technology instanceof MifareClassic) || !technology.isConnected()) {
            sendError(callbackContext, ERR_NOT_CONNECTED, "Call nfc.connect('android.nfc.tech.MifareClassic') first");
            return null;
        }
        return (MifareClassic) technology;
    }

    private void mifareClassicAuthenticate(final int sector, final byte[] key, final String keyType, final CallbackContext callbackContext) {
        runGuarded(callbackContext, "mifareClassicAuthenticate", () -> {
            MifareClassic mifare = connectedMifareClassic(callbackContext);
            if (mifare == null) {
                return;
            }
            if (sector < 0 || sector >= mifare.getSectorCount()) {
                sendError(callbackContext, ERR_INVALID_ARGUMENT, "Sector " + sector + " is out of range 0-" + (mifare.getSectorCount() - 1));
                return;
            }
            if (key == null || key.length != 6) {
                sendError(callbackContext, ERR_INVALID_ARGUMENT, "A MIFARE Classic key is 6 bytes");
                return;
            }
            boolean useKeyB = "B".equalsIgnoreCase(keyType);
            boolean ok = useKeyB ? mifare.authenticateSectorWithKeyB(sector, key) : mifare.authenticateSectorWithKeyA(sector, key);
            if (ok) {
                callbackContext.success();
            } else {
                sendError(callbackContext, ERR_AUTH_FAILED, "Authentication failed for sector " + sector + " with key " + (useKeyB ? "B" : "A"));
            }
        });
    }

    private void mifareClassicReadBlock(final int block, final CallbackContext callbackContext) {
        runGuarded(callbackContext, "mifareClassicReadBlock", () -> {
            MifareClassic mifare = connectedMifareClassic(callbackContext);
            if (mifare == null) {
                return;
            }
            if (block < 0 || block >= mifare.getBlockCount()) {
                sendError(callbackContext, ERR_INVALID_ARGUMENT, "Block " + block + " is out of range 0-" + (mifare.getBlockCount() - 1));
                return;
            }
            callbackContext.success(mifare.readBlock(block));   // 16 bytes; IOException if the sector is not authenticated
        });
    }

    private void mifareClassicInfo(final CallbackContext callbackContext) {
        runGuarded(callbackContext, "mifareClassicInfo", () -> {
            MifareClassic mifare = connectedMifareClassic(callbackContext);
            if (mifare == null) {
                return;
            }
            JSONObject json = new JSONObject();
            String type;
            switch (mifare.getType()) {
                case MifareClassic.TYPE_CLASSIC: type = "Classic"; break;
                case MifareClassic.TYPE_PLUS: type = "Plus"; break;
                case MifareClassic.TYPE_PRO: type = "Pro"; break;
                default: type = "Unknown"; break;
            }
            json.put("type", type);
            json.put("size", mifare.getSize());
            json.put("sectorCount", mifare.getSectorCount());
            json.put("blockCount", mifare.getBlockCount());
            callbackContext.success(json);
        });
    }

    private void createPendingIntent() {
        if (pendingIntent == null) {
            Activity activity = getActivity();
            Intent intent = new Intent(activity, activity.getClass());
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                pendingIntent = PendingIntent.getActivity(activity, 0, intent, PendingIntent.FLAG_MUTABLE);
            } else {
                pendingIntent = PendingIntent.getActivity(activity, 0, intent, 0);
            }
        }
    }

    private void addTechList(String[] list) {
        addTechFilter();
        addToTechList(list);
    }

    private void removeTechList(String[] list) {
        removeTechFilter();
        removeFromTechList(list);
    }

    private void addTechFilter() {
        intentFilters.add(new IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED));
    }

    private void removeTechFilter() {
        Iterator<IntentFilter> iterator = intentFilters.iterator();
        while (iterator.hasNext()) {
            IntentFilter intentFilter = iterator.next();
            if (NfcAdapter.ACTION_TECH_DISCOVERED.equals(intentFilter.getAction(0))) {
                iterator.remove();
            }
        }
    }

    private void addTagFilter() {
        intentFilters.add(new IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED));
    }

    private void removeTagFilter() {
        Iterator<IntentFilter> iterator = intentFilters.iterator();
        while (iterator.hasNext()) {
            IntentFilter intentFilter = iterator.next();
            if (NfcAdapter.ACTION_TAG_DISCOVERED.equals(intentFilter.getAction(0))) {
                iterator.remove();
            }
        }
    }

    private void restartNfc() {
        stopNfc();
        startNfc();
    }

    private void startNfc() {
        final Activity activity = getActivity();
        if (activity == null) {
            return;
        }
        createPendingIntent();

        activity.runOnUiThread(() -> {
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(activity);

            if (nfcAdapter != null && !activity.isFinishing()) {
                try {
                    IntentFilter[] filters = getIntentFilters();
                    String[][] techs = getTechLists();

                    // Validate intent filters - remove any null or invalid entries
                    List<IntentFilter> validFilters = new ArrayList<>();
                    for (IntentFilter filter : filters) {
                        if (filter != null && filter.countActions() > 0) {
                            validFilters.add(filter);
                        }
                    }
                    IntentFilter[] cleanFilters = validFilters.toArray(new IntentFilter[0]);

                    // Android requires: if techLists is non-empty, filters must also be non-empty and valid
                    // If we have tech lists but no valid filters, add a generic TECH_DISCOVERED filter
                    if (techs.length > 0 && cleanFilters.length == 0) {
                        cleanFilters = new IntentFilter[] { new IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED) };
                    }

                    // Capture tags only while a listener asked for them (upstream behaviour). 1.5.4-1.7.1
                    // called enableForegroundDispatch(null, null) here, which swallowed EVERY tag while
                    // the app was in front - a URL tag no longer opened the browser.
                    if (cleanFilters.length > 0) {
                        nfcAdapter.enableForegroundDispatch(activity, getPendingIntent(), cleanFilters, techs);
                    }
                } catch (IllegalStateException e) {
                    Log.w(TAG, "Illegal State Exception starting NFC. Assuming application is terminating.");
                } catch (IllegalArgumentException e) {
                    // No catch-all fallback: capturing every tag is worse than not capturing.
                    Log.e(TAG, "Illegal Argument Exception starting NFC: " + e.getMessage());
                } catch (Exception e) {
                    // Catch-all: runs on the UI thread runnable, so any uncaught exception (e.g.
                    // SecurityException, NPE from a null PendingIntent/adapter) would crash the app.
                    Log.e(TAG, "Unexpected error starting NFC foreground dispatch: " + e.getMessage());
                }
            }
        });
    }

    private void stopNfc() {
        Log.d(TAG, "stopNfc");
        final Activity activity = getActivity();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(() -> {
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(activity);

            if (nfcAdapter != null) {
                try {
                    nfcAdapter.disableForegroundDispatch(activity);
                } catch (IllegalStateException e) {
                    Log.w(TAG, "Illegal State Exception stopping NFC. Assuming application is terminating.");
                } catch (Exception e) {
                    Log.e(TAG, "Unexpected error stopping NFC foreground dispatch: " + e.getMessage());
                }
            }
        });
    }

    private void addToTechList(String[] techs) {
        techLists.add(techs);
    }

    private void removeFromTechList(String[] techs) {
        Iterator<String[]> iterator = techLists.iterator();
        while (iterator.hasNext()) {
            String[] list = iterator.next();
            if (Arrays.equals(list, techs)) {
                iterator.remove();
            }
        }
    }

    private void removeIntentFilter(String mimeType) {
        Iterator<IntentFilter> iterator = intentFilters.iterator();
        while (iterator.hasNext()) {
            IntentFilter intentFilter = iterator.next();
            String mt = intentFilter.getDataType(0);
            if (mimeType.equals(mt)) {
                iterator.remove();
            }
        }
    }

    private IntentFilter createIntentFilter(String mimeType) throws MalformedMimeTypeException {
        IntentFilter intentFilter = new IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED);
        intentFilter.addDataType(mimeType);
        return intentFilter;
    }

    private PendingIntent getPendingIntent() {
        return pendingIntent;
    }

    private IntentFilter[] getIntentFilters() {
        return intentFilters.toArray(new IntentFilter[intentFilters.size()]);
    }

    private String[][] getTechLists() {
        return techLists.toArray(new String[0][0]);
    }

    private void parseMessage() {
        parseMessage(false);
    }

    /**
     * @param launch true for the intent that started the activity: its events carry "launch": true,
     *               so www/phonegap-nfc.js can hand the tag to a listener registered a little later.
     */
    private void parseMessage(final boolean launch) {
        runGuarded(null, "parseMessage", () -> {
            Log.d(TAG, "parseMessage " + getIntent());
            Intent intent = getIntent();
            String action = intent != null ? intent.getAction() : null;
            Log.d(TAG, "action " + action);
            if (action == null) {
                return;
            }

            Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
            rememberTag(tag);
            Parcelable[] messages = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES);

            if (action.equals(NfcAdapter.ACTION_NDEF_DISCOVERED)) {
                Ndef ndef = tag != null ? Ndef.get(tag) : null;
                fireNdefEvent(NDEF_MIME, ndef, messages, launch);
            } else if (action.equals(NfcAdapter.ACTION_TECH_DISCOVERED)) {
                if (tag == null) {
                    Log.w(TAG, "TECH_DISCOVERED intent without a tag, ignoring");
                    setIntent(new Intent());
                    return;
                }
                boolean fired = false;
                for (String tagTech : tag.getTechList()) {
                    Log.d(TAG, tagTech);
                    if (tagTech.equals(NdefFormatable.class.getName())) {
                        fireNdefFormatableEvent(tag, launch);
                        fired = true;
                    } else if (tagTech.equals(Ndef.class.getName())) {
                        Ndef ndef = Ndef.get(tag);
                        fireNdefEvent(NDEF, ndef, messages, launch);
                        fired = true;
                    }
                }
                if (!fired) {
                    // a non-NDEF tag (e.g. NfcV, MifareClassic) delivered by a TECH_DISCOVERED filter
                    fireTagEvent(tag, messages, launch);
                }
            } else if (action.equals(NfcAdapter.ACTION_TAG_DISCOVERED)) {
                fireTagEvent(tag, messages, launch);
            } else {
                // Not an NFC intent (MAIN, a deep-link VIEW, ...): leave it for whoever owns it.
                return;
            }

            // Consumed: clear it so it is not delivered again on the next init/resume.
            setIntent(new Intent());
        });
    }

    private void sendEvent(String type, JSONObject tag, boolean launch) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", type);
            event.put("tag", tag);
            if (launch) {
                event.put("launch", true);
            }

            PluginResult result = new PluginResult(PluginResult.Status.OK, event);
            result.setKeepCallback(true);

            if (channelCallback != null) {
                channelCallback.sendPluginResult(result);
            } else {
                postponedPluginResult = new PostponedPluginResult(new Date(), result);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error sending NFC event through the channel", e);
        }
    }

    private void fireNdefEvent(String type, Ndef ndef, Parcelable[] messages, boolean launch) {
        JSONObject json = buildNdefJSON(ndef, messages);
        sendEvent(type, json, launch);
    }

    private void fireNdefFormatableEvent(Tag tag, boolean launch) {
        sendEvent(NDEF_FORMATABLE, Util.tagToJSON(tag), launch);
    }

    private void fireTagEvent(Tag tag, Parcelable[] messages, boolean launch) {
        sendEvent(TAG_DEFAULT, Util.tagToJSON(tag), launch);
    }

    private JSONObject buildNdefJSON(Ndef ndef, Parcelable[] messages) {
        JSONObject json = Util.ndefToJSON(ndef);

        if (ndef == null && messages != null) {
            try {
                if (messages.length > 0) {
                    NdefMessage message = (NdefMessage) messages[0];
                    json.put("ndefMessage", Util.messageToJSON(message));
                    json.put("type", "NDEF Push Protocol");
                }

                if (messages.length > 1) {
                    Log.wtf(TAG, "Expected one ndefMessage but found " + messages.length);
                }
            } catch (JSONException e) {
                Log.e(Util.TAG, "Failed to convert ndefMessage into json", e);
            }
        }
        return json;
    }

    private boolean recycledIntent() {
        Intent intent = getIntent();
        if (intent == null) {
            return false;
        }
        int flags = intent.getFlags();
        if ((flags & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) {
            Log.i(TAG, "Launched from history, killing recycled intent");
            setIntent(new Intent());
            return true;
        }
        return false;
    }

    @Override
    public void onPause(boolean multitasking) {
        Log.d(TAG, "onPause " + getIntent());
        super.onPause(multitasking);
        if (multitasking) {
            stopNfc();
        }
    }

    @Override
    public void onResume(boolean multitasking) {
        Log.d(TAG, "onResume " + getIntent());
        super.onResume(multitasking);
        startNfc();
    }

    @Override
    public void onNewIntent(Intent intent) {
        Log.d(TAG, "onNewIntent " + intent);
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null) {
            rememberTag(intent.getParcelableExtra(NfcAdapter.EXTRA_TAG));
        }
        parseMessage();
    }

    private Activity getActivity() {
        return this.cordova.getActivity();
    }

    private Intent getIntent() {
        Activity activity = getActivity();
        return activity != null ? activity.getIntent() : null;
    }

    private void setIntent(Intent intent) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.setIntent(intent);
        }
    }

    private void connect(final String tech, final int timeout, final CallbackContext callbackContext) {
        runGuarded(callbackContext, "connect", () -> {
            try {
                Tag tag = currentTag();

                if (tag == null) {
                    Log.e(TAG, "No Tag");
                    sendError(callbackContext, ERR_NO_TAG, "No Tag");
                    return;
                }

                // Never reuse the previous tag's technology: close it and start clean, so an
                // unsupported tech is reported instead of silently reconnecting the old one.
                closeCurrentTechnology();

                JSONObject resultObject = new JSONObject();

                List<String> techList = Arrays.asList(tag.getTechList());
                if (techList.contains(tech)) {
                    tagTechnologyClass = Class.forName(tech);
                    Method method = tagTechnologyClass.getMethod("get", Tag.class);
                    tagTechnology = (TagTechnology) method.invoke(null, tag);

                    try {
                        Method maxTransceiveLengthMethod = tagTechnologyClass.getMethod("getMaxTransceiveLength");
                        resultObject.put("maxTransceiveLength", maxTransceiveLengthMethod.invoke(tagTechnology));
                    } catch (NoSuchMethodException e) {
                        // Some technologies do not support this, so just ignore.
                    } catch (JSONException e) {
                        Log.e(TAG, "Error serializing JSON", e);
                    }
                }

                if (tagTechnology == null) {
                    sendError(callbackContext, ERR_UNSUPPORTED_TECH, "Tag does not support " + tech);
                    return;
                }

                tagTechnology.connect();
                setTimeout(timeout);
                callbackContext.success(resultObject);

            } catch (IOException ex) {
                Log.e(TAG, "Tag connection failed", ex);
                sendError(callbackContext, ex instanceof TagLostException ? ERR_TAG_LOST : ERR_IO,
                        ex.getMessage() != null ? ex.getMessage() : "Tag connection failed");
            }
            // ClassNotFoundException (unknown tech), reflection failures and runtime exceptions are
            // reported by runGuarded with the unwrapped cause.
        });
    }

    private void setTimeout(int timeout) {
        if (timeout < 0) {
            return;
        }
        try {
            Method setTimeout = tagTechnologyClass.getMethod("setTimeout", int.class);
            setTimeout.invoke(tagTechnology, timeout);
        } catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException e) {
            // ignore
        }
    }

    private void close(CallbackContext callbackContext) {
        runGuarded(callbackContext, "close", () -> {
            // Always forget the technology, connected or not (a lost tag reports not-connected).
            TagTechnology current = tagTechnology;
            tagTechnology = null;
            tagTechnologyClass = null;
            try {
                if (current != null && current.isConnected()) {
                    current.close();
                }
                callbackContext.success();
            } catch (IOException ex) {
                Log.e(TAG, "Error closing nfc connection", ex);
                sendError(callbackContext, ERR_IO, "Error closing nfc connection " + ex.getLocalizedMessage());
            }
        });
    }

    private void transceive(final byte[] data, final CallbackContext callbackContext) {
        runGuarded(callbackContext, "transceive", () -> {
            try {
                if (tagTechnology == null) {
                    Log.e(TAG, "No Tech");
                    sendError(callbackContext, ERR_NOT_CONNECTED, "No Tech");
                    return;
                }
                if (!tagTechnology.isConnected()) {
                    Log.e(TAG, "Not connected");
                    sendError(callbackContext, ERR_NOT_CONNECTED, "Not connected");
                    return;
                }

                Method transceiveMethod = tagTechnologyClass.getMethod("transceive", byte[].class);
                byte[] response = (byte[]) transceiveMethod.invoke(tagTechnology, data);

                callbackContext.success(response);

            } catch (NoSuchMethodException e) {
                String error = "TagTechnology " + tagTechnologyClass.getName() + " does not have a transceive function";
                Log.e(TAG, error, e);
                sendError(callbackContext, ERR_NOT_SUPPORTED, error);
            }
            // InvocationTargetException (TagLostException / IOException from the tag) and every
            // runtime exception are reported by runGuarded with the unwrapped cause.
        });
    }

    // ------------------------------------------------------------------ current tag

    private void rememberTag(Tag tag) {
        if (tag != null) {
            lastTag = tag;
        }
    }

    /** The newest tag from dispatch, reader mode or the launch intent; null if none was seen. */
    private Tag currentTag() {
        Tag tag = lastTag;
        if (tag == null) {
            Intent intent = getIntent();
            tag = intent != null ? intent.getParcelableExtra(NfcAdapter.EXTRA_TAG) : null;
        }
        return tag;
    }

    // ------------------------------------------------------------------ connection hygiene

    /** Closes and forgets the technology opened by connect(), if any. Never throws. */
    private void closeCurrentTechnology() {
        TagTechnology current = tagTechnology;
        tagTechnology = null;
        tagTechnologyClass = null;
        closeQuietly(current);
    }

    private static void closeQuietly(TagTechnology technology) {
        if (technology == null) {
            return;
        }
        try {
            if (technology.isConnected()) {
                technology.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Ignoring error while closing " + technology.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ error plumbing

    /** A background body that may throw anything; runGuarded reports it instead of crashing. */
    interface GuardedTask {
        void run() throws Exception;
    }

    /**
     * Runs {@code task} on the Cordova thread pool. Any exception that escapes it (a stale-tag
     * SecurityException, IllegalStateException, TagLostException, NPE, ...) would otherwise kill the
     * app from a pool thread; here it is logged and, when there is a callback, sent to JS as
     * {code, message}. A callback that was already answered ignores the late error.
     */
    private void runGuarded(final CallbackContext callbackContext, final String what, final GuardedTask task) {
        cordova.getThreadPool().execute(() -> {
            try {
                task.run();
            } catch (Throwable t) {
                if (t instanceof VirtualMachineError) {
                    throw (VirtualMachineError) t;
                }
                Log.e(TAG, what + " failed", t);
                if (callbackContext != null) {
                    callbackContext.error(errorJSON(t));
                }
            }
        });
    }

    static void sendError(CallbackContext callbackContext, String code, String message) {
        callbackContext.error(errorJSON(code, message));
    }

    static JSONObject errorJSON(String code, String message) {
        JSONObject error = new JSONObject();
        try {
            error.put("code", code);
            error.put("message", message != null ? message : code);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build error JSON", e);
        }
        return error;
    }

    static JSONObject errorJSON(Throwable t) {
        Throwable cause = unwrap(t);
        return errorJSON(errorCode(cause), errorMessage(cause));
    }

    /** Reflection wraps the tag's real exception; JS needs the cause, not "null". */
    static Throwable unwrap(Throwable t) {
        Throwable current = t;
        while (current instanceof InvocationTargetException && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    static String errorCode(Throwable t) {
        if (t instanceof TagLostException) {
            return ERR_TAG_LOST;
        } else if (t instanceof SecurityException) {
            return ERR_TAG_STALE;          // "Tag ... is out of date": the tag handle expired
        } else if (t instanceof FormatException) {
            return ERR_FORMAT;
        } else if (t instanceof IOException) {
            return ERR_IO;
        } else if (t instanceof IllegalStateException) {
            return ERR_ILLEGAL_STATE;
        } else if (t instanceof ClassNotFoundException) {
            return ERR_UNSUPPORTED_TECH;
        } else if (t instanceof IllegalArgumentException || t instanceof JSONException) {
            return ERR_INVALID_ARGUMENT;
        }
        return ERR_UNKNOWN;
    }

    static String errorMessage(Throwable t) {
        if (t instanceof SecurityException && t.getMessage() != null && t.getMessage().contains("out of date")) {
            return "Tag connection expired. Please tap the tag again.";
        }
        if (t instanceof TagLostException && t.getMessage() == null) {
            return "Tag was lost.";
        }
        String message = t.getMessage();
        return message != null ? message : t.toString();
    }
}
