//go:build !windows

package main

import (
	"fmt"
	"os"
)

// On other systems (the tests) nothing is moved: every action is written to CHIBARTI_INPUT_LOG if set.
type logDriver struct{ f *os.File }

func platformDriver() driver {
	if p := os.Getenv("CHIBARTI_INPUT_LOG"); p != "" {
		if f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
			return logDriver{f}
		}
	}
	return logDriver{}
}

func (d logDriver) w(s string, a ...any) {
	if d.f != nil {
		fmt.Fprintf(d.f, s+"\n", a...)
	}
}
func (d logDriver) move(x, y float64)        { d.w("move %.3f %.3f", x, y) }
func (d logDriver) button(right, down bool)  { d.w("button right=%v down=%v", right, down) }
func (d logDriver) wheel(n float64)          { d.w("wheel %.2f", n) }
func (d logDriver) key(vk uint16, down bool) { d.w("key %d %v", vk, down) }
func (d logDriver) char(u uint16, down bool) {
	if down {
		d.w("char %c", rune(u))
	}
}
