/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef5fa',
          100: '#d5e6f2',
          200: '#adcde5',
          300: '#7aaed3',
          400: '#4387b9',
          500: '#1f6699',
          600: '#124f7d',
          700: '#0b3f66',
          800: '#063656',
          900: '#032e4d',
          950: '#021d31',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(3,46,77,0.06), 0 1px 3px rgba(3,46,77,0.08)',
      },
    },
  },
  plugins: [],
}
