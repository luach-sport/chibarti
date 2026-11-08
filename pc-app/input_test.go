package main

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

type rec struct{ out []string }

func (r *rec) move(x, y float64)        { r.out = append(r.out, fmt.Sprintf("move %.2f %.2f", x, y)) }
func (r *rec) button(right, down bool)  { r.out = append(r.out, fmt.Sprintf("btn %v %v", right, down)) }
func (r *rec) wheel(n float64)          { r.out = append(r.out, fmt.Sprintf("wheel %.1f", n)) }
func (r *rec) key(vk uint16, down bool) { r.out = append(r.out, fmt.Sprintf("key %d %v", vk, down)) }
func (r *rec) char(u uint16, down bool) {
	if down {
		r.out = append(r.out, fmt.Sprintf("char %d", u))
	}
}

func run(t *testing.T, msgs ...string) string {
	r := &rec{}
	c := newController(r)
	if c.push([]byte(msgs[0])) {
		t.Fatal("input accepted while control is off")
	}
	c.on.Store(true)
	for _, m := range msgs {
		if !c.push([]byte(m)) {
			t.Fatal("refused", m)
		}
	}
	time.Sleep(200 * time.Millisecond)
	return strings.Join(r.out, "|")
}

func TestTapLongPressDrag(t *testing.T) {
	got := run(t, `{"t":"g","p":[[0.5,0.25,90]]}`, `{"t":"g","p":[[0.1,0.9,800]]}`, `{"t":"g","p":[[0,0,0],[0.5,0.5,20],[2,2,40]]}`)
	want := "move 0.50 0.25|btn false true|btn false false|move 0.10 0.90|btn true true|btn true false|move 0.00 0.00|btn false true|move 0.50 0.50|move 1.00 1.00|btn false false"
	if got != want {
		t.Fatalf("\n got %s\nwant %s", got, want)
	}
}

func TestWheelKeysText(t *testing.T) {
	got := run(t, `{"t":"w","x":0.5,"y":0.5,"dy":0.3}`, `{"t":"k","k":"recents"}`, `{"t":"s","s":"אב😀"}`)
	want := "move 0.50 0.50|wheel -3.0|key 91 true|key 9 true|key 9 false|key 91 false|char 1488|char 1489|char 55357|char 56832"
	if got != want {
		t.Fatalf("\n got %s\nwant %s", got, want)
	}
}

func TestPrivateAddressesOnly(t *testing.T) {
	for ip, want := range map[string]bool{"192.168.49.1": true, "10.0.0.7": true, "172.20.1.1": true, "172.32.0.1": false, "8.8.8.8": false, "127.0.0.1": false} {
		if got := private(parseIP(ip)); got != want {
			t.Errorf("%s: %v", ip, got)
		}
	}
}
