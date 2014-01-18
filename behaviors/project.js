module.exports = function(){

  window.context.audio.loadSample = loadSample

  window.events.on('loadKit', loadKit)
  window.events.on('saveKit', saveKit)
  window.events.on('renameKit', renameKit)
  window.events.on('deleteKit', deleteKit)

  window.events.on('setEditorView', function(view){
    chrome.storage.local.set({'editorView': view})
  })

  chrome.storage.local.get('editorView', function(items) {
    window.events.emit('setEditorView', items.editorView || 'visual')
  })

  loadDefaultProject()
}

function loadSample(src, cb){
  var sampleCache = window.context.audio.sampleCache
  var project = window.context.currentProject
  var current = sampleCache[src]
  var audioContext = window.context.audio

  if (!current){
    current = sampleCache[src] = []
    project.samples.getFile(src, {create: false}, function(entry){
      readFileAsBuffer(entry, function(file){
        audioContext.decodeAudioData(file, function(buffer){
          sampleCache[src] = buffer
          current.forEach(function(callback){
            callback(buffer)
          })
        }, handleError)
      })
    }, function(){
      sampleCache[src] = null
      current.forEach(function(callback){
        callback(null)
      })
    })
  }

  if (cb){
    if (Array.isArray(current)){
      current.push(cb)
    } else {
      cb(current)
    }
  }
}

function sortKits(){
  window.context.kits = window.context.kits.sort(compareEntry)
}

function deleteKit(id){
  var entry = getKitFile(id)
  if (entry){
    backup(entry, window.context.currentProject.kitBackup, function(){
      entry.remove(function(){
        var index = window.context.kits.indexOf(entry)
        window.context.kits.splice(index, 1)
        window.events.emit('refreshKits')
      }, handleError)
    })
  }
}

function renameKit(fromId, toId){
  var newName = toId + '.json'
  var entry = getKitFile(fromId)

  if (entry && toId && toId.trim()){
    entry.moveTo(window.context.currentProject.kits, newName, function(newEntry){
      var index = window.context.kits.indexOf(entry)
      window.context.kits.splice(index, 1, newEntry)
      sortKits()
      window.events.emit('refreshKits')
    }, handleError)
  }
}

function loadKit(deckId, kitName){
  getKit(kitName, function(kit){
    if (kit){
      var deck = window.context.instances[deckId]
      kit.slots.forEach(function(descriptor){
        deck.update(descriptor)
      })
      if (deckId === 'left'){
        chrome.storage.local.set({'lastLeftKit': kitName})
      }
      if (deckId === 'right'){
        chrome.storage.local.set({'lastRightKit': kitName})
      }
    }
  })
}

function saveKit(deckId, kitName){
  var names = 'ABCDEFGH'.split('')
  var kitStorage = {slots: []}
  var deck = window.context.instances[deckId]
  for (var i=0;i<64;i++){
    kitStorage.slots.push(deck.getDescriptor(i))
  }
  for (var i=0;i<8;i++){
    var id = names[i]
    kitStorage.slots.push(deck.getDescriptor(id))
  }
  writeKit(kitName, kitStorage)
}

window.chooseProject = chooseProject

function loadDefaultProject(){
  chrome.storage.local.get('projectDirectory', function(items) {
    if (items.projectDirectory) {
      chrome.fileSystem.isRestorable(items.projectDirectory, function(bIsRestorable) {
        if (!bIsRestorable){
          return chooseProject()
        }
        chrome.fileSystem.restoreEntry(items.projectDirectory, function(chosenEntry) {
          if (chosenEntry) {
            loadProject(chosenEntry)
          }
        })
      })
    } else {
      chooseProject()
    }
  })
}

function chooseProject(){
  chrome.fileSystem.chooseEntry({type: 'openDirectory'}, function(entry) {
    // use local storage to retain access to this file
    loadProject(entry)
  })
}

function handleError(err){
  console.log(err)
  throw err
}

function loadLastKits(){
  chrome.storage.local.get(['lastLeftKit', 'lastRightKit'], function(items) {
    if (items.lastLeftKit){
      window.events.emit('loadKit', 'left', items.lastLeftKit)
    }
    if (items.lastRightKit){
      window.events.emit('loadKit', 'right', items.lastRightKit)
    }
  })
}

function loadProject(entry){
  window.context.currentProject = entry
  window.context.audio.sampleCache = {}

  chrome.storage.local.set({'projectDirectory': chrome.fileSystem.retainEntry(entry)})
  chrome.fileSystem.getDisplayPath(entry, function(path){
    console.log('Loaded project', path)
  })

  entry.getDirectory('kits', {create: true, exclusive: false}, function(directory){
    directory.getDirectory('backup', {create: true, exclusive: false}, function(directory){
      window.context.currentProject.kitBackup = directory
    }, handleError)
    window.context.currentProject.kits = directory
    refreshKits(loadLastKits)
  }, handleError)

  entry.getDirectory('samples', {create: true, exclusive: false}, function(directory){
    window.context.currentProject.samples = directory
  }, handleError)

  entry.getDirectory('recordings', {create: true, exclusive: false}, function(directory){
    window.context.currentProject.recordings = directory
  }, handleError)
}

function refreshKits(cb){
  var project = window.context.currentProject
  if (project && project.kits){
    getFiles(project.kits, function(kits){
      window.context.kits = kits
      window.events.emit('refreshKits')
      cb&&cb()
    })
  }
}

function backup(entry, backup, cb){
  entry.getMetadata(function(meta){
    var modified = meta.modificationTime.getTime() / 1000
    var name = entry.name.replace(/\.json$/, '')
    var fileName = name + '.' + modified + ".json"
    entry.copyTo(backup, fileName, cb, handleError)
  }, cb)
}

function getKitFile(name){
  var fileName = name + '.json'
  for (var i=0;i<window.context.kits.length;i++){
    var entry = window.context.kits[i]
    if (entry.name === fileName){
      return entry
      break
    }
  }
}

function getKit(name, cb){
  var entry = getKitFile(name)
  if (entry){
    readFile(entry, function(content){
      cb(JSON.parse(content))
    })
  } else {
    cb(null)
  }
}

function writeKit(name, descriptor, cb){
  var fileName = name + '.json'
  var project = window.context.currentProject
  var content = JSON.stringify(descriptor, null, 2)
  for (var i=0;i<window.context.kits.length;i++){
    var entry = window.context.kits[i]
    if (entry.name === fileName){
      backup(entry, project.kitBackup, function(){
        writeFile(entry, content, cb)
      })
      return
    }
  }
  project.kits.getFile(fileName, {create: true, exclusive: false}, function(entry){
    writeFile(entry, content, function(e){
      window.context.kits.push(entry)
      sortKits()
      window.events.emit('addKit', entry)
      cb&&cb(e)
    })
  })
}

function writeFile(entry, data, cb){
  entry.createWriter(function(writer){
    writer.onwriteend = function(){
      writer.onwriteend = cb
      writer.truncate(writer.position)
    }
    writer.onerror = handleError
    var blob = new Blob([data], {type: 'text/plain'});
    writer.write(blob)
  }, handleError)
}

function getFiles(directory, cb){
  var reader = directory.createReader()
  var entries = []

  var readEntries = function() {
    reader.readEntries(function(results) {
      if (!results.length) {
        cb(entries)
      } else {
        results.forEach(function(entry){
          if (entry.isFile && /\.json$/.exec(entry.name)){
            entries.push(entry)
          }
        })
        readEntries()
      }
    }, handleError)
  }

  readEntries()
}

function readFile(entry, cb){
  entry.file(function(file){
    var reader = new FileReader()
    reader.onload = function(){
      cb(reader.result)
    }
    reader.onerror = handleError
    reader.readAsText(file)
  }, handleError)
}

function readFileAsBuffer(entry, cb){
  entry.file(function(file){
    var reader = new FileReader()
    reader.onload = function(){
      cb(reader.result)
    }
    reader.onerror = handleError
    reader.readAsArrayBuffer(file)
  }, handleError)
}

function compareEntry(a, b){
  return a.name.localeCompare(b.name)
}