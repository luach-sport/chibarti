package main

// The phone controlling this computer: the same INPUT messages a phone sends to a phone, turned into the mouse and
// the keyboard of the main screen. Only while the user allowed it in the window (/api/control), one at a time.
//   {t:"g", p:[[x,y,ms],...]}  a touch: tap = click, held without moving = right click, moving = drag
//   {t:"w", x, y, dy}          scroll (fraction of the screen height, + = down)
//   {t:"k", k:"esc"|"win"|"enter"|"backspace"|"tab"|"back"|"home"|"recents"}
//   {t:"s", s:"text"}          typing

import (
	"encoding/json"
	"math"
	"sync/atomic"
	"time"
)

type inputMsg struct {
	T  string      `json:"t"`
	P  [][]float64 `json:"p"`
	X  float64     `json:"x"`
	Y  float64     `json:"y"`
	Dy float64     `json:"dy"`
	K  string      `json:"k"`
	S  string      `json:"s"`
}

// what a platform can do (Windows: SendInput; elsewhere: nothing, for tests)
type driver interface {
	move(x, y float64)
	button(right, down bool)
	wheel(notches float64)
	key(vk uint16, down bool)
	char(u uint16, down bool)
}

type controller struct {
	on  atomic.Bool
	q   chan inputMsg
	drv driver
	log func(string)
}

func newController(d driver) *controller {
	c := &controller{q: make(chan inputMsg, 256), drv: d}
	go c.run()
	return c
}

func (c *controller) push(b []byte) bool {
	if !c.on.Load() {
		return false
	}
	var m inputMsg
	if json.Unmarshal(b, &m) != nil {
		return false
	}
	select {
	case c.q <- m:
		return true
	default:
		return false
	}
}

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }

const (
	vkBack   = 0x08
	vkTab    = 0x09
	vkReturn = 0x0D
	vkEscape = 0x1B
	vkLWin   = 0x5B
)

func (c *controller) run() {
	for m := range c.q {
		if !c.on.Load() {
			continue
		}
		if c.log != nil {
			c.log(m.T)
		}
		switch m.T {
		case "g":
			c.gesture(m.P)
		case "w":
			c.drv.move(clamp01(m.X), clamp01(m.Y))
			c.drv.wheel(-m.Dy * 10)
		case "k":
			c.keyName(m.K)
		case "s":
			for _, u := range utf16(m.S) {
				c.drv.char(u, true)
				c.drv.char(u, false)
			}
		}
	}
}

func (c *controller) gesture(p [][]float64) {
	if len(p) == 0 || len(p[0]) < 2 {
		return
	}
	x0, y0 := clamp01(p[0][0]), clamp01(p[0][1])
	c.drv.move(x0, y0)
	if len(p) == 1 {
		held := len(p[0]) > 2 && p[0][2] >= 600
		c.drv.button(held, true)
		c.drv.button(held, false)
		return
	}
	c.drv.button(false, true)
	last := 0.0
	for _, q := range p[1:] {
		if len(q) < 2 {
			continue
		}
		if len(q) > 2 {
			wait := math.Min(q[2]-last, 40)
			if wait > 0 {
				time.Sleep(time.Duration(wait) * time.Millisecond)
			}
			last = q[2]
		}
		c.drv.move(clamp01(q[0]), clamp01(q[1]))
	}
	c.drv.button(false, false)
}

func (c *controller) keyName(k string) {
	press := func(vk ...uint16) {
		for _, v := range vk {
			c.drv.key(v, true)
		}
		for i := len(vk) - 1; i >= 0; i-- {
			c.drv.key(vk[i], false)
		}
	}
	switch k {
	case "esc", "back":
		press(vkEscape)
	case "win", "home":
		press(vkLWin)
	case "recents":
		press(vkLWin, vkTab)
	case "enter":
		press(vkReturn)
	case "backspace":
		press(vkBack)
	case "tab":
		press(vkTab)
	}
}

func utf16(s string) []uint16 {
	var out []uint16
	for _, r := range s {
		if r >= 0x10000 {
			r -= 0x10000
			out = append(out, uint16(0xD800+(r>>10)), uint16(0xDC00+(r&0x3FF)))
		} else {
			out = append(out, uint16(r))
		}
	}
	return out
}
