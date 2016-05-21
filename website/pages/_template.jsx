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
      <div style={{ marginBottom: 64 }}>
        <Headroom
          onPin={() => console.log('pinned')}
          onUnpin={() => console.log('unpinned')}
          wrapperStyle={{ marginBottom: '3rem' }}
          style={{
            background: '#FF9800',
            boxShadow: '1px 2px 2px #aaa',
          }}
        >
          <Container style={{ maxWidth: '1000px', padding: '0 1.5rem' }}>
            <h1
              style={{
                margin: 0,
                padding: '.75rem 0',
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
