package com.luachsport.chibarti;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

/**
 * The real name of a picked file, the one the file manager shows. Some pickers (Android's photo picker, some galleries)
 * give a number instead ("1000023456.jpg"): then the name is looked up again in the phone's media list, or taken from
 * the file's path, and the right extension is added when it's missing.
 */
final class FileNames {
    private FileNames() { }

    static final class Info { String name; long size = -1; }

    static Info of(Context ctx, Uri u) {
        ContentResolver cr = ctx.getContentResolver();
        Info r = new Info();
        r.name = u.getLastPathSegment();
        try (Cursor c = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                if (!c.isNull(0)) r.name = c.getString(0);
                if (!c.isNull(1)) r.size = c.getLong(1);
            }
        } catch (Exception ignored) { }
        if (looksNumbered(r.name)) {
            // some providers also have the file's path or its title
            try (Cursor c = cr.query(u, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    String better = pathName(col(c, "_data"));
                    if (better == null) better = withTitle(col(c, "title"), r.name);
                    if (better != null) r.name = better;
                }
            } catch (Exception ignored) { }
        }
        if (looksNumbered(r.name)) {
            String better = fromMediaStore(cr, u);
            if (better != null) r.name = better;
        }
        if (r.name == null || r.name.isEmpty()) r.name = "file";
        String mime = null;
        try { mime = cr.getType(u); } catch (Exception ignored) { }
        r.name = withExtension(r.name, mime);
        return r;
    }

    /** "1000023456" or "1000023456.jpg": a number that a picker made up, not the file's name. */
    static boolean looksNumbered(String n) {
        return n == null || n.isEmpty() || n.matches("[0-9]{3,}(\\.[A-Za-z0-9]{1,5})?") || n.matches("(image|video|audio|document|msf):[0-9]+");
    }

    private static String col(Cursor c, String name) {
        int i = c.getColumnIndex(name);
        if (i < 0 || c.isNull(i)) return null;
        try { return c.getString(i); } catch (Exception e) { return null; }
    }

    private static String pathName(String path) {
        if (path == null || path.isEmpty()) return null;
        int s = path.lastIndexOf('/');
        String n = s >= 0 ? path.substring(s + 1) : path;
        return n.isEmpty() || looksNumbered(n) ? null : n;
    }

    private static String withTitle(String title, String numbered) {
        if (title == null || title.trim().isEmpty() || looksNumbered(title)) return null;
        int dot = numbered == null ? -1 : numbered.lastIndexOf('.');
        String ext = dot > 0 ? numbered.substring(dot) : "";
        return title.endsWith(ext) ? title : title + ext;
    }

    /** The photo picker's address ends with the media's number: ask the media list for its real name. */
    private static String fromMediaStore(ContentResolver cr, Uri u) {
        long id;
        try { id = Long.parseLong(u.getLastPathSegment().replaceAll("^[a-z]+:", "")); } catch (Exception e) { return null; }
        Uri[] lists = {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            MediaStore.Files.getContentUri("external")
        };
        for (Uri list : lists) {
            try (Cursor c = cr.query(ContentUris.withAppendedId(list, id), new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) {
                    String n = c.getString(0);
                    if (n != null && !looksNumbered(n)) return n;
                }
            } catch (Exception ignored) { }
        }
        return null;
    }

    /** "photo" + image/jpeg → "photo.jpg", so the other phone knows how to open it. */
    static String withExtension(String name, String mime) {
        if (name.lastIndexOf('.') > 0 || mime == null) return name;
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return ext == null || ext.isEmpty() ? name : name + "." + ext;
    }
}
