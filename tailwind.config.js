/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./*.html', './js/**/*.js'],
    theme: {
      extend: {
        colors: {
          'burger-gold': '#FFD131',
          'apple-bg': '#F4F9F9',
          kds: {
            bg: '#0a0a0a',
            panel: '#141414',
            card: '#1a1a1a',
            yellow: '#FFD131',
            border: '#2a2a2a',
          },
        },
      },
    },
    plugins: [],
  };