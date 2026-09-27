package android.nfc.tech;
import android.nfc.Tag;
import java.io.IOException;
import java.util.Arrays;
public final class MifareClassic extends BasicTech {
    public static final int TYPE_UNKNOWN = -1, TYPE_CLASSIC = 0, TYPE_PLUS = 1, TYPE_PRO = 2;
    public static final int SIZE_1K = 1024, SIZE_2K = 2048, SIZE_4K = 4096, SIZE_MINI = 320;
    public static final int BLOCK_SIZE = 16;
    public static final byte[] KEY_DEFAULT = {(byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF};
    /** 1K card: 16 sectors x 4 blocks. keyA per sector; data per block. */
    public byte[][] keysA = new byte[16][], keysB = new byte[16][];
    public byte[][] blocks = new byte[64][];
    public int authenticatedSector = -1;
    public MifareClassic(Tag t) {
        super(t);
        for (int i = 0; i < 16; i++) { keysA[i] = KEY_DEFAULT.clone(); keysB[i] = KEY_DEFAULT.clone(); }
        for (int i = 0; i < 64; i++) { blocks[i] = new byte[16]; blocks[i][0] = (byte) i; }
    }
    public static MifareClassic get(Tag t) { return t.mifareClassic; }
    public int getType() { return TYPE_CLASSIC; }
    public int getSize() { return SIZE_1K; }
    public int getSectorCount() { return 16; }
    public int getBlockCount() { return 64; }
    public int getBlockCountInSector(int s) { return 4; }
    public int sectorToBlock(int s) { return s * 4; }
    public int blockToSector(int b) { return b / 4; }
    public boolean authenticateSectorWithKeyA(int s, byte[] key) throws IOException {
        checkConnected(); tag.checkStale();
        boolean ok = Arrays.equals(keysA[s], key); authenticatedSector = ok ? s : -1; return ok;
    }
    public boolean authenticateSectorWithKeyB(int s, byte[] key) throws IOException {
        checkConnected(); tag.checkStale();
        boolean ok = Arrays.equals(keysB[s], key); authenticatedSector = ok ? s : -1; return ok;
    }
    public byte[] readBlock(int b) throws IOException {
        checkConnected(); tag.checkStale();
        if (blockToSector(b) != authenticatedSector) { throw new IOException("Transceive failed"); }
        return blocks[b].clone();
    }
}
