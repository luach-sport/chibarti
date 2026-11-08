package main

// The window's connection to a phone: the page opens ws://127.0.0.1/ws (no browser warning) and the program
// carries every message to the phone's wss:// and back, unchanged. The phone's certificate is remembered on the
// first approved connection (with the code or the scanned QR) and must match from then on, so nobody else on the
// network can pretend to be that phone.

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"
)

const (
	msgHello    = 1
	msgApproved = 2
	msgDenied   = 3
)

var errChanged = errors.New("certificate changed")

func denied(reason string) []byte {
	b, _ := json.Marshal(map[string]string{"reason": reason})
	return append([]byte{msgDenied}, b...)
}

func (s *server) relay(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("t") != s.token || r.Header.Get("Origin") != s.origin() {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	ip := net.ParseIP(q.Get("ip"))
	port, _ := strconv.Atoi(q.Get("port"))
	id := q.Get("id")
	if ip == nil || !private(ip) || port <= 0 || port > 65535 {
		http.Error(w, "bad phone", http.StatusBadRequest)
		return
	}
	page, err := wsAccept(w, r)
	if err != nil {
		return
	}
	defer page.Close()
	first, err := page.Read()
	if err != nil || len(first) < 2 || first[0] != msgHello {
		return
	}
	var hello struct {
		Mode string `json:"mode"`
	}
	json.Unmarshal(first[1:], &hello)
	pin, havePin := s.store.get(id)
	// a new pairing (code / QR) may meet a new certificate; everything else must be the remembered phone
	fresh := hello.Mode == "pin" || hello.Mode == "claim" || !havePin
	var seen string
	cfg := &tls.Config{InsecureSkipVerify: true, VerifyConnection: func(cs tls.ConnectionState) error {
		if len(cs.PeerCertificates) == 0 {
			return errors.New("no certificate")
		}
		sum := sha256.Sum256(cs.PeerCertificates[0].Raw)
		seen = hex.EncodeToString(sum[:])
		if !fresh && seen != pin.FP {
			return errChanged
		}
		return nil
	}}
	addr := net.JoinHostPort(ip.String(), strconv.Itoa(port))
	ph, err := wsDial(addr, cfg, 6*time.Second)
	if err != nil {
		reason := "unreachable"
		if errors.Is(err, errChanged) {
			reason = "changed"
			log.Printf("phone %s at %s: certificate changed, refused", id, addr)
		}
		page.Write(denied(reason))
		return
	}
	defer ph.Close()
	if err := ph.Write(first); err != nil {
		page.Write(denied("unreachable"))
		return
	}
	go func() {
		defer ph.Close()
		for {
			m, err := page.Read()
			if err != nil {
				return
			}
			if ph.Write(m) != nil {
				return
			}
		}
	}()
	answered := false
	for {
		m, err := ph.Read()
		if err != nil {
			return
		}
		if !answered {
			answered = true
			if len(m) > 0 && m[0] == msgApproved && hello.Mode != "resume" && hello.Mode != "stream" {
				var ok struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				}
				json.Unmarshal(m[1:], &ok)
				if len(ok.ID) == 32 {
					s.store.set(ok.ID, known{FP: seen, IP: ip.String(), Name: ok.Name})
				}
			}
		}
		if page.Write(m) != nil {
			return
		}
	}
}
