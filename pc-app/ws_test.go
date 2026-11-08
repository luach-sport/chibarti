package main

import (
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func parseIP(s string) net.IP { return net.ParseIP(s) }

// A message goes both ways through the program's WebSocket (client to a TLS server), large ones too.
func TestWebSocketRoundTrip(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := wsAccept(w, r)
		if err != nil {
			return
		}
		defer c.Close()
		for {
			m, err := c.Read()
			if err != nil {
				return
			}
			c.Write(append([]byte{9}, m...))
		}
	}))
	defer srv.Close()
	c, err := wsDial(strings.TrimPrefix(srv.URL, "https://"), &tls.Config{InsecureSkipVerify: true}, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	for _, n := range []int{1, 125, 126, 65535, 65536, 3 << 20} {
		msg := make([]byte, n)
		for i := range msg {
			msg[i] = byte(i * 7)
		}
		if err := c.Write(msg); err != nil {
			t.Fatal(err)
		}
		back, err := c.Read()
		if err != nil || len(back) != n+1 || back[0] != 9 || back[n] != msg[n-1] {
			t.Fatalf("size %d: %v %d", n, err, len(back))
		}
	}
}

func TestAcceptKey(t *testing.T) {
	if wsAcceptKey("dGhlIHNhbXBsZSBub25jZQ==") != "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" {
		t.Fatal("RFC 6455 example")
	}
}

// The page is built in, with the program's token added; other hosts are refused.
func TestPageAndHost(t *testing.T) {
	s := &server{token: "tok", port: 47999, store: loadStore(t.TempDir())}
	s.finder = newFinder(s.store)
	s.ctl = newController(&rec{})
	r := httptest.NewRequest("GET", "http://127.0.0.1:47999/", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `window.PC_PROGRAM={"token":"tok"`) {
		t.Fatalf("page: %d %.200s", w.Code, w.Body.String())
	}
	r = httptest.NewRequest("GET", "http://evil.example:47999/", nil)
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("other host", w.Code)
	}
	r = httptest.NewRequest("POST", "http://127.0.0.1:47999/api/input", strings.NewReader(`{"t":"k","k":"enter"}`))
	r.Header.Set("X-Chibarti", "tok")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 409 {
		t.Fatal("input while control is off", w.Code)
	}
}
