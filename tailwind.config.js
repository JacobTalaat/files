/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary-container': '#00ff41',
        surface: '#0c160a',
        'surface-container': '#182216',
        'surface-container-low': '#141e12',
        'surface-container-high': '#222d20',
        'surface-container-highest': '#2d382a',
        'surface-container-lowest': '#071106',
        'on-surface': '#dae6d2',
        'on-surface-variant': '#b9ccb2',
        background: '#0c160a',
        outline: '#84967e',
        'outline-variant': '#3b4b37',
        error: '#ffb4ab',
        'error-container': '#93000a',
        secondary: '#b9ccb1',
        primary: '#ebffe2',
      },
      borderRadius: { DEFAULT: '0px', lg: '0px', xl: '0px', full: '0px' },
      fontFamily: {
        grotesk: ['Space Grotesk', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};

