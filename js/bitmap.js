function formFieldAsInt(id) {
  return parseInt(document.getElementById(id).value)
}

class BitStream {
  constructor (buffer) {
    this.reader = new Uint8Array(buffer)
    this.bytesRead = 0
    this.topByte = 0
    this.topByteBitsLeft = 0
  }

  _replenish () {
    console.assert(this.topByteBitsLeft === 0)
    if (this.bytesRead === this.reader.length) {
      throw new Error('out of bytes!')
    }
    this.topByte = this.reader[this.bytesRead]
    this.topByteBitsLeft = 8
    this.bytesRead++
  }

  takeBit () {
    if (this.topByteBitsLeft === 0) {
      this._replenish()
    }
    this.topByteBitsLeft--
    return (this.topByte >> this.topByteBitsLeft) & 1
  }

  take (bits) {
    let result = 0
    for (let i = bits - 1; i >= 0; i--) {
      result |= this.takeBit() << i
    }
    return result
  }
}

class Bitmap {
  constructor (root) {
    this.root = d3.select(root)
    this.bitDepth = formFieldAsInt('bit-depth')
    this.lineWidth = formFieldAsInt('line-width')
    this.maxHeight = formFieldAsInt('max-height')
    this.magnification = formFieldAsInt('magnification')
    this.bytes = null

    this.initializeUi()
  }

  initializeUi () {
    this.root.select('button#go')
        .on('click', () => {
          let fileObj = document.getElementById('file').files[0]
          let offset = formFieldAsInt('offset')
          let count = formFieldAsInt('count')

          this.loadFile(fileObj, offset, count)
          this.renderBitmap()
        })

    this.root.select('input#line-width')
        .on('input', () => {
          this.lineWidth = parseInt(d3.event.target.value)
          this.renderBitmap()
        })

    this.root.select('input#max-height')
        .on('input', () => {
          this.maxHeight = parseInt(d3.event.target.value)
          this.renderBitmap()
        })

    this.root.select('input#bit-depth')
        .on('input', () => {
          this.bitDepth = parseInt(d3.event.target.value)
          this.renderBitmap()
        })

    this.root.select('input#magnification')
      .on('input', () => {
        this.magnification = parseInt(d3.event.target.value)
        this.renderBitmap()
      })
  }

  fileReady (buffer) {
    this.bytes = buffer
    this.renderBitmap()
  }

  loadFile (fileObj, offset, count) {
    fileObj = fileObj.slice(offset, offset + count)
    fileObj.arrayBuffer().then(
      buffer => this.fileReady(buffer)
    )
  }

  renderBitmap () {
    let canvases = Array.from(document.getElementById('canvases').children)
    let _takeCanvas = () => {
      if (canvases.length > 0) {
        return canvases.shift(1)
      }
      let canvas = document.createElement('canvas')
      document.getElementById('canvases').appendChild(canvas)
      canvas.addEventListener('click', e => {
        let bbox = canvas.getBoundingClientRect()
        let x = Math.floor((e.x - bbox.x) / this.magnification)
        let y = Math.floor((e.y - bbox.y) / this.magnification)
        let pixelIndex = parseInt(canvas.dataset.firstPixelIndex) + y * this.lineWidth + x
        let byteOffset = Math.floor(pixelIndex * this.bitDepth / 8)
        alert(`clicked pixel ${pixelIndex} (${x}, ${y}), that's ${byteOffset} bytes from the beginning of the view`)
      })
      return canvas
    }
    let initializeCanvas = (firstPixelIndex) => {
      let canvas = _takeCanvas()
      canvas.width = this.lineWidth
      canvas.style.width = `${canvas.width * this.magnification}px`
      canvas.height = this.maxHeight
      canvas.dataset.firstPixelIndex = firstPixelIndex
      let ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return ctx
    }


    if (this.bytes === null) {
      return
    }

    let pixels = Math.floor(this.bytes.byteLength * 8 / this.bitDepth)
    let height = Math.ceil(pixels / this.lineWidth)

    let reader = new BitStream(this.bytes)
    let ctx = null

    for (let i = 0; i < pixels; i++) {
      let y = Math.floor(i / this.lineWidth)
      let x = i % this.lineWidth

      if ((x === 0) && (y % this.maxHeight === 0)) {
        ctx = initializeCanvas(i)
      }

      let value = reader.take(this.bitDepth)
      let valueScaled = value / (1 << (this.bitDepth - 1))
      let rgb = Math.round(valueScaled * 255)
      ctx.fillStyle = `rgb(${rgb}, ${rgb}, ${rgb})`
      ctx.fillRect(x, y % this.maxHeight, 1, 1)
    }

    // clean up leftover unused canvases
    for (let canvas of canvases) {
      document.getElementById('canvases').removeChild(canvas)
    }
  }
}

let app = new Bitmap(document.body)
