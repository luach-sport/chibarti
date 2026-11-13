package main

import (
	"encoding/base64"
	"strconv"
	"strings"
)

// The computer's own hotspot (Windows "Mobile hotspot"): the computer stays on its Wi-Fi with internet and shares a
// small network of its own; the phone joins it, and both are on one network — no need to leave the Wi-Fi for the
// phone's network. Windows does it from the same Wi-Fi card on most computers.
type hotspotInfo struct {
	On      bool   `json:"on"`
	State   string `json:"state"`
	SSID    string `json:"ssid"`
	Pass    string `json:"pass"`
	Clients int    `json:"clients"`
	Error   string `json:"error,omitempty"`
}

// parseHotspot reads the script's one line: "OK<tab>state<tab>ssid(b64)<tab>pass(b64)<tab>clients" or "ERR<tab>why".
func parseHotspot(out string) hotspotInfo {
	line := ""
	for _, l := range strings.Split(strings.ReplaceAll(out, "\r", ""), "\n") {
		if strings.HasPrefix(l, "OK\t") || strings.HasPrefix(l, "ERR\t") {
			line = l
		}
	}
	if line == "" {
		return hotspotInfo{Error: "no-answer"}
	}
	p := strings.Split(line, "\t")
	if p[0] == "ERR" {
		why := strings.TrimSpace(strings.Join(p[1:], " "))
		if why == "" {
			why = "failed"
		}
		return hotspotInfo{Error: why}
	}
	if len(p) < 5 {
		return hotspotInfo{Error: "no-answer"}
	}
	dec := func(s string) string {
		b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(s))
		if err != nil {
			return ""
		}
		return string(b)
	}
	n, _ := strconv.Atoi(strings.TrimSpace(p[4]))
	st := strings.TrimSpace(p[1])
	return hotspotInfo{On: st == "On", State: st, SSID: dec(p[2]), Pass: dec(p[3]), Clients: n}
}

// hotspotScript turns the hotspot on or off (or just reads it) through Windows' own tethering API, from the
// built-in PowerShell. No input from outside goes into it: action is one of three fixed words.
func hotspotScript(action string) string {
	return `$ErrorActionPreference='Stop'
try {
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$m = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + `1' } | Select-Object -First 1
function Await($op, [Type]$t) { $task = $m.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(25000); $task.Result }
$null = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]
$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]
$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]
$p = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($p -eq $null) { "ERR` + "`" + `tno-internet"; exit }
$t = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
$want = '` + action + `'
if ($want -eq 'on' -and "$($t.TetheringOperationalState)" -ne 'On') {
  $r = Await ($t.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
  if ("$($r.Status)" -ne 'Success') { "ERR` + "`" + `t" + $r.Status + " " + $r.AdditionalErrorMessage; exit }
  for ($i = 0; $i -lt 24 -and "$($t.TetheringOperationalState)" -ne 'On'; $i++) { Start-Sleep -Milliseconds 250 }
}
if ($want -eq 'off' -and "$($t.TetheringOperationalState)" -eq 'On') {
  $r = Await ($t.StopTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
  for ($i = 0; $i -lt 24 -and "$($t.TetheringOperationalState)" -eq 'On'; $i++) { Start-Sleep -Milliseconds 250 }
}
$c = $t.GetCurrentAccessPointConfiguration()
$b = { param($s) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$s)) }
"OK` + "`" + `t" + $t.TetheringOperationalState + "` + "`" + `t" + (& $b $c.Ssid) + "` + "`" + `t" + (& $b $c.Passphrase) + "` + "`" + `t" + $t.ClientCount
} catch { "ERR` + "`" + `t" + $_.Exception.Message }
`
}

func hotspotAction(a string) string {
	switch a {
	case "on", "off":
		return a
	}
	return "state"
}
