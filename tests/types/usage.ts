// Compile-only type test: `tsc -p tests/types --noEmit`. Mirrors how Ionic/NfcReader and
// Ionic/NfcChecker call the plugin, plus the 1.8.0 additions. Nothing here runs.
import NfcManager, { INdefRecord, INdefTag, INfcEvent, NfcError, INtagVersionInfo, IFullMemoryDump } from '../../types';

declare const NfcPlugin: NfcManager;

async function consumerPatterns(): Promise<void> {
    const handler = (event: INfcEvent) => { const tag: INdefTag = event.tag; void tag; };

    // callback style, as the apps use it today
    NfcPlugin.addNdefListener(handler, () => {}, (err) => { const s: string = String(err); void s; });
    NfcPlugin.addTagDiscoveredListener(handler, () => {}, () => {});
    NfcPlugin.removeNdefListener(handler, () => {}, () => {});
    NfcPlugin.removeTagDiscoveredListener(handler);
    NfcPlugin.addMimeTypeListener('text/plain', handler);
    NfcPlugin.removeMimeTypeListener('text/plain', handler, () => {}, () => {});

    // promise style (1.8.0: no callbacks -> Promise)
    await NfcPlugin.enabled();
    await NfcPlugin.erase();
    const message: INdefRecord[] = [NfcPlugin.NdefPlugin.textRecord('hello'), NfcPlugin.NdefPlugin.uriRecord('https://example.com')];
    await NfcPlugin.write(message);
    NfcPlugin.write(message, () => {}, () => {}, {});
    await NfcPlugin.makeReadOnly();
    await NfcPlugin.showSettings();

    // iOS
    const scanned: INdefTag = await NfcPlugin.scanNdef({ keepSessionOpen: false });
    const t = await NfcPlugin.scanTag({ keepSessionOpen: true, pollFeliCa: true });
    const family: string | undefined = t.mifareFamily;
    const cap: number | undefined = t.maxSize;
    void family; void cap;
    await NfcPlugin.cancelScan();
    void scanned;

    // reader mode
    NfcPlugin.readerMode(NfcPlugin.FLAG_READER_NFC_A | NfcPlugin.FLAG_READER_NO_PLATFORM_SOUNDS, (tag) => { void tag.id; }, (e) => { void e; });
    await NfcPlugin.disableReaderMode();

    // low level + NTAG helpers
    const { maxTransceiveLength } = await NfcPlugin.connect('android.nfc.tech.NfcA', 500);
    void maxTransceiveLength;
    const response: ArrayBuffer = await NfcPlugin.transceive(new Uint8Array([0x60]));
    await NfcPlugin.transceive('3000');
    await NfcPlugin.transceive([0x30, 0x04]);
    void response;
    const version: INtagVersionInfo = await NfcPlugin.getNtagVersion();
    const map = NfcPlugin.getNtagMemoryMap(version);
    if (map) { const cfg: number = map.configPage; void cfg; }
    const status = await NfcPlugin.getPasswordProtectionStatus();
    const auth0: number | null = status.protectionStartPage;
    void auth0;
    const dump: IFullMemoryDump = await NfcPlugin.fullMemoryDump();
    void dump.hexDump;
    await NfcPlugin.close();

    // NDEF helpers
    const text: string = NfcPlugin.NdefPlugin.decodeTextRecord(message[0]);
    const uri: string = NfcPlugin.NdefPlugin.decodeUriRecord(message[1]);
    const isText: boolean = NfcPlugin.NfcUtil.isType(message[0], NfcPlugin.NdefPlugin.TNF_WELL_KNOWN, NfcPlugin.NdefPlugin.RTD_TEXT);
    const hex: string = NfcPlugin.NfcUtil.bytesToHexString(message[0].payload);
    void text; void uri; void isText; void hex;

    // 1.8.0 additions
    NfcPlugin.readerMode(NfcPlugin.FLAG_READER_NFC_A, () => {}, () => {}, { presenceCheckDelay: 250 });
    NfcPlugin.addStateChangeListener((e) => { const on: boolean = e.enabled; void on; });
    await NfcPlugin.removeStateChangeListener();
    await NfcPlugin.connect('android.nfc.tech.MifareClassic');
    await NfcPlugin.mifareClassicAuthenticate(1, 'FFFFFFFFFFFF', 'A');
    const block: ArrayBuffer = await NfcPlugin.mifareClassicReadBlock(4);
    void block;
    const auth = await NfcPlugin.ntagAuthenticate('12345678', 'ABCD');
    void auth.packMatches;
    await NfcPlugin.ntagSetPassword([1, 2, 3, 4], { pack: 'ABCD', startPage: 4, protectReads: true, authLimit: 3 });
    await NfcPlugin.ntagRemovePassword(new Uint8Array([1, 2, 3, 4]));
    const genuine: boolean = NfcPlugin.verifyNtagSignature('04E10CDA993C80', '8B76052E').valid;
    const check = await NfcPlugin.checkNtagOriginality();
    void genuine; void check.keyName;
    const sys = await NfcPlugin.nfcvGetSystemInfo();
    await NfcPlugin.nfcvReadBlocks(0, sys.blockCount ?? 1, sys.uid);

    // structured errors
    NfcPlugin.useErrorObjects(true);
    try {
        await NfcPlugin.transceive('60');
    } catch (e) {
        if (e instanceof NfcPlugin.NfcError) {
            const err: NfcError = e;
            if (err.code === 'TAG_LOST' || err.code === NfcPlugin.IOS_ERROR.USER_CANCELED) { void err.message; }
        }
    }
}

void consumerPatterns;

// @ts-expect-error remove*Listener needs the callback that was registered
NfcPlugin.removeNdefListener();
// @ts-expect-error isType takes (record, tnf, type)
NfcPlugin.NfcUtil.isType([1], [1]);
