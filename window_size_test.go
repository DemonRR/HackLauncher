package main

import "testing"

func TestInitialWindowSizeFromConfig(t *testing.T) {
	tests := []struct {
		name       string
		settings   map[string]interface{}
		wantWidth  int
		wantHeight int
	}{
		{name: "defaults", settings: map[string]interface{}{}, wantWidth: defaultWindowWidth, wantHeight: defaultWindowHeight},
		{name: "saved json values", settings: map[string]interface{}{"initialWindowWidth": float64(1440), "initialWindowHeight": float64(900)}, wantWidth: 1440, wantHeight: 900},
		{name: "reject below minimum", settings: map[string]interface{}{"initialWindowWidth": float64(800), "initialWindowHeight": float64(500)}, wantWidth: defaultWindowWidth, wantHeight: defaultWindowHeight},
		{name: "reject fractional value", settings: map[string]interface{}{"initialWindowWidth": 1200.5, "initialWindowHeight": float64(720)}, wantWidth: defaultWindowWidth, wantHeight: 720},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			width, height := initialWindowSizeFromConfig(Config{"settings": test.settings})
			if width != test.wantWidth || height != test.wantHeight {
				t.Fatalf("initialWindowSizeFromConfig() = %d x %d, want %d x %d", width, height, test.wantWidth, test.wantHeight)
			}
		})
	}
}
