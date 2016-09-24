import Typography from 'typography'
import theme from 'typography-theme-noriega'
import CodePlugin from 'typography-plugin-code'

theme.plugins = [new CodePlugin()]
theme.bodyFontFamily = ['Palatino', 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', 'Georgia', 'serif']
theme.headerFontFamily = ['Palatino', 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', 'Georgia', 'serif']
theme.googleFonts = []

const typography = new Typography(theme)

// Hot reload typography in development.
if (process.env.NODE_ENV !== 'production') {
  typography.injectStyles()
}

export default typography
