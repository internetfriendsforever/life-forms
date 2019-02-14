const params = {
  debugField: false
}

window.addEventListener('keydown', e => {
  console.log(e.keyCode)

  if (e.keyCode === 68) { // key: d
    params.debugField = !params.debugField
  }
})

Promise.all([
  window.fetch('./lib/cellular2D.glsl').then(res => res.text()),
  loadImage('./assets/life-forms.svg')
]).then(([
  cellular2D,
  typeImage
]) => {
  const regl = window.createREGL({
    extensions: ['OES_texture_float'],
    pixelRatio: 0.5
  })

  const canvas = document.querySelector('canvas')

  canvas.style.imageRendering = 'pixelated'

  const width = canvas.width
  const height = canvas.height

  const typeCanvas = document.createElement('canvas')
  const typeContext = typeCanvas.getContext('2d')

  typeCanvas.width = width
  typeCanvas.height = height

  const typeSize = 0.95
  const typeRatio = typeImage.width / typeImage.height
  const canvasRatio = typeCanvas.width / typeCanvas.height

  let typeWidth, typeHeight

  if (typeRatio > canvasRatio) {
    typeWidth = typeCanvas.width
    typeHeight = typeImage.height * (typeWidth / typeImage.width)
  } else {
    typeHeight = typeCanvas.height
    typeWidth = typeCanvas.width * (typeHeight / typeImage.height)
  }

  typeWidth *= typeSize
  typeHeight *= typeSize

  typeContext.translate(typeCanvas.width / 2, typeCanvas.height / 2)
  typeContext.drawImage(typeImage, -typeWidth / 2, -typeHeight / 2, typeWidth, typeHeight)

  const drawFramebuffer = regl.framebuffer({
    depthStencil: false,
    color: regl.texture({
      width: width,
      height: height
    })
  })

  const outputFramebuffers = times(2, () =>
    regl.framebuffer({
      depthStencil: false,
      color: regl.texture({
        width: width,
        height: height
      })
    })
  )

  const typeTexture = regl.texture({
    data: typeCanvas,
    flipY: true
  })

  const noiseFramebuffer = regl.framebuffer({
    depthStencil: false,
    color: regl.texture({
      type: 'float',
      format: 'rgb',
      width: 256,
      height: 256,
      wrapS: 'mirror',
      wrapT: 'mirror'
    })
  })

  const fieldFramebuffer = regl.framebuffer({
    depthStencil: false,
    color: regl.texture({
      type: 'float',
      format: 'rgb',
      width: width,
      height: height
    })
  })

  const count = 100
  const squared = Math.ceil(Math.sqrt(count))
  const [cols, rows] = [squared, squared]

  const buffer = regl.buffer(
    times(cols, col =>
      times(rows, row =>
        [col, row]
      )
    )
  )

  const createPingPong = data => times(2, () =>
    regl.framebuffer({
      depthStencil: false,
      color: regl.texture({
        type: 'float',
        format: 'rgb',
        data
      })
    })
  )

  const positions = createPingPong(
    times(cols, () =>
      times(rows, () =>
        [Math.random(), Math.random(), 0]
      )
    )
  )

  const velocities = createPingPong(
    times(cols, () =>
      times(rows, () =>
        [0, 0, 0]
      )
    )
  )

  const current = states => ({ tick }) => states[tick % 2]
  const previous = states => ({ tick }) => states[(tick + 1) % 2]

  const quad = {
    vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 uv;

      void main () {
        uv = position;
        gl_Position = vec4(position * 2.0 - 1.0, 0, 1);
      }
    `,

    attributes: {
      position: [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0]
      ]
    },

    elements: [
      [0, 1, 2],
      [2, 3, 0]
    ]
  }

  const drawNoise = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform float aspect;
      uniform float scale;
      uniform float seed;
      uniform vec2 direction;

      ${cellular2D}

      float rand (vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main () {
        vec2 noise;
        vec2 sample = uv * scale * vec2(aspect, 1.0) + vec2(seed * 1000.0, 0);

        noise += cellular2D(sample);
        noise.x -= 0.4;
        noise.y -= 0.7;
        noise += direction;

        // noise += (rand(uv) - 0.5) * 0.2;

        gl_FragColor = vec4(noise, 0.0, 1.0);
      }
    `,

    uniforms: {
      aspect: width / height,
      scale: regl.prop('scale'),
      seed: regl.prop('seed'),
      direction: regl.prop('direction')
    }
  })

  const drawField = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform float time;
      uniform sampler2D noise;

      void main () {
        vec2 color = vec2(
          texture2D(noise, uv + sin(time / 80.0)).x,
          texture2D(noise, uv + cos(time / 30.0)).y
        );

        gl_FragColor = vec4(color, 0.0, 1.0);
      }
    `,

    uniforms: {
      time: regl.context('time'),
      noise: noiseFramebuffer,
    }
  })

  const updateVelocities = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D velocityField;
      uniform sampler2D previousPositions;
      uniform sampler2D previousVelocities;

      void main () {
        vec3 position = texture2D(previousPositions, uv).xyz;
        vec3 velocity = texture2D(previousVelocities, uv).xyz;
        vec3 field = texture2D(velocityField, position.xy).xyz;

        velocity += field / 2000.0;
        velocity *= 0.8;

        gl_FragColor = vec4(velocity, 1.0);
      }
    `,

    framebuffer: current(velocities),

    uniforms: {
      velocityField: regl.prop('velocityField'),
      previousPositions: previous(positions),
      previousVelocities: previous(velocities)
    }
  })

  const updatePositions = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D previousPositions;
      uniform sampler2D currentVelocities;

      void main () {
        vec3 position = texture2D(previousPositions, uv).xyz;
        vec3 velocity = texture2D(currentVelocities, uv).xyz;

        position += velocity;
        position.xy = position.xy - 1.0 * floor(position.xy / 1.0);

        gl_FragColor = vec4(position, 1.0);
      }
    `,

    framebuffer: current(positions),

    uniforms: {
      previousPositions: previous(positions),
      currentVelocities: previous(velocities)
    }
  })

  const draw = regl({
    vert: `
      precision mediump float;
      attribute vec2 index;
      uniform vec2 dimensions;
      uniform sampler2D currentPositions;

      void main () {
        vec2 sample = index / dimensions;
        vec3 position = texture2D(currentPositions, sample).xyz;

        gl_PointSize = 1.0;
        gl_Position = vec4(position * 2.0 - 1.0, 1.0);
      }
    `,

    frag: `
      void main () {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `,

    attributes: {
      index: buffer
    },

    uniforms: {
      dimensions: [cols, rows],
      currentPositions: current(positions)
    },

    count: count,

    primitive: 'points',

    framebuffer: drawFramebuffer
  })

  const output = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D texture;
      uniform sampler2D typeTexture;
      uniform sampler2D previous;
      uniform vec2 dimensions;

      void main () {
        vec2 unit = vec2(1.0) / dimensions;
        // vec3 color = texture2D(texture, uv).rgb;
        float type = texture2D(typeTexture, uv).a;

        vec3 color;

        if (type > 0.0) {
          float neighbors = 0.0;

          for (int dx = -1; dx <= 1; ++dx) {
            for (int dy = -1; dy <= 1; ++dy) {
              neighbors += texture2D(
                previous,
                uv + vec2(
                  float(dx) * unit.x,
                  float(dy) * unit.y
                )
              ).r > 0.1 ? 1.0 : 0.0;
            }
          }

          float self = texture2D(texture, uv).r;

          if (neighbors <= 3.0 + self && neighbors >= 3.0) {
            // color += vec3(1.0, 0.5, 0.4);
            color += 1.0;
          }

          color += self;
        }

        color += texture2D(previous, uv).rgb;
        color -= 0.005;

        gl_FragColor = vec4(color, 1.0);
      }
    `,

    uniforms: {
      dimensions: [width, height],
      texture: drawFramebuffer,
      previous: regl.prop('previous'),
      typeTexture: typeTexture
    }
  })

  noiseFramebuffer.use(() => {
    drawNoise({
      scale: 10,
      seed: Math.random(),
      direction: [0, 0]
    })
  })

  const currentOutputBuffer = current(outputFramebuffers)
  const previousOutputBuffer = previous(outputFramebuffers)

  regl.frame(context => {
    if (params.debugField) {
      return drawField()
    }

    fieldFramebuffer.use(() => drawField())

    updateVelocities({
      velocityField: fieldFramebuffer
    })

    updatePositions()

    drawFramebuffer.use(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 0
      })

      draw()
    })

    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })

    currentOutputBuffer(context).use(() => {
      output({
        previous: previousOutputBuffer(context)
      })
    })

    output({
      texture: currentOutputBuffer(context),
      previous: previousOutputBuffer(context)
    })
  })
})
