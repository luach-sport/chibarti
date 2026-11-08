// חיברתי למחשב: the program for Windows. It opens its own window (the same page the phone serves, without the
// browser warning), finds the phones on the network, connects to a remembered one by itself, and lets the phone
// control this computer when allowed. It closes a little after its window is closed.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

var version = "dev"

func main() {
	noWindow := flag.Bool("no-window", false, "don't open a window (tests)")
	stay := flag.Bool("stay", false, "keep running without a window (tests)")
	flag.Parse()

	dir := dataDir()
	if f, err := os.OpenFile(filepath.Join(dir, "chibarti.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600); err == nil {
		log.SetOutput(io.MultiWriter(f, os.Stderr))
	}

	ln, port, err := listen()
	if err != nil {
		log.Fatal(err)
	}
	if port != 47823 && !*stay {
		// the usual port is taken: maybe חיברתי is already running, then it opens a window and this copy ends
		if r, err := http.Get("http://127.0.0.1:47823/api/hello?open=1"); err == nil {
			r.Body.Close()
			if r.StatusCode == 200 {
				return
			}
		}
	}

	st := loadStore(dir)
	s := &server{token: newToken(), port: port, store: st, finder: newFinder(st), version: version}
	s.ctl = newController(platformDriver())
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	s.openWin = func() {
		if err := openWindow(url, filepath.Join(dir, "window")); err != nil {
			log.Printf("window: %v", err)
		}
	}
	go s.finder.scan()
	fmt.Printf("READY %d %s\n", port, s.token)
	log.Printf("חיברתי %s on %s", version, url)
	if !*noWindow {
		s.openWin()
	}
	go func() {
		srv := &http.Server{Handler: s, ReadHeaderTimeout: 10 * time.Second}
		log.Fatal(srv.Serve(ln))
	}()
	if *stay {
		select {}
	}
	// closes when the window is gone: no heartbeat for 15 s (or none at all for 2 minutes after starting)
	start := time.Now()
	for range time.Tick(2 * time.Second) {
		last := s.lastBeat.Load()
		if last == 0 && time.Since(start) > 2*time.Minute {
			return
		}
		if last != 0 && time.Since(time.UnixMilli(last)) > 15*time.Second {
			return
		}
	}
}
