package main

// A small WebSocket (RFC 6455): binary messages, ping/pong and close. The server side talks to the program's own
// window; the client side talks to the phone over TLS. Messages are [type][body], exactly as the phone sends them.

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const maxMessage = 32 << 20

type wsConn struct {
	c      net.Conn
	r      *bufio.Reader
	client bool // a client masks what it sends
	wmu    sync.Mutex
	once   sync.Once
}

func wsAcceptKey(key string) string {
	h := sha1.Sum([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h[:])
}

// wsAccept turns an HTTP request from the window into a WebSocket.
func wsAccept(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") || key == "" {
		http.Error(w, "websocket only", http.StatusBadRequest)
		return nil, errors.New("not a websocket")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("no hijack")
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{})
	brw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + wsAcceptKey(key) + "\r\n\r\n")
	if err := brw.Flush(); err != nil {
		conn.Close()
		return nil, err
	}
	return &wsConn{c: conn, r: brw.Reader}, nil
}

// wsDial opens the phone's /ws over TLS (cfg decides which certificate is accepted).
func wsDial(addr string, cfg *tls.Config, timeout time.Duration) (*wsConn, error) {
	d := &net.Dialer{Timeout: timeout}
	tc, err := tls.DialWithDialer(d, "tcp", addr, cfg)
	if err != nil {
		return nil, err
	}
	kb := make([]byte, 16)
	rand.Read(kb)
	key := base64.StdEncoding.EncodeToString(kb)
	_ = tc.SetDeadline(time.Now().Add(timeout))
	req := "GET /ws HTTP/1.1\r\nHost: " + addr + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n"
	if _, err := io.WriteString(tc, req); err != nil {
		tc.Close()
		return nil, err
	}
	br := bufio.NewReaderSize(tc, 65536)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		tc.Close()
		return nil, err
	}
	if resp.StatusCode != 101 || resp.Header.Get("Sec-WebSocket-Accept") != wsAcceptKey(key) {
		tc.Close()
		return nil, errors.New("handshake refused")
	}
	_ = tc.SetDeadline(time.Time{})
	return &wsConn{c: tc, r: br, client: true}, nil
}

// Read returns the next whole message (answers pings; io.EOF when closed).
func (w *wsConn) Read() ([]byte, error) {
	var msg []byte
	for {
		var h [2]byte
		if _, err := io.ReadFull(w.r, h[:]); err != nil {
			return nil, err
		}
		fin, op := h[0]&0x80 != 0, h[0]&0x0f
		masked, n := h[1]&0x80 != 0, uint64(h[1]&0x7f)
		if n == 126 {
			var b [2]byte
			if _, err := io.ReadFull(w.r, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		} else if n == 127 {
			var b [8]byte
			if _, err := io.ReadFull(w.r, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
		}
		if n > maxMessage || uint64(len(msg))+n > maxMessage {
			return nil, errors.New("message too big")
		}
		var mask [4]byte
		if masked {
			if _, err := io.ReadFull(w.r, mask[:]); err != nil {
				return nil, err
			}
		}
		p := make([]byte, n)
		if _, err := io.ReadFull(w.r, p); err != nil {
			return nil, err
		}
		if masked {
			for i := range p {
				p[i] ^= mask[i&3]
			}
		}
		switch op {
		case 0x8: // close: answer once, then hang up
			code := []byte{}
			if len(p) >= 2 {
				code = p[:2]
			}
			w.frame(0x8, code)
			w.Close()
			return nil, io.EOF
		case 0x9:
			w.frame(0xA, p)
			continue
		case 0xA:
			continue
		case 0x0, 0x1, 0x2:
			msg = append(msg, p...)
			if fin {
				return msg, nil
			}
		default:
			return nil, errors.New("bad frame")
		}
	}
}

// Write sends one binary message.
func (w *wsConn) Write(b []byte) error { return w.frame(0x2, b) }

func (w *wsConn) frame(op byte, p []byte) error {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	head := make([]byte, 0, 14)
	head = append(head, 0x80|op)
	mbit := byte(0)
	if w.client {
		mbit = 0x80
	}
	switch n := len(p); {
	case n < 126:
		head = append(head, mbit|byte(n))
	case n < 65536:
		head = append(head, mbit|126, byte(n>>8), byte(n))
	default:
		head = append(head, mbit|127, 0, 0, 0, 0, byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	data := p
	if w.client {
		var mask [4]byte
		rand.Read(mask[:])
		head = append(head, mask[:]...)
		data = make([]byte, len(p))
		for i := range p {
			data[i] = p[i] ^ mask[i&3]
		}
	}
	if _, err := w.c.Write(append(head, data...)); err != nil {
		return err
	}
	return nil
}

func (w *wsConn) Close() { w.once.Do(func() { w.c.Close() }) }
