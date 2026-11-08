//go:build windows

package main

// The window: Microsoft Edge (on every Windows 10/11) in app mode — a plain window with the program's own name and
// icon, no address bar — with its own profile, so the user's browser isn't touched. Chrome if Edge is missing.

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func browsers() []string {
	pf86, pf, local := os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")
	return []string{
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(local, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(local, `Google\Chrome\Application\chrome.exe`),
	}
}

func openWindow(url, profile string) error {
	for _, b := range browsers() {
		if _, err := os.Stat(b); err != nil {
			continue
		}
		cmd := exec.Command(b, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check",
			"--window-size=1280,840", "--lang=he", "--autoplay-policy=no-user-gesture-required",
			"--disable-features=Translate,msEdgeSidebarV2,msUndersideButton")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false}
		if err := cmd.Start(); err == nil {
			go cmd.Wait()
			return nil
		}
	}
	// no Edge or Chrome: the default browser (a normal tab)
	if err := exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start(); err == nil {
		return nil
	}
	return errors.New("no browser found")
}
