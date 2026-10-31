import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        rolldownOptions: {
            external: ['./EmptyEpsilon.js']
        },
        assetsDir: 'webassets'
    }
})