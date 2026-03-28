/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        factory: {
          bg: '#06100e',
          accent: '#6effc4',
          yellow: '#f9c74f',
          red: '#ff6b6b',
          text: '#d4edd8',
          dim: '#445544',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        dot: ['"DotGothic16"', 'monospace'],
      },
    },
  },
  plugins: [],
}
