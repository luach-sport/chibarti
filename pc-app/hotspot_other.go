//go:build !windows

package main

import "errors"

// Only Windows has the "Mobile hotspot" that the program turns on.
func hotspot(action string) hotspotInfo { return hotspotInfo{Error: "unsupported"} }

func openHotspotSettings() error { return errors.New("unsupported") }
