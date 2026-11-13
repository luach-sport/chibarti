package main

// The program's own little web server, on 127.0.0.1 only (nothing on the network can reach it): the window's page
// (the same files as the phone serves, built in), the list of phones, the relay to a phone, and the mouse/keyboard
// for remote control. A random token (only in the page itself) guards everything; requests from any other site or
// host name are refused.

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed web
var webFS embed.FS

type server struct {
	token    string
	port     int
	store    *store
	finder   *finder
	ctl      *controller
	lastBeat atomic.Int64
	beats    atomic.Int64
	ourSpot  atomic.Bool // the program turned the computer's hotspot on: off again when it closes
	version  string
	openWin  func()
}

func newToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *server) origin() string { return "http://127.0.0.1:" + strconv.Itoa(s.port) }

func jsonNum(n int) string { return strconv.Itoa(n) }

func (s *server) hostOK(r *http.Request) bool {
	h := r.Host
	return h == "127.0.0.1:"+jsonNum(s.port) || h == "localhost:"+jsonNum(s.port)
}

func (s *server) tokenOK(r *http.Request) bool { return r.Header.Get("X-Chibarti") == s.token }

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.hostOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	switch p := r.URL.Path; {
	case p == "/ws":
		s.relay(w, r)
	case p == "/api/hello":
		// another start of the program: open a window of this one
		if r.URL.Query().Get("open") == "1" && s.openWin != nil {
			go s.openWin()
		}
		writeJSON(w, map[string]any{"app": "chibarti-pc", "version": s.version})
	case strings.HasPrefix(p, "/api/"):
		if !s.tokenOK(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		s.api(w, r)
	default:
		s.static(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(v)
}

func (s *server) api(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/beat":
		s.lastBeat.Store(time.Now().UnixMilli())
		s.beats.Add(1)
		w.WriteHeader(204)
	case "/api/phones":
		go s.finder.scan()
		writeJSON(w, s.finder.list())
	case "/api/control":
		var b struct {
			On bool `json:"on"`
		}
		if r.Method != "POST" || json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&b) != nil {
			http.Error(w, "bad", 400)
			return
		}
		s.ctl.on.Store(b.On)
		w.WriteHeader(204)
	case "/api/hotspot":
		// the computer's own hotspot: "on", "off", "state", or "settings" (Windows' page for it)
		var b struct {
			Action string `json:"action"`
		}
		if r.Method != "POST" || json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&b) != nil {
			http.Error(w, "bad", 400)
			return
		}
		if b.Action == "settings" {
			if err := openHotspotSettings(); err != nil {
				writeJSON(w, hotspotInfo{Error: "unsupported"})
				return
			}
			writeJSON(w, hotspotInfo{})
			return
		}
		was := hotspot("state")
		h := was
		if b.Action != "state" {
			h = hotspot(b.Action)
		}
		if b.Action == "on" && h.On && !was.On {
			s.ourSpot.Store(true)
		}
		if b.Action == "off" {
			s.ourSpot.Store(false)
		}
		if h.On {
			go s.finder.scan() // the phone may be on it already
		}
		writeJSON(w, h)
	case "/api/input":
		body, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if r.Method != "POST" || !s.ctl.push(body) {
			http.Error(w, "off", 409)
			return
		}
		w.WriteHeader(204)
	default:
		http.NotFound(w, r)
	}
}

// static serves the page; the font, icon and QR drawing come from the app's own folders, like on the phone.
func (s *server) static(w http.ResponseWriter, r *http.Request) {
	p := path.Clean(r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	rel := strings.TrimPrefix(p, "/")
	if !strings.HasPrefix(rel, "fonts/") && rel != "icon.png" && !strings.HasPrefix(rel, "vendor/") {
		rel = "pc/" + rel
	}
	b, err := fs.ReadFile(webFS, "web/"+rel)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if rel == "pc/index.html" {
		b = s.inject(b)
	}
	ct := mime.TypeByExtension(path.Ext(rel))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Write(b)
}

// inject tells the page it runs inside the program (with the token) and adds the QR drawing.
func (s *server) inject(b []byte) []byte {
	cfg, _ := json.Marshal(map[string]string{"token": s.token, "version": s.version})
	tag := []byte(`<script>window.PC_PROGRAM=` + string(cfg) + `;</script>` + "\n  " + `<script src="vendor/qrcode.js"></script>` + "\n  ")
	at := bytes.Index(b, []byte(`<script src="js/core.js">`))
	if at < 0 {
		return b
	}
	out := append([]byte{}, b[:at]...)
	out = append(out, tag...)
	return append(out, b[at:]...)
}

// listen takes the program's usual port (so the window keeps what it remembers), or any free one.
func listen() (net.Listener, int, error) {
	for _, p := range []string{"127.0.0.1:47823", "127.0.0.1:0"} {
		if l, err := net.Listen("tcp", p); err == nil {
			return l, l.Addr().(*net.TCPAddr).Port, nil
		}
	}
	return nil, 0, os.ErrNotExist
}

func init() {
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".css", "text/css; charset=utf-8")
	mime.AddExtensionType(".html", "text/html; charset=utf-8")
	mime.AddExtensionType(".ttf", "font/ttf")
	mime.AddExtensionType(".svg", "image/svg+xml")
}
