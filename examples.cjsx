React = require('react')
Headroom = require '../src/index'
{Container} = require 'react-responsive-grid'

module.exports = React.createClass
  render: ->
    <div style={{marginBottom: 64}}>
      <Headroom
        onPin={-> console.log "pinned"}
        onUnpin={-> console.log "unpinned"}
        style={{
          height: 76
          background: '#FF9800'
          boxShadow: "1px 2px 2px #aaa"
        }}
      >
        <Container style={maxWidth:'1000px', padding: '0 16px'}>
          <h1 style={{
            margin: 0
            padding: "16px 0"
            color: 'white'
          }}>
            React Headroom
          </h1>
        </Container>
      </Headroom>
      <Container style={maxWidth:'1000px', padding: '0 16px'}>
        <div style={{marginTop: 76}}>
          <br />
          <br />
          <a href="https://github.com/KyleAMathews/react-headroom">Code on Github</a>
          <br />
          <br />
          <p>React Headroom is a native React Component to hide/show your header
          on scroll.
          The header on this site is a living example. When you scroll down, it
          slides out of view and slides back in when scrolling up.
          </p>
          <p>Fixed headers are nice when you want persistent navigation but they
          can also get in the way especially on mobile where screen space is scarce.
          Using this component let's you have your persistent navigation while
          preserving screen space when the navigation is not needed.
          </p>

          <h2>Using React Headroom</h2>
          <p>It's very simple actually :)</p>
          <p>Here's an example:</p>

          <pre><code>
          {"""
            <Headroom style={{background: 'red'}}>
              <h1>You can put anything you'd like inside the Headroom Component</h1>
            </Headroom>
            """}
          </code></pre>

          <h3>Overriding animation</h3>

          <p>The component is intended to be plug n' play meaning it has sensible
          defaults for animating the header in and out. If you'd like to override
          the default animation, you have two options.
          </p>
          <p>One option is you can override the default inline styles like the following
          example:
          </p>

          <pre><code>
          {"""
            <Headroom style={{
              background: 'red'
              webkitTransition: "all .5s ease-in-out"
              mozTransition: "all .5s ease-in-out"
              oTransition: "all .5s ease-in-out"
              transition: "all .5s ease-in-out"
            }}>
              <h1>You can put anything you'd like inside the Headroom Component</h1>
            </Headroom>
            """}
          </code></pre>

          <p>Another option is to use css. The component has a <code>headroom</code> class
          as well as a <code>headroom--pinned</code> or <code>headroom--unpinned</code> depending on its
          pinned state. As css can't override inline styles, first disable
          the animation styles by passing in the <code>disableInlineStyles</code> prop. Then in
          your css do something like:
          </p>

          <pre><code>
          {"""
          .headroom {
            transition: transform 200ms linear;
            position: fixed;
            left: 0;
            right: 0;
            top: 0;
            zIndex: 1;
          }
          .headroom--pinned {
            transform: translateY(0%);
          }
          .headroom--unpinned {
            transform: translateY(-100%);
          }
          """}
          </code></pre>

          <h3>Other options</h3>
          <ul>
            <li><code>onPin</code> — callback called when header is pinned</li>
            <li><code>onUnpin</code> — callback called when header is unpinned</li>
            <li><code>offset</code> — vertical offset in px before component is first unpinned</li>
            <li><code>upTolerance</code> — scroll tolerance in px when scrolling up before component is pinned</li>
            <li><code>downTolerance</code> — scroll tolerance in px when scrolling down before component is pinned</li>
            <li><code>disable</code> — disable pinning and unpinning</li>
          </ul>
        </div>
      </Container>
    </div>
