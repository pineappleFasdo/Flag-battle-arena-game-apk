import { defineConfig } from "vite";

export default defineConfig({
  // Capacitor serves the app from the root of the webdir,
  // so we need base: "./" (relative) not "/" (absolute).
  // This ensures all asset paths resolve correctly on Android/iOS.
  base: "./",

  build: {
    outDir: "dist",
    // Inline small assets so Capacitor doesn't need to configure
    // extra CORS / file-access rules for tiny images/fonts.
    assetsInlineLimit: 8192,
    target: ["es2020", "chrome80", "safari13"],
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep matter-js in its own chunk so it can be cached independently
          "vendor-matter": ["matter-js"],
        },
      },
    },
  },

  // Allow .js files to use top-level await (used by some Capacitor plugins)
  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
    },
  },
});
