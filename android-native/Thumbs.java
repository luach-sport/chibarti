package com.luachsport.chibarti;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Size;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Small previews of photos and videos (chosen to send, or received), made on the phone, as a JPEG data URL. */
final class Thumbs {
    private Thumbs() { }

    static String make(Context c, String uriText, String mime, int size) {
        try {
            Uri uri = Uri.parse(uriText);
            Bitmap b = null;
            if (Build.VERSION.SDK_INT >= 29 && !"file".equals(uri.getScheme())) {
                try { b = c.getContentResolver().loadThumbnail(uri, new Size(size, size), null); } catch (Exception ignored) { }
            }
            if (b == null && mime != null && mime.startsWith("video/")) b = videoFrame(c, uri, size);
            if (b == null) b = image(c.getContentResolver(), uri, size);
            if (b == null) return "";
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 78, out);
            b.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable e) {
            return "";
        }
    }

    private static Bitmap image(ContentResolver cr, Uri uri, int size) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream in = cr.openInputStream(uri);
        if (in == null) return null;
        BitmapFactory.decodeStream(in, null, o);
        in.close();
        if (o.outWidth <= 0) return null;
        int sample = 1;
        while (o.outWidth / (sample * 2) >= size && o.outHeight / (sample * 2) >= size) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        in = cr.openInputStream(uri);
        Bitmap b = BitmapFactory.decodeStream(in, null, d);
        if (in != null) in.close();
        return scale(b, size);
    }

    private static Bitmap videoFrame(Context c, Uri uri, int size) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(c, uri);
            return scale(r.getFrameAtTime(1_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC), size);
        } catch (Exception e) {
            return null;
        } finally {
            try { r.release(); } catch (Exception ignored) { }
        }
    }

    private static Bitmap scale(Bitmap b, int size) {
        if (b == null) return null;
        float s = Math.min(1f, size / (float) Math.max(b.getWidth(), b.getHeight()));
        if (s >= 1f) return b;
        Bitmap r = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * s)), Math.max(1, Math.round(b.getHeight() * s)), true);
        if (r != b) b.recycle();
        return r;
    }
}
