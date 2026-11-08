//go:build !windows

package main

import (
	"fmt"
	"os/exec"
)

// Other systems (development): the default browser, or just the address.
func openWindow(url, profile string) error {
	if err := exec.Command("xdg-open", url).Start(); err != nil {
		fmt.Println("open", url)
	}
	return nil
}
