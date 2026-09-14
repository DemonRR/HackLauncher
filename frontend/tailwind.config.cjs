/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './public/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--theme-color, #165DFF)',
        secondary: '#36CFC9',
        success: '#52C41A',
        warning: '#FAAD14',
        danger: '#FF4D4F',
        dark: '#1D2129',
        'dark-2': '#4E5969',
        'light-1': '#F2F3F5',
        'light-2': '#E5E6EB',
        'light-3': '#C9CDD4'
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif']
      },
      ringColor: {
        primary: 'var(--theme-color, #165DFF)'
      },
      borderColor: {
        primary: 'var(--theme-color, #165DFF)'
      }
    }
  },
  plugins: []
};
