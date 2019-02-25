loadImage('./assets/life-forms.svg').then(typeImage => {
  const colors = window.location.hash.substring(1).split(';').filter(v => v)

  const parseColors = i => colors[i]
    .split(',')
    .map(str => str.trim())
    .map(parseFloat)
    .map(value => value / 255)

  const foreground = colors[0] ? parseColors(0) : [1, 1, 1]
  const background = colors[1] ? parseColors(1) : [0, 0, 0]

  console.log(background, foreground)

  const regl = window.createREGL({ pixelRatio: 1 })

  const canvas = document.querySelector('canvas')

  const { width, height } = canvas

  const typeCanvas = document.createElement('canvas')
  const typeContext = typeCanvas.getContext('2d')

  typeCanvas.width = width
  typeCanvas.height = height

  const typeSize = 0.8
  const typeRatio = typeImage.width / typeImage.height
  const canvasRatio = typeCanvas.width / typeCanvas.height

  let typeWidth, typeHeight

  if (typeRatio > canvasRatio) {
    typeWidth = typeCanvas.width
    typeHeight = typeImage.height * (typeWidth / typeImage.width)
  } else {
    typeHeight = typeCanvas.height
    typeWidth = typeImage.width * (typeHeight / typeImage.height)
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

  const lifeFramebuffers = times(2, () =>
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

  const count = (width * height) / 80
  const squared = Math.ceil(Math.sqrt(count))
  const [cols, rows] = [squared, squared]

  const buffer = regl.buffer(
    times(cols, col =>
      times(rows, row => [
        (Math.random() - 0.5) / width,
        (Math.random() - 0.5) / height,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ])
    )
  )

  const stride = 4 * (2 + 2)

  const current = states => ({ tick }) => states[tick % 2]
  const previous = states => ({ tick }) => states[(tick + 1) % 2]

  const draw = regl({
    vert: `
      precision highp float;
      attribute vec2 freq;
      attribute vec2 phase;
      uniform float time;

      void main () {
        vec2 position = freq.xy * time + phase.xy;

        position = position - 1.0 * floor(position / 1.0);

        gl_PointSize = 1.0;
        gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
      }
    `,

    frag: `
      precision highp float;

      void main () {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `,

    attributes: {
      freq: {
        buffer,
        stride,
        offset: 0
      },

      phase: {
        buffer,
        stride,
        offset: 8
      }
    },

    uniforms: {
      time: ({ time }) => time * 40
    },

    count: count,

    primitive: 'points'
  })

  const quad = {
    vert: `
      precision highp float;
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
    ],
  }

  const life = regl({
    ...quad,

    frag: `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D texture;
      uniform sampler2D typeTexture;
      uniform sampler2D previous;
      uniform vec2 dimensions;

      void main () {
        vec2 unit = vec2(1.0) / dimensions;
        vec3 color = texture2D(texture, uv).rgb;
        float type = texture2D(typeTexture, uv).a;

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
              ).r;
            }
          }

          float self = texture2D(previous, uv).r;

          if (neighbors <= 3.0 + self && neighbors >= 3.0) {
            color += 1.0;
          }
        }

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

  const output = regl({
    ...quad,

    frag: `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D texture;
      uniform vec3 background;
      uniform vec3 foreground;

      void main () {
        vec3 color = texture2D(texture, uv).rgb;

        if (color.r > 0.0) {
          gl_FragColor = vec4(foreground, 1.0);
        } else {
          gl_FragColor = vec4(background, 1.0);
        }
      }
    `,

    uniforms: {
      texture: regl.prop('texture'),
      background,
      foreground
    }
  })

  const currentLifeBuffer = current(lifeFramebuffers)
  const previousLifeBuffer = previous(lifeFramebuffers)

  regl.frame(context => {
    drawFramebuffer.use(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      draw()
    })

    currentLifeBuffer(context).use(() => {
      life({
        previous: previousLifeBuffer(context)
      })
    })

    output({
      texture: currentLifeBuffer(context)
    })
  })

  window.running = true
})

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
