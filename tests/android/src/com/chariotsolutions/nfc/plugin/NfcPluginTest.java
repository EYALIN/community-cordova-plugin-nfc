package com.chariotsolutions.nfc.plugin;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.TagLostException;
import android.nfc.tech.MifareClassic;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.nfc.tech.NfcA;
import android.os.Build;
import android.provider.Settings;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPreferences;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Behavioural tests for NfcPlugin.java, run on a plain JVM against the fakes in tests/android/fakes.
 *
 * The fakes reproduce the framework rules the plugin has to live with (one connected technology
 * per tag, "Tag ... is out of date" SecurityExceptions, TagLostException on a pulled tag) and
 * record every exception that escapes a thread-pool / UI / binder runnable in Activity.CRASHES —
 * on a phone each of those is an app crash. Real-device NFC verification is still required; this
 * proves the plugin's own control flow.
 *
 *   tests/android/run.sh            # compile + run
 */
public class NfcPluginTest {

    // ---------------------------------------------------------------- harness

    static final ExecutorService POOL = new AbstractExecutorService() {
        public void execute(Runnable r) {
            try { r.run(); } catch (Throwable t) { Activity.CRASHES.add(t); }
        }
        public void shutdown() {}
        public List<Runnable> shutdownNow() { return Collections.emptyList(); }
        public boolean isShutdown() { return false; }
        public boolean isTerminated() { return false; }
        public boolean awaitTermination(long l, TimeUnit u) { return true; }
    };

    static class Env {
        final Activity activity = new Activity();
        final NfcPlugin plugin = new NfcPlugin();
        final CordovaPreferences prefs = new CordovaPreferences();
        final List<Throwable> executeThrew = new ArrayList<>();
        boolean activityGone;

        Env() {
            Activity.CRASHES.clear();
            NfcAdapter.instance = new NfcAdapter();
            Build.VERSION.SDK_INT = 34;
            CordovaInterface ci = new CordovaInterface() {
                public Activity getActivity() { return activityGone ? null : activity; }
                public ExecutorService getThreadPool() { return POOL; }
            };
            plugin.privateInitialize(ci, prefs);
        }

        /** Mirrors cordova-android PluginManager.exec: an exception thrown out of execute() becomes error(message). */
        CallbackContext exec(String action, Object... args) {
            JSONArray a = new JSONArray();
            for (Object o : args) { a.put(o); }
            CallbackContext cb = new CallbackContext(action);
            try {
                if (!plugin.execute(action, a, cb)) {
                    cb.sendPluginResult(new PluginResult(PluginResult.Status.INVALID_ACTION));
                }
            } catch (Throwable t) {
                executeThrew.add(t);
                cb.error(t.getMessage());
            }
            return cb;
        }

        Tag ndefTag(String name) {
            Tag t = new Tag(name, new byte[]{4, 1, 2, 3, 4, 5, 6}, "android.nfc.tech.NfcA", "android.nfc.tech.MifareUltralight", "android.nfc.tech.Ndef");
            t.ndef = new Ndef(t);
            t.nfcA = new NfcA(t);
            return t;
        }

        void dispatch(Tag t) { dispatch(t, NfcAdapter.ACTION_TECH_DISCOVERED); }

        void dispatch(Tag t, String action) {
            Intent i = new Intent(action);
            if (t != null) { i.putExtra(NfcAdapter.EXTRA_TAG, t); }
            activity.setIntent(i);
            plugin.onNewIntent(i);
        }

        /** The NFC service calls onTagDiscovered on a binder thread: an escaping exception is a crash. */
        void readerTap(Tag t) {
            try { NfcAdapter.instance.readerCallback.onTagDiscovered(t); } catch (Throwable e) { Activity.CRASHES.add(e); }
        }

        String hex(byte[] b) { return Base64.getEncoder().encodeToString(b); }
    }

    // ---------------------------------------------------------------- assertions

    static int passed, failed;
    static final List<String> failures = new ArrayList<>();
    static String only = System.getenv("NFC_TEST_ONLY");

    interface Body { void run(Env e) throws Exception; }

    static void test(String name, Body body) {
        if (only != null && !name.contains(only)) { return; }
        Env e = new Env();
        String why = null;
        try {
            body.run(e);
            if (!Activity.CRASHES.isEmpty()) { why = "APP CRASH: " + Activity.CRASHES.get(0); }
            else if (!e.executeThrew.isEmpty()) { why = "execute() threw " + e.executeThrew.get(0); }
        } catch (AssertionError a) {
            why = a.getMessage();
            if (!Activity.CRASHES.isEmpty()) { why += "  [and APP CRASH: " + Activity.CRASHES.get(0) + "]"; }
        } catch (Throwable t) {
            why = "test threw " + t;
        }
        if (why == null) { passed++; System.out.println("PASS  " + name); }
        else { failed++; failures.add(name); System.out.println("FAIL  " + name + "\n        -> " + why); }
    }

    static void check(boolean ok, String msg) { if (!ok) { throw new AssertionError(msg); } }

    static boolean isError(CallbackContext cb) { PluginResult r = cb.last(); return r != null && r.status == PluginResult.Status.ERROR; }
    static boolean isOk(CallbackContext cb) { PluginResult r = cb.last(); return r != null && r.status == PluginResult.Status.OK; }

    static String errMessage(CallbackContext cb) {
        PluginResult r = cb.last();
        if (r == null) { return "<no callback>"; }
        if (r.message instanceof JSONObject) { return ((JSONObject) r.message).optString("message", null); }
        return r.message == null ? null : String.valueOf(r.message);
    }

    static String errCode(CallbackContext cb) {
        PluginResult r = cb.last();
        return r != null && r.message instanceof JSONObject ? ((JSONObject) r.message).optString("code", null) : null;
    }

    static void expectOneError(CallbackContext cb, String what) {
        check(cb.results.size() == 1 && isError(cb), what + ": expected exactly one error callback, got " + cb.results);
        check(cb.violations == 0, what + ": callback answered twice");
    }

    static void expectSuccess(CallbackContext cb, String what) {
        check(isOk(cb), what + ": expected success, got " + cb.results);
        check(cb.violations == 0, what + ": callback answered twice");
    }

    // ---------------------------------------------------------------- tests

    public static void main(String[] args) {

        // ===== PLU-217: every background path reports an error instead of crashing
        test("[PLU-217] makeReadOnly on a stale tag ('Tag ... is out of date') reports an error, no crash", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t); t.stale = true;
            expectOneError(e.exec("makeReadOnly"), "makeReadOnly");
        });
        test("[PLU-217] makeReadOnly that throws IllegalStateException reports an error, no crash", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t); t.ndef.failMakeReadOnlyRuntime = new IllegalStateException("boom");
            expectOneError(e.exec("makeReadOnly"), "makeReadOnly");
        });
        test("[PLU-217] connect on a stale tag reports an error, no crash", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t); t.stale = true;
            expectOneError(e.exec("connect", "android.nfc.tech.NfcA", -1), "connect");
        });
        test("[PLU-217] close on a stale connected tag answers the callback, no crash", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            expectSuccess(e.exec("connect", "android.nfc.tech.NfcA", -1), "connect");
            t.stale = true;
            CallbackContext cb = e.exec("close");
            check(cb.results.size() == 1, "close: expected one callback, got " + cb.results);
        });
        test("[PLU-217] a TECH_DISCOVERED intent without a tag extra does not crash parseMessage", e -> {
            e.exec("registerNdef");
            e.dispatch(null, NfcAdapter.ACTION_TECH_DISCOVERED);
        });
        test("[PLU-217] a reader-mode tag after the activity is gone does not crash onTagDiscovered", e -> {
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag t = e.ndefTag("A");
            e.activityGone = true;
            e.readerTap(t);
        });
        test("[PLU-217] a reader-mode tag whose NDEF read throws is reported, not a crash", e -> {
            CallbackContext rm = e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag t = new Tag("X", new byte[]{1}, "android.nfc.tech.Ndef");   // Ndef listed but Ndef.get() -> null
            e.readerTap(t);
            check(rm.violations == 0, "reader-mode callback answered after finishing");
        });

        // ===== PLU-218: connections are always closed; connect never reuses a stale technology
        test("[PLU-218] write after makeReadOnly on the same tag succeeds (no 'Close other technology first!')", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            t.ndef.canMakeRO = true;
            expectSuccess(e.exec("makeReadOnly"), "makeReadOnly");
            t.ndef.writable = true;   // a tag that refuses the lock bit stays writable
            CallbackContext w = e.exec("writeTag", "[]");
            check(!"Close other technology first!".equals(errMessage(w)), "write: " + errMessage(w));
            expectSuccess(w, "write after makeReadOnly");
        });
        test("[PLU-218] write after a failed write succeeds", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            t.ndef.failWrite = new IOException("I/O error during write");
            expectOneError(e.exec("writeTag", "[]"), "first write");
            t.ndef.failWrite = null;
            CallbackContext w = e.exec("writeTag", "[]");
            check(!"Close other technology first!".equals(errMessage(w)), "second write: " + errMessage(w));
            expectSuccess(w, "second write");
        });
        test("[PLU-218] 20 consecutive write/erase/lock attempts with forced failures never yield 'Close other technology first!'", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            for (int i = 0; i < 20; i++) {
                t.ndef.failWrite = (i % 3 == 0) ? new IOException("forced " + i) : null;
                t.ndef.failMakeReadOnly = (i % 4 == 1) ? new IOException("forced lock " + i) : null;
                t.ndef.writable = true;
                String op = (i % 5 == 4) ? "makeReadOnly" : (i % 2 == 0 ? "writeTag" : "eraseTag");
                CallbackContext cb = op.equals("writeTag") ? e.exec(op, "[]") : e.exec(op);
                check(!"Close other technology first!".equals(errMessage(cb)), "attempt " + i + " (" + op + "): Close other technology first!");
                check(cb.results.size() == 1, "attempt " + i + " (" + op + "): no single callback " + cb.results);
            }
            check(t.connectedTech == null, "tag left connected after the loop");
        });
        test("[PLU-218] connect(MifareClassic) on an NTAG after an earlier NfcA session returns 'Tag does not support'", e -> {
            Tag a = e.ndefTag("A"); e.dispatch(a);
            expectSuccess(e.exec("connect", "android.nfc.tech.NfcA", -1), "connect NfcA");
            a.nfcA.simulateLost();
            e.exec("close");
            Tag b = e.ndefTag("B"); e.dispatch(b);
            int before = a.nfcA.connectCount;
            CallbackContext cb = e.exec("connect", "android.nfc.tech.MifareClassic", -1);
            check(isError(cb) && String.valueOf(errMessage(cb)).startsWith("Tag does not support"), "connect(MifareClassic): " + cb.results);
            check(a.nfcA.connectCount == before, "the previous tag's NfcA was reconnected");
        });
        test("[PLU-218] write while a raw connect() session is open on the same tag succeeds", e -> {
            Tag a = e.ndefTag("A"); e.dispatch(a);
            expectSuccess(e.exec("connect", "android.nfc.tech.NfcA", -1), "connect");
            CallbackContext w = e.exec("writeTag", "[]");
            expectSuccess(w, "write");
            check(a.connectedTech == null, "tag left connected after the write");
        });
        test("[PLU-218] connect twice without close does not fail with 'Close other technology first!'", e -> {
            Tag a = e.ndefTag("A"); e.dispatch(a);
            expectSuccess(e.exec("connect", "android.nfc.tech.NfcA", -1), "connect 1");
            CallbackContext cb = e.exec("connect", "android.nfc.tech.NfcA", -1);
            expectSuccess(cb, "connect 2");
        });

        // ===== PLU-219: transceive/connect errors carry a code and a real message
        test("[PLU-219] transceive on a pulled tag rejects with {code:'TAG_LOST', message}", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            e.exec("connect", "android.nfc.tech.NfcA", -1);
            t.nfcA.transceiver = cmd -> { throw new TagLostException("Tag was lost."); };
            CallbackContext cb = e.exec("transceive", e.hex(new byte[]{0x60}));
            expectOneError(cb, "transceive");
            check("TAG_LOST".equals(errCode(cb)), "code was " + errCode(cb) + " / message " + errMessage(cb));
            check(errMessage(cb) != null, "message is null");
        });
        test("[PLU-219] a NAK'd transceive rejects with {code:'IO_ERROR'} and a non-null message", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            e.exec("connect", "android.nfc.tech.NfcA", -1);
            t.nfcA.transceiver = cmd -> { throw new IOException("Transceive failed"); };
            CallbackContext cb = e.exec("transceive", e.hex(new byte[]{0x3C, 0x00}));
            expectOneError(cb, "transceive");
            check("IO_ERROR".equals(errCode(cb)) && "Transceive failed".equals(errMessage(cb)), "got " + cb.results);
        });
        test("[PLU-219] a failed connect rejects with a code and the cause's message", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            t.nfcA.failConnect = new IOException("Connect failed");
            CallbackContext cb = e.exec("connect", "android.nfc.tech.NfcA", -1);
            expectOneError(cb, "connect");
            check("IO_ERROR".equals(errCode(cb)) && errMessage(cb) != null, "got " + cb.results);
        });
        test("[PLU-219] transceive with no connection rejects with {code:'NOT_CONNECTED'}", e -> {
            CallbackContext cb = e.exec("transceive", e.hex(new byte[]{0x60}));
            expectOneError(cb, "transceive");
            check("NOT_CONNECTED".equals(errCode(cb)), "got " + cb.results);
        });
        test("[PLU-219] a successful transceive still resolves with the response bytes", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            e.exec("connect", "android.nfc.tech.NfcA", -1);
            t.nfcA.transceiver = cmd -> new byte[]{0, 4, 4, 2, 1, 0, 0x11, 3};
            CallbackContext cb = e.exec("transceive", e.hex(new byte[]{0x60}));
            expectSuccess(cb, "transceive");
        });

        // ===== PLU-220: reader mode can write; the newest tag wins
        test("[PLU-220] with readerMode on, write succeeds on the tag reader mode delivered", e -> {
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag b = e.ndefTag("B"); e.readerTap(b);
            expectSuccess(e.exec("writeTag", "[]"), "write");
            check(b.ndef.writes == 1, "tag B was not written");
        });
        test("[PLU-220] with readerMode on, erase succeeds", e -> {
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag b = e.ndefTag("B"); e.readerTap(b);
            expectSuccess(e.exec("eraseTag", new JSONArray()), "erase");
        });
        test("[PLU-220] with readerMode on, makeReadOnly succeeds", e -> {
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag b = e.ndefTag("B"); e.readerTap(b);
            expectSuccess(e.exec("makeReadOnly"), "makeReadOnly");
        });
        test("[PLU-220] tag A by dispatch, then tag B by reader mode: the write goes to B", e -> {
            Tag a = e.ndefTag("A"); e.dispatch(a);
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A);
            Tag b = e.ndefTag("B"); e.readerTap(b);
            expectSuccess(e.exec("writeTag", "[]"), "write");
            check(b.ndef.writes == 1 && a.ndef.writes == 0, "wrote A=" + a.ndef.writes + " B=" + b.ndef.writes);
        });
        test("[PLU-220] tag A then tag B by dispatch: the write goes to B", e -> {
            Tag a = e.ndefTag("A"); e.dispatch(a);
            Tag b = e.ndefTag("B"); e.dispatch(b);
            expectSuccess(e.exec("writeTag", "[]"), "write");
            check(b.ndef.writes == 1 && a.ndef.writes == 0, "wrote A=" + a.ndef.writes + " B=" + b.ndef.writes);
        });
        test("[PLU-220] write with no tag at all answers exactly once and does not throw", e -> {
            e.activity.setIntent(null);
            CallbackContext cb = e.exec("writeTag", "[]");
            expectOneError(cb, "write");
        });

        // ===== PLU-227: no catch-all dispatch; non-NFC launch intents survive
        test("[PLU-227] with no listener registered, resuming does not capture every tag", e -> {
            e.exec("init");
            e.plugin.onResume(false);
            check(!NfcAdapter.instance.lastWasNull, "enableForegroundDispatch(null, null) = every tag swallowed");
            check(!NfcAdapter.instance.dispatchEnabled, "foreground dispatch enabled with no listener");
        });
        test("[PLU-227] with an NDEF listener registered, dispatch is enabled with a filter", e -> {
            e.exec("registerNdef");
            check(NfcAdapter.instance.dispatchEnabled && NfcAdapter.instance.lastFilters != null
                    && NfcAdapter.instance.lastFilters.length > 0, "dispatch not enabled with filters");
        });
        test("[PLU-227] removing the last listener stops capturing tags", e -> {
            e.exec("registerNdef");
            e.exec("removeNdef");
            check(!NfcAdapter.instance.lastWasNull, "fell back to catch-all dispatch");
            check(!NfcAdapter.instance.dispatchEnabled, "dispatch still enabled after the last listener was removed");
        });
        test("[PLU-227] a deep-link VIEW launch intent survives init/parseMessage", e -> {
            Intent view = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("nfc://open/123"));
            e.activity.setIntent(view);
            e.exec("init");
            check(e.activity.getIntent() == view, "launch intent replaced by " + e.activity.getIntent());
        });
        test("[PLU-227] a consumed NFC intent is cleared so it is not delivered twice", e -> {
            e.exec("registerNdef");
            Tag a = e.ndefTag("A"); e.dispatch(a);
            check(!NfcAdapter.ACTION_TECH_DISCOVERED.equals(e.activity.getIntent().getAction()), "NFC intent left on the activity");
        });

        // ===== PLU-229: Beam stubs no longer report fake success
        test("[PLU-229] share (Android Beam) reports NOT_SUPPORTED instead of fake success", e -> {
            CallbackContext cb = e.exec("shareTag", "[]");
            check(isError(cb) && "NOT_SUPPORTED".equals(errCode(cb)), "got " + cb.results);
        });
        test("[PLU-229] handover (Android Beam) reports NOT_SUPPORTED instead of fake success", e -> {
            CallbackContext cb = e.exec("handover", "content://x");
            check(isError(cb) && "NOT_SUPPORTED".equals(errCode(cb)), "got " + cb.results);
        });

        // ===== PLU-230: new native capabilities
        test("[PLU-230] readerMode passes a presence-check delay to the adapter", e -> {
            JSONObject opts = new JSONObject().put("presenceCheckDelay", 250);
            e.exec("readerMode", NfcAdapter.FLAG_READER_NFC_A, opts);
            check(NfcAdapter.instance.readerExtras != null
                    && NfcAdapter.instance.readerExtras.getInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, -1) == 250,
                    "presence delay not set: " + (NfcAdapter.instance.readerExtras == null ? null : NfcAdapter.instance.readerExtras.values));
        });
        test("[PLU-230] NFC on/off events reach JS, even while NFC is off", e -> {
            NfcAdapter.instance.enabled = false;
            CallbackContext cb = e.exec("registerStateChange");
            check(e.activity.receivers.size() == 1, "no receiver registered");
            Intent off = new Intent(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED).putExtra(NfcAdapter.EXTRA_ADAPTER_STATE, NfcAdapter.STATE_OFF);
            e.activity.broadcast(off);
            Intent on = new Intent(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED).putExtra(NfcAdapter.EXTRA_ADAPTER_STATE, NfcAdapter.STATE_ON);
            e.activity.broadcast(on);
            List<String> states = new ArrayList<>();
            for (PluginResult r : cb.results) {
                if (r.message instanceof JSONObject) { states.add(((JSONObject) r.message).optString("state")); }
            }
            check(states.contains("off") && states.contains("on"), "states seen: " + states + " results " + cb.results);
            check(cb.results.get(cb.results.size() - 1).getKeepCallback(), "state callback not kept");
        });
        test("[PLU-230] removeStateChange and onDestroy unregister the receiver", e -> {
            e.exec("registerStateChange");
            e.exec("removeStateChange");
            check(e.activity.receivers.isEmpty(), "receiver still registered after removeStateChange");
            e.exec("registerStateChange");
            e.plugin.onDestroy();
            check(e.activity.receivers.isEmpty(), "receiver leaked after onDestroy");
        });
        test("[PLU-230] showSettings opens the NFC settings panel on Android 10+", e -> {
            Build.VERSION.SDK_INT = 29;
            expectSuccess(e.exec("showSettings"), "showSettings");
            check(Settings.Panel.ACTION_NFC.equals(e.activity.started.get(0).getAction()), "opened " + e.activity.started);
        });
        test("[PLU-230] showSettings falls back to NFC settings when the panel is unavailable / before Android 10", e -> {
            e.activity.unavailableActions.add(Settings.Panel.ACTION_NFC);
            expectSuccess(e.exec("showSettings"), "showSettings");
            check(Settings.ACTION_NFC_SETTINGS.equals(e.activity.started.get(0).getAction()), "opened " + e.activity.started);
            Build.VERSION.SDK_INT = 28;
            e.activity.started.clear(); e.activity.unavailableActions.clear();
            e.exec("showSettings");
            check(Settings.ACTION_NFC_SETTINGS.equals(e.activity.started.get(0).getAction()), "API 28 opened " + e.activity.started);
        });
        test("[PLU-230] MIFARE Classic: authenticate sector with key A, then read a block", e -> {
            Tag t = new Tag("MFC", new byte[]{1, 2, 3, 4}, "android.nfc.tech.NfcA", "android.nfc.tech.MifareClassic");
            t.nfcA = new NfcA(t); t.mifareClassic = new MifareClassic(t);
            e.dispatch(t);
            expectSuccess(e.exec("connect", "android.nfc.tech.MifareClassic", -1), "connect");
            CallbackContext auth = e.exec("mifareClassicAuthenticate", 1, e.hex(MifareClassic.KEY_DEFAULT), "A");
            expectSuccess(auth, "authenticate");
            CallbackContext read = e.exec("mifareClassicReadBlock", 5);
            expectSuccess(read, "readBlock");
        });
        test("[PLU-230] MIFARE Classic: a wrong key rejects with AUTH_FAILED; reading an unauthenticated block rejects", e -> {
            Tag t = new Tag("MFC", new byte[]{1, 2, 3, 4}, "android.nfc.tech.NfcA", "android.nfc.tech.MifareClassic");
            t.nfcA = new NfcA(t); t.mifareClassic = new MifareClassic(t);
            e.dispatch(t);
            e.exec("connect", "android.nfc.tech.MifareClassic", -1);
            CallbackContext auth = e.exec("mifareClassicAuthenticate", 2, e.hex(new byte[]{1, 2, 3, 4, 5, 6}), "B");
            check(isError(auth) && "AUTH_FAILED".equals(errCode(auth)), "wrong key: " + auth.results);
            CallbackContext read = e.exec("mifareClassicReadBlock", 9);
            check(isError(read) && errMessage(read) != null, "unauthenticated read: " + read.results);
        });
        test("[PLU-230] MIFARE Classic helpers reject clearly when connected with another technology", e -> {
            Tag t = e.ndefTag("A"); e.dispatch(t);
            e.exec("connect", "android.nfc.tech.NfcA", -1);
            CallbackContext auth = e.exec("mifareClassicAuthenticate", 0, e.hex(MifareClassic.KEY_DEFAULT), "A");
            check(isError(auth) && errMessage(auth) != null, "got " + auth.results);
        });

        // ===== PLU-231: a tag that launched the app reaches the JS listeners
        test("[PLU-231] a non-NDEF tag that launched the app (TECH_DISCOVERED) is delivered as a 'tag' event", e -> {
            CallbackContext channel = e.exec("channel");
            Tag t = new Tag("V", new byte[]{1, 2}, "android.nfc.tech.NfcV");
            Intent launch = new Intent(NfcAdapter.ACTION_TECH_DISCOVERED).putExtra(NfcAdapter.EXTRA_TAG, t);
            e.activity.setIntent(launch);
            e.exec("init");
            check(!channel.results.isEmpty(), "no event delivered for the launch tag");
            JSONObject ev = (JSONObject) channel.last().message;
            check("tag".equals(ev.optString("type")) && ev.optBoolean("launch"), "event " + ev);
        });
        test("[PLU-231] an NDEF tag that launched the app is delivered and marked as the launch tag", e -> {
            CallbackContext channel = e.exec("channel");
            Tag t = e.ndefTag("L");
            Intent launch = new Intent(NfcAdapter.ACTION_NDEF_DISCOVERED).putExtra(NfcAdapter.EXTRA_TAG, t);
            e.activity.setIntent(launch);
            e.exec("init");
            check(!channel.results.isEmpty(), "no event delivered for the launch tag");
            JSONObject ev = (JSONObject) channel.last().message;
            check(ev.optString("type").startsWith("ndef") && ev.optBoolean("launch"), "event " + ev);
        });

        System.out.println();
        System.out.println(passed + " passed, " + failed + " failed");
        if (failed > 0) {
            System.out.println("Failing:");
            for (String f : failures) { System.out.println("  " + f); }
            System.exit(1);
        }
    }
}
