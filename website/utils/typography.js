import Typography from 'typography'

const options = {
  baseFontSize: '18px',
  baseLineHeight: '24px',
  headerFontFamily: '"Lato", sans-serif',
  bodyFontFamily: '"Lato", sans-serif',
  bodyWeight: 300,
  headerWeight: 700,
  boldWeight: 700,
  googleFonts: [
    {
      name: 'Lato',
      styles: [
        '300',
        '700',
      ],
    },
    {
      name: 'Inconsolata',
      styles: [
        '400',
      ],
    },
  ],
  modularScales: [
    {
      scale: 'golden',
    },
  ],
}

const typography = new Typography(options)

// Hot reload typography in development.
if (process.env.NODE_ENV !== 'production') {
  typography.injectStyles()
}

export default typography
