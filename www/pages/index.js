import React from 'react'
import { Container } from 'react-responsive-grid'

import Headroom from '../../src/index'

import { rhythm } from 'utils/typography'

const IndexRoute = React.createClass({
  propTypes () {
    return {
      children: React.PropTypes.any,
    }
  },
  render () {
    return (
      <div style={{ marginBottom: rhythm(1) }}>
        <Headroom
          onPin={() => console.log('pinned')}
          onUnpin={() => console.log('unpinned')}
          wrapperStyle={{ marginBottom: rhythm(1) }}
          style={{
            background: 'rgb(57, 111, 176)',
            boxShadow: '1px 1px 1px rgba(0,0,0,0.25)',
          }}
        >
          <Container style={{ maxWidth: 960, padding: `${rhythm(1/2)}` }}>
            <h1
              style={{
                margin: 0,
                color: 'rgb(252, 253, 254)',
              }}
            >
              React Headroom
            </h1>
          </Container>
        </Headroom>
        <Container
          style={{
            maxWidth: 960,
            padding: `${rhythm(1)} ${rhythm(1/2)}`,
            paddingTop: 0,
          }}
        >
          <div dangerouslySetInnerHTML=
            {{
              __html: this.props.data.allMarkdown.edges[0].node.bodyHTML,
            }}
          />
        </Container>
      </div>
    )
  },
})

export default IndexRoute

export const routeQuery = `
  {
    allMarkdown(first: 1) {
      edges {
        node {
          bodyHTML
        }
      }
    }
  }
`
