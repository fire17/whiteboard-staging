// Staging release badge + notes panel. Reads /release.json (written per release by
// scripts/prepare-pages.mjs) so the version on screen always matches what was deployed.
(function () {
  'use strict'
  var STATE_LABEL = { verified: 'נבדק ✅', testing: 'בבדיקה 🧪', pending: 'בעבודה ⏳', limit: 'מגבלה ⚠️' }

  function el (tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function fmtTime (iso) {
    try {
      return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch (e) { return iso }
  }

  function render (rel) {
    var badge = el('button', 'rel-badge')
    badge.type = 'button'
    badge.setAttribute('aria-haspopup', 'dialog')
    badge.textContent = 'ניסוי · v' + rel.version
    badge.title = 'גרסת סטייג׳ינג ' + rel.version + ' · ' + fmtTime(rel.built)

    var panel = el('div', 'rel-panel')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'יומן שינויים')
    panel.hidden = true

    var head = el('div', 'rel-head')
    head.appendChild(el('strong', null, 'S Whiteboard · v' + rel.version))
    head.appendChild(el('span', 'rel-time', fmtTime(rel.built)))
    panel.appendChild(head)
    panel.appendChild(el('p', 'rel-note', 'גרסת ניסוי. היציבה נמצאת ב־whiteboard.akeyo.io ולא משתנה.'))

    ;(rel.releases || []).forEach(function (r) {
      var sec = el('section', 'rel-sec')
      sec.appendChild(el('h3', null, 'v' + r.version + ' · ' + fmtTime(r.date)))
      if (r.summary) sec.appendChild(el('p', null, r.summary))
      var ul = el('ul')
      ;(r.items || []).forEach(function (it) {
        var li = el('li', 'rel-' + it.state)
        li.appendChild(el('span', 'rel-state', STATE_LABEL[it.state] || it.state))
        li.appendChild(el('span', null, it.text))
        ul.appendChild(li)
      })
      sec.appendChild(ul)
      panel.appendChild(sec)
    })

    var close = el('button', 'rel-close', 'סגירה')
    close.type = 'button'
    panel.appendChild(close)

    function toggle (open) {
      panel.hidden = !open
      badge.setAttribute('aria-expanded', String(open))
      if (open) close.focus()
    }
    badge.addEventListener('click', function () { toggle(panel.hidden) })
    close.addEventListener('click', function () { toggle(false); badge.focus() })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false) })

    document.body.appendChild(badge)
    document.body.appendChild(panel)
    document.documentElement.dataset.release = rel.version
  }

  fetch('/release.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (rel) { if (rel && rel.version) render(rel) })
    .catch(function () {})
})()
