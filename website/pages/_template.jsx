import React from 'react'
import { Container } from 'react-responsive-grid'

import Headroom from '../../src/index'

import { rhythm } from 'utils/typography'
import 'css/code.css'

module.exports = React.createClass({
  propTypes () {
    return {
      children: React.PropTypes.any,
    }
  },
  render () {
    return (
      <div style={{ marginBottom: rhythm(2) }}>
        <Headroom
          onPin={() => console.log('pinned')}
          onUnpin={() => console.log('unpinned')}
          wrapperStyle={{ marginBottom: rhythm(2) }}
          style={{
            background: '#FF9800',
            boxShadow: '1px 1px 1px rgba(0,0,0,0.25)',
          }}
        >
          <Container style={{ maxWidth: 960, padding: `${rhythm(1/2)}` }}>
            <h1
              style={{
                margin: 0,
                color: 'white',
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
          {this.props.children}
        </Container>
      </div>
    )
  },
})
