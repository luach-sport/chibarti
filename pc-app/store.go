package main

// What the program keeps between runs (next to its log, in the user's app-data folder): each phone's certificate
// fingerprint (so only the real phone is talked to after the first connection) and where it was last seen.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type known struct {
	FP   string `json:"fp"`
	IP   string `json:"ip"`
	Name string `json:"name"`
}

type store struct {
	mu   sync.Mutex
	path string
	Pins map[string]known `json:"pins"`
}

func dataDir() string {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base = os.TempDir()
	}
	d := filepath.Join(base, "Chibarti")
	os.MkdirAll(d, 0o700)
	return d
}

func loadStore(dir string) *store {
	s := &store{path: filepath.Join(dir, "phones.json"), Pins: map[string]known{}}
	if b, err := os.ReadFile(s.path); err == nil {
		json.Unmarshal(b, s)
		if s.Pins == nil {
			s.Pins = map[string]known{}
		}
	}
	return s
}

func (s *store) get(id string) (known, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k, ok := s.Pins[id]
	return k, ok
}

func (s *store) set(id string, k known) {
	s.mu.Lock()
	s.Pins[id] = k
	b, _ := json.MarshalIndent(s, "", "  ")
	s.mu.Unlock()
	tmp := s.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, s.path)
	}
}

func (s *store) ips() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for _, k := range s.Pins {
		if k.IP != "" {
			out = append(out, k.IP)
		}
	}
	return out
}
