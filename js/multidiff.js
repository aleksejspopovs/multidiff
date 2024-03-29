function range(l, r) {
  let result = []
  for (let i = l; i < r; i++) {
    result.push(i)
  }
  return result
}

function formatByte(v) {
  return v.toString(16).padStart(2, '0')
}

class File {
  constructor (fileObj, maxLength, readyCallback) {
    this.fileObj = fileObj
    this.name = fileObj.name
    this.readyCallback = readyCallback
    this.visible = true
    this.boundaries = []
    this.segments = []

    this.setMaxLength(maxLength)
  }

  setMaxLength(maxLength) {
    this.maxLength = maxLength
    this.ready = false
    this.buffer = null
    this.view = null

    let length = Math.min(this.fileObj.size, maxLength)
    this.truncated = (length < this.fileObj.size)
    let slice = this.fileObj.slice(0, length)
    slice.arrayBuffer().then(buffer => {
      this.ready = true
      this.buffer = buffer
      this.view = new Uint8Array(this.buffer)
      this._recomputeSegments()
      this.readyCallback()
    })
  }

  _validateBoundaries () {
    this.boundaries.sort((a, b) => a - b)

    // remove anything < 0
    while ((this.boundaries.length > 0) && (this.boundaries[0] < 0)) {
      this.boundaries.splice(0, 1)
    }

    // remove anything >= byteLength
    while (
      (this.boundaries.length > 0)
      && (this.boundaries[this.boundaries.length - 1] >= this.buffer.byteLength)
    ) {
      this.boundaries.splice(this.boundaries.length - 1, 1)
    }
  }

  _recomputeSegments () {
    this._validateBoundaries()

    this.segments = []
    let pos = 0
    for (let end of this.boundaries) {
      this.segments.push([pos, end])
      pos = end
    }
    this.segments.push([pos, this.buffer.byteLength])
  }

  addBoundary (pos) {
    this.boundaries.push(pos)
    this._recomputeSegments()
  }

  removeBoundary (pos) {
    let index = this.boundaries.indexOf(pos)
    if (index === -1) {
      return
    }

    this.boundaries = this.boundaries.filter((_, i) => (i !== index))
    this._recomputeSegments()
  }
}

class Multidiff {
  constructor (root) {
    this.root = d3.select(root)
    this.paneWidth = 16
    this.maxLength = 1024
    this.lengthStep = 1024
    this.diffSets = []

    this.files = []

    this.initializeUi()
    this.renderFileList()
    this.renderDiff()
  }

  initializeUi () {
    this.root.select('button#go')
        .on('click', () => {
          for (let fileObj of document.getElementById('file').files) {
            this.addFile(fileObj)
          }
          this.renderFileList()
          this.renderDiff()
          document.getElementById('file').value = null
        })

    this.root.select('input#pane-width')
        .on('input', () => {
          this.paneWidth = parseInt(d3.event.target.value)
          this.renderDiff()
        })

    this.root.select('button#edit-boundaries')
        .on('click', () => {
          const boundaries = Object.fromEntries(this.files.map(f => [f.name, f.boundaries]))
          let newBoundaries = JSON.parse(prompt('boundaries?', JSON.stringify(boundaries)))
          if (newBoundaries === null) {
            return
          }

          for (let file of this.files) {
            if (newBoundaries[file.name] === undefined) {
              continue
            }
            file.boundaries = newBoundaries[file.name]
            file._recomputeSegments()
          }

          this.recomputeDiffSets()
          this.renderFileList()
          this.renderDiff()
        })
  }

  fileReady () {
    this.recomputeDiffSets()
    this.renderDiff()
  }

  addFile (fileObj) {
    this.files.push(new File(fileObj, this.maxLength, () => this.fileReady()))
    this.renderFileList()
  }

  renderFileList () {
    let nodes = this.root.select('ul#file-list')
      .selectAll('li')
      .data(this.files)
      .join(
        enter => {
          let li = enter.append('li')
          let label = li.append('label')
          label.append('input')
            .attr('type', 'checkbox')
            .on('click', (file) => {
              file.visible = d3.select(d3.event.target).property('checked')
              this.recomputeDiffSets()
              this.renderFileList()
              this.renderDiff()
            })
          label.append('span')
          li.append('a')
            .attr('href', '#')
            .text('[remove]')
            .on('click', (file) => {
              let idx = this.files.indexOf(file)
              if (idx !== -1) {
                this.files.splice(idx, 1)
                this.recomputeDiffSets()
              }
              this.renderFileList()
              this.renderDiff()
            })
        },
        update => {
          update.select('input[type=checkbox]')
              .property('checked', f => f.visible)

          update.select('span')
              .text(f => `${f.name} (boundaries at [${f.boundaries.join(', ')}]) `)

          // this appears to be required to make D3 update the associated data for
          // the <a> nodes?
          update.select('a')
        }
      )
  }

  findSegmentLengths() {
    let readyFiles = this.files.filter(f => f.ready && f.visible)
    if (readyFiles.length === 0) {
      return []
    }

    let segmentCount = Math.max(...readyFiles.map(f => f.segments.length))
    let result = []
    for (let i = 0; i < segmentCount; i++) {
      result.push(Math.max(...readyFiles.map(f =>
        (i < f.segments.length) ? (f.segments[i][1] - f.segments[i][0]) : 0
      )))
    }
    return result
  }

  recomputeDiffSets () {
    this.diffSets = []

    let readyFiles = this.files.filter(f => f.ready && f.visible)
    if (readyFiles.length === 0) {
      return
    }

    let segmentLengths = this.findSegmentLengths()

    for (let i = 0; i < segmentLengths.length; i++) {
      this.diffSets.push(new Set())

      for (let posInSegment = 0; posInSegment < segmentLengths[i]; posInSegment++) {
        let activeFiles = readyFiles.filter(f => (
          (i < f.segments.length)
          && (f.segments[i][0] + posInSegment < f.segments[i][1])
        ))

        if (activeFiles.length < 2) {
          break
        }

        let values = activeFiles.map(f => f.view[f.segments[i][0] + posInSegment])
        if (values.some(x => (x != values[0]))) {
          this.diffSets[i].add(posInSegment)
        }
      }
    }
  }

  renderDiff () {
    this.root.select('input#pane-width')
        .attr('value', this.paneWidth)

    let readyFiles = this.files.filter(f => f.ready && f.visible)
    let linesInSegment = this.findSegmentLengths().map(l => Math.ceil(l / this.paneWidth))

    this.root.select('table#diff')
      .select('thead')
      .select('tr')
      .selectAll('th')
      .data(readyFiles)
      .join('th')
        .text(d => d.name)

    let positionsInLine = (file, segment, line) => {
      if (segment >= file.segments.length) {
        return []
      }

      let [segmentStart, segmentEnd] = file.segments[segment]
      let lineStart = line * this.paneWidth

      let result = []
      for (
        let i = 0;
        (i < this.paneWidth) && (segmentStart + lineStart + i < segmentEnd);
        i++
      ) {
        result.push([lineStart + i, segmentStart + lineStart + i])
      }

      return result
    }

    this.root.select('table#diff')
      .selectAll('tbody')
      .data(range(0, linesInSegment.length))
      .join('tbody')
      .selectAll('tr')
      .data(s => range(0, linesInSegment[s]).map(i => [s, i]))
      .join('tr')
      .selectAll('td')
      .data(([s, i]) => readyFiles.map(f => [s, i, f]))
      .join('td')
      .selectAll('span')
      .data(([s, i, f]) => positionsInLine(f, s, i).map(([ps, pf]) => [f, s, ps, pf]))
      // [f, s, i, ps, pf] = [file, segment index, position in segment, position in file]
      .join(enter => enter.append('span').classed('byte', true))
        .text(([f, s, ps, pf]) => formatByte(f.view[pf]))
        .attr('title', ([f, s, ps, pf]) => `${f.name} at offset ${pf}`)
        .attr('data-pos', ([f, s, ps, pf]) => `${s}-${ps}`)
        .classed('mismatch', ([f, s, ps, pf]) => this.diffSets[s].has(ps))
        .on('mouseover', ([f, s, ps, pf]) => {
          this.highlight(s, ps, true)
        })
        .on('mouseout', ([f, s, ps, pf]) => {
          this.highlight(s, ps, false)
        })
        .on('dblclick', ([f, s, ps, pf]) => {
          if (d3.event.ctrlKey) {
            if (ps !== 0) {
              return
            }
            // ctrl-click on first byte of a segment:
            // remove boundary
            f.removeBoundary(pf)
            this.recomputeDiffSets()
            this.renderFileList()
            this.renderDiff()
          } else {
            // regular click: add boundary here
            f.addBoundary(pf)
            this.recomputeDiffSets()
            this.renderFileList()
            this.renderDiff()
          }
        })

    let anyTruncated = readyFiles.some(f => f.truncated)
    let notice = this.root.select('#truncation-notice')

    notice.classed('visible', anyTruncated)
    notice.select('#max-length')
        .text(this.maxLength)
    notice.select('#step-size')
        .text(this.lengthStep)
    notice.select('button')
        .on('click', () => {
          this.maxLength += this.lengthStep
          for (let file of this.files) {
            file.setMaxLength(this.maxLength)
            this.renderDiff()
          }
        })
  }

  highlight (segment, position, value) {
    this.root.select('table#diff')
      .selectAll(`span[data-pos="${segment}-${position}"]`)
        .classed('focused', value)
  }
}

let app = new Multidiff(document.body)
