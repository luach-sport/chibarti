// Bundled by esbuild into www/cap-runtime.js so the plain-JS app can reach native plugins.
import { Capacitor, registerPlugin, CapacitorHttp } from '@capacitor/core';

window.ChibartiCap = { Capacitor, registerPlugin, CapacitorHttp };
