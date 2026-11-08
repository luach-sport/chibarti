package main

// Finding the phones that offer a connection: every phone running חיברתי ("חיבור למחשב", or open with a remembered
// computer) answers GET /id on its HTTPS port. The program asks the addresses next to its own (the same /24 network),
// the phone's own network address (192.168.49.1) and the last known addresses — outgoing only, so Windows asks no
// firewall question.

import (
	"bufio"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type phone struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	IP    string `json:"ip"`
	Port  int    `json:"port"`
	FP    string `json:"fp"`
	Known bool   `json:"known"`
	seen  time.Time
}

type finder struct {
	mu       sync.Mutex
	phones   map[string]*phone
	scanning bool
	lastScan time.Time
	st       *store
	port     int
}

func newFinder(st *store) *finder { return &finder{phones: map[string]*phone{}, st: st, port: 8443} }

// private reports whether an address is on a home/office network (never the internet).
func private(ip net.IP) bool {
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	if ip4[0] == 127 && os.Getenv("CHIBARTI_TEST") == "1" {
		return true // the tests run a pretend phone on this computer
	}
	return ip4[0] == 10 || (ip4[0] == 172 && ip4[1]&0xf0 == 16) || (ip4[0] == 192 && ip4[1] == 168)
}

func candidates(extra []string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, e := range extra {
		add(e)
	}
	add("192.168.49.1")
	for _, e := range strings.Split(os.Getenv("CHIBARTI_PROBE"), ",") {
		if e = strings.TrimSpace(e); e != "" {
			add(e)
		}
	}
	ifs, _ := net.Interfaces()
	for _, in := range ifs {
		if in.Flags&net.FlagUp == 0 || in.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := in.Addrs()
		for _, a := range addrs {
			n, ok := a.(*net.IPNet)
			if !ok || !private(n.IP) {
				continue
			}
			me := n.IP.To4()
			for h := 1; h < 255; h++ {
				if byte(h) == me[3] {
					continue
				}
				add(fmt.Sprintf("%d.%d.%d.%d", me[0], me[1], me[2], h))
			}
		}
	}
	return out
}

// probe asks one address "are you a חיברתי phone?" and returns it with its certificate's fingerprint.
func probe(ip string, port int) *phone {
	addr := net.JoinHostPort(ip, fmt.Sprint(port))
	c, err := net.DialTimeout("tcp", addr, 400*time.Millisecond)
	if err != nil {
		return nil
	}
	tc := tls.Client(c, &tls.Config{InsecureSkipVerify: true})
	defer tc.Close()
	tc.SetDeadline(time.Now().Add(2 * time.Second))
	if err := tc.Handshake(); err != nil {
		return nil
	}
	certs := tc.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil
	}
	fmt.Fprintf(tc, "GET /id HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", addr)
	resp, err := http.ReadResponse(bufio.NewReader(tc), nil)
	if err != nil || resp.StatusCode != 200 {
		return nil
	}
	var id struct {
		App  string `json:"app"`
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&id) != nil || id.App != "chibarti" || len(id.ID) != 32 {
		return nil
	}
	sum := sha256.Sum256(certs[0].Raw)
	return &phone{ID: id.ID, Name: id.Name, IP: ip, Port: port, FP: hex.EncodeToString(sum[:]), seen: time.Now()}
}

// scan looks for phones once (about a second on a home network); results stay for 8 seconds.
func (f *finder) scan() {
	f.mu.Lock()
	if f.scanning || time.Since(f.lastScan) < 1500*time.Millisecond {
		f.mu.Unlock()
		return
	}
	f.scanning = true
	f.mu.Unlock()
	list := candidates(f.st.ips())
	sem := make(chan struct{}, 96)
	var wg sync.WaitGroup
	for _, ip := range list {
		wg.Add(1)
		sem <- struct{}{}
		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()
			if p := probe(ip, f.port); p != nil {
				f.mu.Lock()
				f.phones[p.ID] = p
				f.mu.Unlock()
			}
		}(ip)
	}
	wg.Wait()
	f.mu.Lock()
	f.scanning = false
	f.lastScan = time.Now()
	f.mu.Unlock()
}

// list returns the phones seen lately, remembered ones first.
func (f *finder) list() []phone {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []phone
	for id, p := range f.phones {
		if time.Since(p.seen) > 8*time.Second {
			delete(f.phones, id)
			continue
		}
		k, ok := f.st.get(id)
		q := *p
		q.Known = ok && k.FP == p.FP
		out = append(out, q)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Known != out[j].Known {
			return out[i].Known
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func (f *finder) find(id string) (phone, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if p, ok := f.phones[id]; ok {
		return *p, true
	}
	return phone{}, false
}
