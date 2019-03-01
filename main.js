const params = new URLSearchParams(window.location.search.substring(1))

const getColorParam = key => {
  try {
    return params.get(key)
      .split(',')
      .map(str => str.trim())
      .map(parseFloat)
      .map(value => value / 255)
  } catch (error) {
    return null
  }
}

const foreground = getColorParam('foreground') || [1, 1, 1]
const background = getColorParam('background') || [0, 0, 0]
const typeFile = params.get('typeFile') || 'web'
const typeSize = parseFloat(params.get('typeSize') || 0.8, 10)
const particlesMultiplier = parseFloat(params.get('particles') || 1, 10)
const pixelRatio = parseFloat(params.get('pixelRatio') || 1, 10)
const noiseScale = parseFloat(params.get('noiseScale') || 1, 10)

loadImage(`./assets/${typeFile}.svg`).then(typeImage => {
  const regl = window.createREGL({ pixelRatio: pixelRatio })
  const canvas = document.querySelector('canvas')

  const { width, height } = canvas

  const typeCanvas = document.createElement('canvas')
  const typeContext = typeCanvas.getContext('2d')

  typeCanvas.width = width
  typeCanvas.height = height

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

  const count = ((width * height) / 100) * particlesMultiplier
  const positions = new Float32Array(count * 2)
  const velocities = new Float32Array(count * 2)

  for (let i = 0; i < positions.length; i += 2) {
    positions[i] = Math.random() - 0.5
    positions[i + 1] = Math.random() - 0.5
  }

  const positionsBuffer = regl.buffer(positions)

  const simplexA = new SimplexNoise(Math.random().toString())
  const simplexB = new SimplexNoise(Math.random().toString())

  const noiseSize = 1024
  const noiseA = new Float32Array(noiseSize * noiseSize)
  const noiseB = new Float32Array(noiseSize * noiseSize)

  for (let i = 0; i < noiseA.length; i++) {
    const scale = 30
    const x = ((i % noiseSize) / noiseSize) * scale
    const y = (((i / noiseSize) | 0) / noiseSize) * scale
    noiseA[i] = simplexB.noise2D(x / 5, y / 5) / 10000 + 0.0001
    noiseB[i] = simplexB.noise2D(x / 10, y / 10) / 10000
  }

  const draw = regl({
    vert: `
      precision highp float;
      attribute vec2 position;
      attribute vec2 phase;
      uniform float time;

      void main () {
        vec2 wrapped = position - 1.0 * floor(position / 1.0);

        gl_PointSize = 1.0;
        gl_Position = vec4(wrapped * 2.0 - 1.0, 0.0, 1.0);
      }
    `,

    frag: `
      precision highp float;

      void main () {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `,

    attributes: {
      position: positionsBuffer
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


  const current = states => ({ tick }) => states[tick % 2]
  const previous = states => ({ tick }) => states[(tick + 1) % 2]

  const currentLifeBuffer = current(lifeFramebuffers)
  const previousLifeBuffer = previous(lifeFramebuffers)

  regl.frame(context => {
    const shiftA = Math.sin(context.time / 80)
    const shiftB = Math.cos(context.time / 30)

    for (let i = 0; i < positions.length; i += 2) {
      const xIndex = i
      const yIndex = i + 1

      const xA = positions[xIndex] + shiftA
      const yA = positions[yIndex] + shiftA
      const wrappedXA = xA - 1 * Math.floor(xA / 1)
      const wrappedYA = yA - 1 * Math.floor(yA / 1)
      const scaledXA = Math.floor(wrappedXA * noiseSize)
      const scaledYA = Math.floor(wrappedYA * noiseSize)

      const xB = positions[xIndex] + shiftB
      const yB = positions[yIndex] + shiftB
      const wrappedXB = xB - 1 * Math.floor(xB / 1)
      const wrappedYB = yB - 1 * Math.floor(yB / 1)
      const scaledXB = Math.floor(wrappedXB * noiseSize)
      const scaledYB = Math.floor(wrappedYB * noiseSize)

      const noiseIndexA = scaledXA + scaledYA * noiseSize
      const noiseIndexB = scaledXB + scaledYB * noiseSize

      velocities[xIndex] += noiseA[noiseIndexA]
      velocities[yIndex] += noiseB[noiseIndexB]

      velocities[xIndex] += (Math.random() - 0.5) / 5000
      velocities[yIndex] += (Math.random() - 0.5) / 5000

      velocities[xIndex] *= 0.85
      velocities[yIndex] *= 0.85

      positions[xIndex] += velocities[xIndex]
      positions[yIndex] += velocities[yIndex]
    }

    positionsBuffer.subdata(positions)

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
