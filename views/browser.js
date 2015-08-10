var h = require('micro-css/h')(require('virtual-dom/h'))
var send = require('value-event/event')

var getBaseName = require('path').basename
var getExt = require('path').extname
var join = require('path').join

var renameWidget = require('lib/rename-widget')
var DragEvent = require('lib/drag-event')

var currentRename = null

module.exports = renderBrowser

function renderBrowser(entries, state, actions){

  var elements = []

  // render two-level tree
  if (entries()){
    entries().forEach(function(entry){
      var base = getBaseName(entry.path)

      if (entry.type === 'directory' && base !== '~recordings') {
        elements.push(renderEntry(entry, state, actions))
        var sub = state.subEntries.get(entry.path)
        if (sub && sub()){
          sub().forEach(function(subEntry){
            var fileName = getBaseName(subEntry.path)
            var ext = getExt(fileName)
            if (subEntry.type === 'file' && fileName !== 'index.json' && ext === '.json'){
              elements.push(renderEntry(subEntry, state, actions))
            }
          })
        }
      }
    })
  }

  return h('ScrollBox', elements)
}

function renderEntry(entry, state, actions){

  var selected = state.selected() == entry.path
    
  var classList = []
  var expander = ''

  if (entry.type === 'directory'){
    classList.push('-directory')
    expander = h('button.twirl', {
      'ev-click': send(actions.toggleDirectory, entry.path)
    })

    if (state.subEntries.get(entry.path)){
      classList.push('-open')
    }

    // handle index.json selected
    selected = selected || join(entry.path, 'index.json') === state.selected()
  }

  var renaming = selected && state.renaming()
  var renameState = { state: state, entry: entry, actions: actions }

  // handle rename click
  var click = selected ?
    send(state.renaming.set, true) : null

  if (selected){
    classList.push('-selected')
  }
  if (renaming){
    classList.push('-renaming')
    currentRename = renameWidget(entry.fileName, saveRename, cancelRename, renameState)
  }

  var buttons = [
    h('button.delete', {
      'ev-click': send(actions.deleteEntry, entry.path),
    }, 'delete')
  ]

  if (renaming){
    buttons.push(
      h('button.save', {
        'ev-click': send(saveRename, renameState)
      }, 'save'),
      h('button.cancel', {
        'ev-click': send(cancelRename, renameState)
      }, 'cancel')
    )
  }

  var nameElement = renaming ? 
    currentRename : h('span', getBaseName(entry.fileName, '.json'))

  return h('BrowserFile', { 
    'data-entry': entry,
    'draggable': true,
    'ev-dragstart': DragEvent(dragStart, entry),
    'ev-click': click,
    'ev-dblclick': send(actions.open, entry.path),
    'className': classList.join(' ')
  }, [expander, nameElement, buttons ])
}

function dragStart(ev){
  window.currentDrag = null
  ev.dataTransfer.setData('filepath', ev.data.path)
}

function saveRename(){
  var state = this.data.state
  var entry = this.data.entry
  var actions = this.data.actions
  if (currentRename){
    actions.rename(entry.path, currentRename.getValue())
  }

  state.renaming.set(false)
}

function cancelRename(){
  var state = this.data.state
  state.renaming.set(false)
}

function getItemByPath(items, path){
  var result = null
  items.some(function(item){
    if (item.path === path){
      result = item
      return true
    }
  })
  return result
}