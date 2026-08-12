/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.html", "./js/**/*.js"],
    theme: {
      extend: {
        colors: {
          'burger-gold': '#FFD131',
          'apple-bg': '#F4F9F9',
        }
      },
    },
    plugins: [],
  }