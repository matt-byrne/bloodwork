import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Tauri requires a fixed port so it knows where to load the dev server from
	server: {
		host: 'localhost',
		port: 5173,
		strictPort: true
	}
});
