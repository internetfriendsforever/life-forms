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
    extensions: ['OES_texture_float']
  })

  const width = window.innerWidth
  const height = window.innerHeight

  const typeCanvas = document.createElement('canvas')
  const typeContext = typeCanvas.getContext('2d')

  typeCanvas.width = width
  typeCanvas.height = height

  const typeSize = 0.75
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

  const typeTexture = regl.texture({
    data: typeCanvas,
    flipY: true
  })

  const noiseFramebuffers = times(2, () =>
    regl.framebuffer({
      depthStencil: false,
      color: regl.texture({
        type: 'float',
        format: 'rgb',
        width: 64,
        height: 64,
        wrapS: 'repeat',
        wrapT: 'repeat'
      })
    })
  )

  const fieldFramebuffer = regl.framebuffer({
    depthStencil: false,
    color: regl.texture({
      type: 'float',
      format: 'rgb',
      width: width,
      height: height
    })
  })

  const count = 50000
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

      void main () {
        vec2 noise;
        vec2 sample = uv * scale * vec2(aspect, 1.0) + vec2(seed * 1000.0, 0);

        noise += cellular2D(sample);
        noise.x -= 0.4;
        noise.y -= 0.7;
        // noise += direction;

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
      uniform sampler2D typeTexture;
      uniform sampler2D spaceField;
      uniform sampler2D typeField;

      void main () {
        // float flowMix = 1.0;
        float flowMix = 1.1 - (1.0 / (time * 5.0));
        float stencilMix = 0.5;

        float stencilA = mix(1.0, pow(texture2D(typeTexture, uv).a, 100.0), stencilMix);
        float stencilB = 1.0 - stencilA;

        vec2 spaceFlow = vec2(
          texture2D(spaceField, uv + sin(time / 80.0)).x,
          texture2D(spaceField, uv + cos(time / 30.0)).y
        );

        vec2 typeFlow = vec2(
          texture2D(typeField, uv + sin(time / 50.0)).x,
          texture2D(typeField, uv + cos(time / 60.0)).y
        );

        vec2 color = mix(
          spaceFlow * stencilA,
          typeFlow * stencilB,
          flowMix
        );

        gl_FragColor = vec4(color, 0.0, 1.0);
      }
    `,

    uniforms: {
      time: regl.context('time'),
      typeTexture: typeTexture,
      spaceField: noiseFramebuffers[0],
      typeField: noiseFramebuffers[1]
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
      velocityField: fieldFramebuffer,
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

        gl_PointSize = 4.0;
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

    primitive: 'points'
  })

  noiseFramebuffers[0].use(() => {
    drawNoise({
      scale: 12,
      seed: Math.random(),
      direction: [0, 0]
    })
  })

  noiseFramebuffers[1].use(() => {
    drawNoise({
      scale: 7,
      seed: Math.random(),
      direction: [0, 0]
    })
  })

  regl.frame(() => {
    if (params.debugField) {
      return drawField()
    }

    fieldFramebuffer.use(() => drawField())

    updateVelocities()
    updatePositions()

    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })

    draw()
  })
})
