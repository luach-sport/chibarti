package main

import (
	"strings"
	"testing"
)

func TestParseHotspot(t *testing.T) {
	// "חיברתי-PC" / "pass word 1" in base64
	h := parseHotspot("WARNING: something\r\nOK\tOn\t15fXmdeR16jXqteZLVBD\tcGFzcyB3b3JkIDE=\t2\r\n")
	if !h.On || h.SSID != "חיברתי-PC" || h.Pass != "pass word 1" || h.Clients != 2 || h.Error != "" {
		t.Fatalf("on: %+v", h)
	}
	if h := parseHotspot("OK\tOff\tQQ==\tQg==\t0"); h.On || h.State != "Off" || h.SSID != "A" {
		t.Fatalf("off: %+v", h)
	}
	if h := parseHotspot("ERR\tWiFiDeviceOff \n"); h.Error != "WiFiDeviceOff" || h.On {
		t.Fatalf("err: %+v", h)
	}
	if h := parseHotspot("garbage"); h.Error != "no-answer" {
		t.Fatalf("garbage: %+v", h)
	}
}

func TestHotspotScriptOnlyFixedWords(t *testing.T) {
	for _, in := range []string{"on", "off", "state", "'; rm -rf /", "ON"} {
		s := hotspotScript(hotspotAction(in))
		if !strings.Contains(s, "$want = '"+hotspotAction(in)+"'") {
			t.Fatalf("%q", in)
		}
		if strings.Contains(s, "rm -rf") {
			t.Fatalf("outside input got into the script: %q", in)
		}
	}
	if !strings.Contains(hotspotScript("on"), "IAsyncOperation`1") || !strings.Contains(hotspotScript("on"), "\"OK`t\"") {
		t.Fatal("PowerShell backticks lost")
	}
}
