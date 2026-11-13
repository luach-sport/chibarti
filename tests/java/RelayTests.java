package com.luachsport.chibarti;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

import static com.luachsport.chibarti.ChibartiTests.check;
import static com.luachsport.chibarti.ChibartiTests.test;

/**
 * A room's host passing files between two members (Relay): numbers translated both ways, pieces and "finished" in
 * order, the sender held while the receiver is behind, and a member that leaves cancels the transfer on the other side.
 */
final class RelayTests {
    private RelayTests() { }

    static final String A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    /** What the host sends to each member: control messages, and pieces with their queue length. */
    static final class Fake implements Relay.Out {
        final Map<String, List<Object[]>> sent = new HashMap<>();
        final Map<String, Integer> queue = new HashMap<>();
        final List<String> gone = new ArrayList<>();
        List<Object[]> to(String id) { List<Object[]> l = sent.get(id); if (l == null) { l = new ArrayList<>(); sent.put(id, l); } return l; }
        public void control(String to, int type, JSONObject o) { to(to).add(new Object[] { type, o }); }
        public int bulk(String to, int type, byte[] body) {
            if (gone.contains(to)) return -1;
            to(to).add(new Object[] { type, body });
            int n = (queue.containsKey(to) ? queue.get(to) : 0) + 1;
            queue.put(to, n);
            return n;
        }
        public int waiting(String to) { return queue.containsKey(to) ? queue.get(to) : 0; }
        JSONObject last(String id, int type) {
            List<Object[]> l = to(id);
            for (int i = l.size() - 1; i >= 0; i--) if ((Integer) l.get(i)[0] == type && l.get(i)[1] instanceof JSONObject) return (JSONObject) l.get(i)[1];
            return null;
        }
    }

    static void run() {
        test("room: the host passes an offer, the answer, pieces and the check between two members", () -> {
            Fake f = new Fake();
            Relay r = new Relay(f, 1_000_000);
            r.offer(A, "Galaxy", new JSONObject().put("tid", 7).put("files", new org.json.JSONArray()).put("total", 10).put("to", B), B);
            JSONObject off = f.last(B, Proto.OFFER);
            int bt = off.getInt("tid");
            check(bt != 7 && !off.has("to") && off.getJSONObject("from").getString("id").equals(A) && off.getJSONObject("from").getString("name").equals("Galaxy"), "offer to B: " + off);
            check(r.handle(B, Proto.OFFER_REPLY, new JSONObject().put("tid", bt).put("accept", true)), "answer is relayed");
            check(f.last(A, Proto.OFFER_REPLY).getInt("tid") == 7, "answer under A's number");
            byte[] piece = Proto.chunk(7, 1, 0, new byte[] { 1, 2, 3 }, 3);
            check(r.chunk(A, piece), "piece relayed");
            check(ByteBuffer.wrap((byte[]) f.to(B).get(f.to(B).size() - 1)[1]).getInt() == bt, "piece under B's number");
            check(r.handle(A, Proto.FILE_END, new JSONObject().put("tid", 7).put("fid", 1).put("size", 3).put("sha", "x")), "finished relayed");
            Object[] lastB = f.to(B).get(f.to(B).size() - 1);
            check((Integer) lastB[0] == Proto.FILE_END && lastB[1] instanceof byte[], "finished goes in line with the pieces");
            check(r.handle(B, Proto.FILE_ACK, new JSONObject().put("tid", bt).put("fid", 1).put("ok", true)), "check result relayed");
            check(f.last(A, Proto.FILE_ACK).getInt("tid") == 7, "check result under A's number");
            check(!r.handle(A, Proto.FILE_ACK, new JSONObject().put("tid", 99)), "a transfer for the host itself isn't taken");
            check(!r.chunk(A, Proto.chunk(99, 1, 0, new byte[1], 1)), "a piece for the host itself isn't taken");
        });

        test("room: the sender waits while the receiver is behind, and goes on when it caught up", () -> {
            Fake f = new Fake();
            Relay r = new Relay(f, 1_000_000);
            r.offer(A, "Galaxy", new JSONObject().put("tid", 3).put("to", B), B);
            for (int i = 0; i < Relay.HIGH + 5; i++) r.chunk(A, Proto.chunk(3, 1, i, new byte[] { 9 }, 1));
            List<Object[]> toA = f.to(A);
            int holds = 0;
            for (Object[] o : toA) if ((Integer) o[0] == Proto.HOLD) { holds++; check(((JSONObject) o[1]).getBoolean("on") && ((JSONObject) o[1]).getInt("tid") == 3, "hold on"); }
            check(holds == 1, "asked to hold once: " + holds);
            f.queue.put(B, 20);
            r.drained(B);
            check(f.last(A, Proto.HOLD).getBoolean("on"), "not yet: still behind");
            f.queue.put(B, Relay.LOW);
            r.drained(B);
            check(!f.last(A, Proto.HOLD).getBoolean("on"), "goes on");
        });

        test("room: a member that leaves stops the transfer on the other side; a late resume is refused", () -> {
            Fake f = new Fake();
            Relay r = new Relay(f, 1_000_000);
            r.offer(A, "Galaxy", new JSONObject().put("tid", 5).put("to", B), B);
            int bt = f.last(B, Proto.OFFER).getInt("tid");
            r.gone(B);
            JSONObject c = f.last(A, Proto.CANCEL);
            check(c != null && c.getInt("tid") == 5 && c.getString("reason").equals("lost"), "sender told");
            check(r.size() == 0, "route removed");
            check(!r.handle(B, Proto.OFFER_REPLY, new JSONObject().put("tid", bt).put("accept", true)), "no route any more");
            r.offer(A, "Galaxy", new JSONObject().put("tid", 5).put("resume", true).put("to", B), B);
            JSONObject no = f.last(A, Proto.OFFER_REPLY);
            check(no != null && !no.getBoolean("accept") && no.getString("reason").equals("lost"), "resume refused");
            r.offer(A, "Galaxy", new JSONObject().put("tid", 6).put("to", B), B);
            r.gone(A);
            check(f.last(B, Proto.CANCEL).getString("reason").equals("lost"), "receiver told when the sender leaves");
        });

        test("room: a whole file goes from member to member through the host and passes its check", () -> {
            Fake f = new Fake();
            Relay r = new Relay(f, 1_000_000);
            byte[] data = Crypto.random(700_000);
            OutgoingJob out = new OutgoingJob(11);
            out.items.add(new OutgoingJob.Item(1, "movie.mp4", "video/mp4", data.length, () -> new ByteArrayInputStream(data)));
            r.offer(A, "Galaxy", new JSONObject().put("tid", 11).put("to", B), B);
            int bt = f.last(B, Proto.OFFER).getInt("tid");
            ChibartiTests.Mem m = new ChibartiTests.Mem();
            IncomingJob in = new IncomingJob(bt, m);
            in.items.add(new IncomingJob.Item(1, "movie.mp4", "video/mp4", data.length));
            out.run(new OutgoingJob.Wire() {
                public void chunk(int t, int fid, long o, byte[] b, int l) { r.chunk(A, Proto.chunk(t, fid, o, b, l)); }
                public void end(int t, int fid, long s, String h) throws IOException {
                    try { r.handle(A, Proto.FILE_END, new JSONObject().put("tid", t).put("fid", fid).put("size", s).put("sha", h)); } catch (Exception e) { throw new IOException(e); }
                }
            });
            String result = null;
            for (Object[] o : f.to(B)) {
                if ((Integer) o[0] == Proto.CHUNK) {
                    byte[] b = (byte[]) o[1];
                    ByteBuffer bb = ByteBuffer.wrap(b);
                    check(bb.getInt() == bt, "B's number");
                    int fid = bb.getInt();
                    long off = bb.getLong();
                    in.onChunk(fid, off, b, 16, b.length - 16);
                } else if ((Integer) o[0] == Proto.FILE_END) {
                    JSONObject e = new JSONObject(new String((byte[]) o[1], Proto.UTF8));
                    result = in.onEnd(e.getInt("fid"), e.getLong("size"), e.getString("sha"));
                }
            }
            check(result == null, "check: " + result);
            check(Arrays.equals(m.files.get("movie.mp4").toByteArray(), data), "same bytes");
        });
    }
}
