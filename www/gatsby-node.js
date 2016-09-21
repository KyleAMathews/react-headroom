exports.createPages = () => (
  new Promise((resolve) => {
    const pages = []
    const indexPage = require.resolve('./page-templates/index.js')
    pages.push({
      path: '/',
      component: indexPage,
    })
    resolve(pages)
  })
)
