/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        university: {
          50: '#eef5ff',
          100: '#dbeaff',
          200: '#bed8ff',
          300: '#91bcff',
          400: '#5b95ff',
          500: '#356df5',
          600: '#244edb',
          700: '#203fb1',
          800: '#20388c',
          900: '#20336f'
        }
      },
      boxShadow: {
        panel: '0 16px 45px rgba(23, 32, 51, 0.08)'
      }
    }
  },
  plugins: []
};
