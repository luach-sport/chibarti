package com.luachsport.chibarti;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Where a received file is written. By default: photos to Pictures/Chibarti, videos to Movies/Chibarti, audio to
 * Music/Chibarti and everything else (documents, ZIP, APK…) to Download/Chibarti, through Android's own media store,
 * so no storage permission is needed on Android 10+. Or a folder the user picked. A name that's taken gets " (1)".
 * The file is hidden while it's being written and deleted if its check fails. APK files are only saved, never opened.
 */
final class Saver implements IncomingJob.Sinks {
    static final String FOLDER = "Chibarti";
    private final Context ctx;
    private final ContentResolver cr;
    private final String tree;

    Saver(Context c, String treeUri) {
        ctx = c.getApplicationContext();
        cr = ctx.getContentResolver();
        tree = treeUri == null || treeUri.isEmpty() ? null : treeUri;
    }

    static String mimeOf(String name, String mime) {
        if (mime != null && !mime.isEmpty() && !"application/octet-stream".equals(mime)) return mime;
        int dot = name.lastIndexOf('.');
        String m = dot > 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(java.util.Locale.ROOT)) : null;
        return m == null ? "application/octet-stream" : m;
    }

    @Override public IncomingJob.Sink create(IncomingJob.Item it) throws IOException {
        String name = IncomingJob.safeName(it.name), mime = mimeOf(name, it.mime);
        if (tree != null) { try { return treeSink(name, mime); } catch (Exception e) { /* folder gone: fall back to the default */ } }
        if (Build.VERSION.SDK_INT >= 29) return storeSink(name, mime);
        boolean canWrite = ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        File base = canWrite ? Environment.getExternalStoragePublicDirectory(publicDir(mime)) : ctx.getExternalFilesDir("Received");
        if (base == null) base = new File(ctx.getFilesDir(), "Received");
        return fileSink(new File(base, FOLDER), name, canWrite);
    }

    private static String publicDir(String mime) {
        if (mime.startsWith("image/")) return Environment.DIRECTORY_PICTURES;
        if (mime.startsWith("video/")) return Environment.DIRECTORY_MOVIES;
        if (mime.startsWith("audio/")) return Environment.DIRECTORY_MUSIC;
        return Environment.DIRECTORY_DOWNLOADS;
    }

    @android.annotation.TargetApi(29)
    private IncomingJob.Sink storeSink(String name, String mime) throws IOException {
        Uri uri = null;
        try { uri = insert(collection(mime), publicDir(mime), name, mime); } catch (Exception ignored) { }
        if (uri == null) uri = insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), Environment.DIRECTORY_DOWNLOADS, name, mime);
        if (uri == null) throw new IOException("cant-create");
        final Uri u = uri;
        return new IncomingJob.Sink() {
            @Override public OutputStream out() throws IOException {
                OutputStream o = cr.openOutputStream(u, "w");
                if (o == null) throw new IOException("cant-open");
                return new BufferedOutputStream(o, 256 * 1024);
            }
            @Override public void commit() {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(u, v, null, null);
            }
            @Override public void abort() { try { cr.delete(u, null, null); } catch (Exception ignored) { } }
            @Override public String location() { return u.toString(); }
        };
    }

    @android.annotation.TargetApi(29)
    private static Uri collection(String mime) {
        String vol = MediaStore.VOLUME_EXTERNAL_PRIMARY;
        if (mime.startsWith("image/")) return MediaStore.Images.Media.getContentUri(vol);
        if (mime.startsWith("video/")) return MediaStore.Video.Media.getContentUri(vol);
        if (mime.startsWith("audio/")) return MediaStore.Audio.Media.getContentUri(vol);
        return MediaStore.Downloads.getContentUri(vol);
    }

    @android.annotation.TargetApi(29)
    private Uri insert(Uri coll, String dir, String name, String mime) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, dir + "/" + FOLDER);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        return cr.insert(coll, v);
    }

    private IncomingJob.Sink treeSink(String name, String mime) throws Exception {
        Uri t = Uri.parse(tree);
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
        final Uri u = DocumentsContract.createDocument(cr, parent, mime, name);
        if (u == null) throw new IOException("cant-create");
        return new IncomingJob.Sink() {
            @Override public OutputStream out() throws IOException {
                OutputStream o = cr.openOutputStream(u, "w");
                if (o == null) throw new IOException("cant-open");
                return new BufferedOutputStream(o, 256 * 1024);
            }
            @Override public void commit() { }
            @Override public void abort() { try { DocumentsContract.deleteDocument(cr, u); } catch (Exception ignored) { } }
            @Override public String location() { return u.toString(); }
        };
    }

    private IncomingJob.Sink fileSink(File dir, String name, final boolean scan) throws IOException {
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("cant-create");
        final File f = unique(dir, name);
        final File part = new File(dir, "." + f.getName() + ".part");
        return new IncomingJob.Sink() {
            @Override public OutputStream out() throws IOException { return new BufferedOutputStream(new FileOutputStream(part), 256 * 1024); }
            @Override public void commit() throws IOException {
                File target = f.exists() ? unique(dir, f.getName()) : f;
                if (!part.renameTo(target)) throw new IOException("rename");
                if (scan) MediaScannerConnection.scanFile(ctx, new String[] { target.getPath() }, null, null);
                path = target.getPath();
            }
            private String path = f.getPath();
            @Override public void abort() { part.delete(); }
            @Override public String location() { return Uri.fromFile(new File(path)).toString(); }
        };
    }

    /** "photo.jpg" → "photo (1).jpg" when the name is taken. */
    static File unique(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 10000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + " " + System.currentTimeMillis() + ext);
    }

    /** Free space where files go (to refuse a transfer that can't fit, before it starts). */
    static long freeBytes() {
        try { return new android.os.StatFs(Environment.getExternalStorageDirectory().getPath()).getAvailableBytes(); } catch (Exception e) { return Long.MAX_VALUE; }
    }
}
