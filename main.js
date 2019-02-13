run()

async function run () {
  const regl = window.createREGL({
    extensions: ['OES_texture_float']
  })

  const width = window.innerWidth
  const height = window.innerHeight

  const simplex2d = await window.fetch('./lib/simplex2d.glsl').then(res => res.text())
  const typeImage = await loadImage('./assets/life-forms.svg')

  typeImage.width = width
  typeImage.height = height

  const typeTexture = regl.texture({
    data: typeImage,
    flipY: true
  })

  const velocityFieldFramebuffer = regl.framebuffer({
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

  const buffer = regl.buffer(times(cols, col => times(rows, row => [col, row])))

  const createFramebuffer = data => regl.framebuffer({
    depthStencil: false,
    color: regl.texture({
      type: 'float',
      format: 'rgb',
      data
    })
  })

  const createPingPong = data => [
    createFramebuffer(data),
    createFramebuffer(data)
  ]

  const positions = createPingPong(times(cols, () => times(rows, () => [
    Math.random(),
    Math.random(),
    0
  ])))

  const velocities = createPingPong(times(cols, () => times(rows, () => [
    0,
    0,
    0
  ])))

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

  const updateVelocityField = regl({
    ...quad,

    frag: `
      precision mediump float;
      varying vec2 uv;
      uniform float time;
      uniform sampler2D typeTexture;
      uniform float aspect;

      ${simplex2d}

      vec2 createField (vec2 uv) {
        return vec2(
          simplex2d(uv),
          simplex2d(uv + vec2(2.0, 0.0))
        );
      }

      void main () {
        float type = 1.0 - texture2D(typeTexture, uv).a;

        // vec2 scaledUv = uv * 15.0 * (5.0 * type + 1.0);
        // vec2 scaledUv = uv * vec2(aspect, 1.0) * 20.0 * (7.0 * type + 0.1);
        vec2 scaledUv = uv * vec2(aspect, 1.0) * 4.0 / (1.03 - type);

        vec2 field = createField(vec2(scaledUv));

        field += createField(vec2(scaledUv / 10.0));
        field += createField(vec2(scaledUv / 5.0));
        field += createField(vec2(scaledUv / 2.0));
        field += createField(vec2(scaledUv * 2.0));
        field += createField(vec2(scaledUv * 5.0));
        field += createField(vec2(scaledUv * 10.0));

        field /= 8.0;

        field.x /= (type * 0.5 + 0.5);
        field.y /= (type * 0.5 + 0.5);

        // field.x -= ((1.0 - type) * 0.5 + 0.1);
        // z -= type * 0.5 + 0.1;

        gl_FragColor = vec4(field, 0.0, 1.0);
      }
    `,

    uniforms: {
      time: regl.context('time'),
      typeTexture: typeTexture,
      aspect: ({ viewportWidth, viewportHeight }) => viewportWidth / viewportHeight
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

        velocity -= field / 2000.0;
        velocity *= 0.92;

        gl_FragColor = vec4(velocity, 1.0);
      }
    `,

    framebuffer: current(velocities),

    uniforms: {
      velocityField: velocityFieldFramebuffer,
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
      uniform sampler2D typeTexture;

      void main () {
        vec3 position = texture2D(previousPositions, uv).xyz;
        vec3 velocity = texture2D(currentVelocities, uv).xyz;
        float type = texture2D(typeTexture, position.xy).a;

        // position += velocity / (type + 0.01);
        position += velocity;

        position.xy = position.xy - 1.0 * floor(position.xy / 1.0);

        gl_FragColor = vec4(position, 1.0);
      }
    `,

    framebuffer: current(positions),

    uniforms: {
      typeTexture: typeTexture,
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

        gl_PointSize = 3.0;
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

  velocityFieldFramebuffer.use(() => {
    updateVelocityField()
  })

  regl.frame(() => {
    updateVelocities()
    updatePositions()

    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })

    draw()
  })
}

function loadImage (src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.src = src
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', reject)
  })
}

function times (n, fn = i => i) {
  return Array(n).fill().map((n, i) => fn(i))
}
