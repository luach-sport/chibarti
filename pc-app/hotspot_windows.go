//go:build windows

package main

import (
	"context"
	"os/exec"
	"syscall"
	"time"
)

// hotspot runs the script in Windows' built-in PowerShell, with no window.
func hotspot(action string) hotspotInfo {
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", hotspotScript(hotspotAction(action)))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return hotspotInfo{Error: "powershell"}
	}
	return parseHotspot(string(out))
}

// openHotspotSettings opens Windows' own "Mobile hotspot" page (when it can't be turned on from here).
func openHotspotSettings() error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", "ms-settings:network-mobilehotspot").Start()
}
