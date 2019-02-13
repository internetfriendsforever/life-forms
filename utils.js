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
