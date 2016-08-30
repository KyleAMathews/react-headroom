import React from 'react'

import { prefixLink } from 'gatsby-helpers'
import { GoogleFont, TypographyStyle } from 'typography-react'
import typography from './utils/typography'

let stats
try {
  stats = require('./public/stats.json')
} catch (e) {
  // ignore
}

module.exports = React.createClass({
  render () {
    let scripts = []
    console.log(this.props)
    if (process.env.NODE_ENV === 'production') {
      scripts.push(<script src={prefixLink(`/${stats.assetsByChunkName.commons[0]}`)} />)
      scripts.push(<script src={prefixLink(`/${stats.assetsByChunkName.routes[0]}`)} />)
      scripts.push(<script src={prefixLink(`/${stats.assetsByChunkName[`route-component---${this.props.componentName}`][0]}`)} />)
      scripts.push(<script src={prefixLink(`/${stats.assetsByChunkName[this.props.pathJSFile][0]}`)} />)
    } else {
      scripts.push(<script src="/commons.js" />)
    }
    return (
      <html lang="en">
        <head>
          <title>React Headroom</title>
          <meta charSet="utf-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <GoogleFont typography={typography} />
          <TypographyStyle typography={typography} />
        </head>
        <body>
          <div id="react-mount" dangerouslySetInnerHTML={{ __html: this.props.body }} />
          {scripts}
        </body>
      </html>
    )
  },
})
