// TJ-ARCH-MOB-001 compliant
// PatientGPT desktop title bar. Shell-owned overlay, injected by
// src/window.rs as an initialization script; web/ is not modified.
// The Rust side appends the call: `(<titlebar.js>)({ platform, style, favicon })`.
// Every native call is guarded: without the Tauri bridge nothing mounts.
(function (shell) {
  'use strict'
  if (window.top !== window) return

  var ICONS = {
    minimize: '<path d="M0.5 5.5h9" />',
    maximize: '<rect x="0.5" y="0.5" width="9" height="9" />',
    restore: '<rect x="0.5" y="2.5" width="7" height="7" /><path d="M2.5 2.5v-2h7v7h-2" />',
    close: '<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />',
  }

  function bridge() {
    return window.__TAURI_INTERNALS__ || null
  }

  function windowCommand(name) {
    var tauri = bridge()
    if (!tauri) return Promise.resolve(null)
    var label = tauri.metadata && tauri.metadata.currentWindow ? tauri.metadata.currentWindow.label : 'main'
    return tauri.invoke('plugin:window|' + name, { label: label })
  }

  function icon(name) {
    return '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'
  }

  function controlButton(kind, label, onClick) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'pg-tb-btn pg-tb-' + kind
    button.setAttribute('aria-label', label)
    button.innerHTML = icon(kind)
    button.addEventListener('click', onClick)
    return button
  }

  function windowControls() {
    var group = document.createElement('div')
    group.className = 'pg-tb-controls'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', 'Window')
    var maximize = controlButton('maximize', 'Maximize', function () {
      windowCommand('toggle_maximize').then(syncMaximized)
    })
    function syncMaximized() {
      windowCommand('is_maximized').then(function (isMaximized) {
        var kind = isMaximized ? 'restore' : 'maximize'
        maximize.className = 'pg-tb-btn pg-tb-' + kind
        maximize.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize')
        maximize.innerHTML = icon(kind)
      }, function () {})
    }
    group.appendChild(controlButton('minimize', 'Minimize', function () { windowCommand('minimize') }))
    group.appendChild(maximize)
    group.appendChild(controlButton('close', 'Close', function () { windowCommand('close') }))
    window.addEventListener('resize', syncMaximized)
    syncMaximized()
    return group
  }

  function titleBlock() {
    var title = document.createElement('div')
    title.className = 'pg-tb-title'
    title.innerHTML = shell.favicon
    var mark = title.querySelector('svg')
    if (mark) {
      mark.setAttribute('aria-hidden', 'true')
      mark.setAttribute('focusable', 'false')
      mark.removeAttribute('role')
      mark.removeAttribute('aria-label')
      var markTitle = mark.querySelector('title')
      if (markTitle) markTitle.remove()
    }
    var text = document.createElement('span')
    title.appendChild(text)
    function syncTitle() {
      text.textContent = document.title || 'PatientGPT'
    }
    new MutationObserver(syncTitle).observe(document.head, { subtree: true, childList: true, characterData: true })
    syncTitle()
    return title
  }

  function mount() {
    if (!bridge() || document.getElementById('pg-titlebar')) return
    var style = document.createElement('style')
    style.textContent = shell.style
    document.head.appendChild(style)
    document.documentElement.classList.add('pg-shell', 'pg-shell-' + shell.platform)

    var bar = document.createElement('div')
    bar.id = 'pg-titlebar'
    // `deep`: Tauri's drag script treats the whole subtree as the drag
    // surface and skips buttons, so controls never start a drag. It also
    // owns double-click to maximize (macOS on mouseup, as the OS does).
    bar.setAttribute('data-tauri-drag-region', 'deep')
    bar.appendChild(document.createElement('div')).className = 'pg-tb-lead'
    bar.appendChild(titleBlock())
    var trail = bar.appendChild(document.createElement('div'))
    trail.className = 'pg-tb-trail'
    // macOS draws native traffic lights over the lead cell.
    if (shell.platform !== 'macos') trail.appendChild(windowControls())
    document.body.insertBefore(bar, document.body.firstChild)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
})
