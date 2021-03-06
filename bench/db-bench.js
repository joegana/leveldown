#!/usr/bin/env node

const leveldown = require('../')
const fs = require('fs')
const du = require('du')
const path = require('path')
const argv = require('optimist').argv

const options = {
  benchmark: argv.benchmark,
  useExisting: argv.use_existing,
  db: argv.db || path.join(__dirname, 'db'),
  num: argv.num || 1000000,
  concurrency: argv.concurrency || 4,
  cacheSize: argv.cacheSize || 8,
  writeBufferSize: argv.writeBufferSize || 4,
  valueSize: argv.valueSize || 100,
  timingOutput: argv.timingOutput || path.join(__dirname, 'timingOutput'),
  throughputOutput: argv.throughputOutput
}

const randomString = require('slump').string
const keyTmpl = '0000000000000000'

if (!options.useExisting) {
  leveldown.destroy(options.db, function () {})
}

const db = leveldown(options.db)
const timesStream = fs.createWriteStream(options.timingOutput, 'utf8')

function make16CharPaddedKey () {
  const r = Math.floor(Math.random() * options.num)
  const k = keyTmpl + r
  return k.substr(k.length - 16)
}

timesStream.write('Elapsed (ms), Entries, Bytes, Last 1000 Avg Time, MB/s\n')

function start () {
  let inProgress = 0
  let totalWrites = 0
  let totalBytes = 0
  const startTime = Date.now()
  let timesAccum = 0
  let elapsed

  function report () {
    console.log(
      'Wrote', options.num, 'entries in',
      Math.floor((Date.now() - startTime) / 1000) + 's,',
      (Math.floor((totalBytes / 1048576) * 100) / 100) + 'MB'
    )
    timesStream.end()

    du(options.db, function (err, size) {
      if (err) throw err
      console.log('Database size:', Math.floor(size / 1024 / 1024) + 'M')
    })
  }

  function write () {
    if (totalWrites++ === options.num) {
      db.close(function () {
        report(Date.now() - startTime)
      })
    }

    if (inProgress >= options.concurrency || totalWrites > options.num) return

    inProgress++

    if (totalWrites % 100000 === 0) {
      console.log('' + inProgress, totalWrites,
        Math.round(totalWrites / options.num * 100) + '%')
    }

    if (totalWrites % 1000 === 0) {
      elapsed = Date.now() - startTime
      timesStream.write(
        elapsed +
        ',' + totalWrites +
        ',' + totalBytes +
        ',' + Math.floor(timesAccum / 1000) +
        ',' + (Math.floor(((totalBytes / 1048576) / (elapsed / 1000)) * 100) / 100) +
        '\n')
      timesAccum = 0
    }

    var time = process.hrtime()

    db.put(make16CharPaddedKey(), randomString({ length: options.valueSize }), function (err) {
      if (err) throw err

      totalBytes += keyTmpl.length + options.valueSize
      timesAccum += process.hrtime(time)[1]
      inProgress--
      process.nextTick(write)
    })
  }

  for (var i = 0; i < options.concurrency; i++) write()
}

setTimeout(function () {
  db.open({
    errorIfExists: false,
    createIfMissing: true,
    cacheSize: options.cacheSize << 20,
    writeBufferSize: options.writeBufferSize << 20
  }, function (err) {
    if (err) throw err
    start()
  })
}, 500)
