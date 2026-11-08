//go:build windows

package main

// SendInput: the same way an on-screen keyboard or a remote-support tool moves the mouse and types.

import (
	"syscall"
	"unsafe"
)

var (
	user32        = syscall.NewLazyDLL("user32.dll")
	procSendInput = user32.NewProc("SendInput")
)

const (
	inputMouse    = 0
	inputKeyboard = 1

	mouseMove     = 0x0001
	mouseLeftDown = 0x0002
	mouseLeftUp   = 0x0004
	mouseRightDn  = 0x0008
	mouseRightUp  = 0x0010
	mouseWheel    = 0x0800
	mouseAbsolute = 0x8000

	keyUp      = 0x0002
	keyUnicode = 0x0004
)

type mouseInput struct {
	Dx, Dy    int32
	MouseData uint32
	Flags     uint32
	Time      uint32
	Extra     uintptr
}

type keyInput struct {
	Vk, Scan uint16
	Flags    uint32
	Time     uint32
	Extra    uintptr
}

// INPUT: a 4-byte type, padding, then the 32-byte union (64-bit Windows)
type input struct {
	Type uint32
	_    uint32
	U    [32]byte
}

func send(in input) {
	procSendInput.Call(1, uintptr(unsafe.Pointer(&in)), unsafe.Sizeof(in))
}

func mouse(m mouseInput) {
	in := input{Type: inputMouse}
	*(*mouseInput)(unsafe.Pointer(&in.U[0])) = m
	send(in)
}

func keyb(k keyInput) {
	in := input{Type: inputKeyboard}
	*(*keyInput)(unsafe.Pointer(&in.U[0])) = k
	send(in)
}

type winDriver struct{}

func platformDriver() driver { return winDriver{} }

// places on the main screen: 0..65535 in both directions
func (winDriver) move(x, y float64) {
	mouse(mouseInput{Dx: int32(x * 65535), Dy: int32(y * 65535), Flags: mouseMove | mouseAbsolute})
}

func (winDriver) button(right, down bool) {
	f := uint32(mouseLeftUp)
	switch {
	case right && down:
		f = mouseRightDn
	case right:
		f = mouseRightUp
	case down:
		f = mouseLeftDown
	}
	mouse(mouseInput{Flags: f})
}

func (winDriver) wheel(notches float64) {
	mouse(mouseInput{MouseData: uint32(int32(notches * 120)), Flags: mouseWheel})
}

func (winDriver) key(vk uint16, down bool) {
	f := uint32(0)
	if !down {
		f = keyUp
	}
	keyb(keyInput{Vk: vk, Flags: f})
}

func (winDriver) char(u uint16, down bool) {
	f := uint32(keyUnicode)
	if !down {
		f |= keyUp
	}
	keyb(keyInput{Scan: u, Flags: f})
}
