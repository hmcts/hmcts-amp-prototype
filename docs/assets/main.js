import { initAll } from './govuk-frontend.min.js?v=2c31eb2e0f'
// First, so a ?features= link is applied before any page script checks a feature.
import './features.js?v=2c31eb2e0f'
import { user } from './store.js?v=2c31eb2e0f'
import './applications.js?v=2c31eb2e0f'
import './production-credentials.js?v=2c31eb2e0f'
import './production-access.js?v=2c31eb2e0f'
// After the page scripts have filled the application page, and before initAll starts the tabs.
import './application-layout.js?v=2c31eb2e0f'
import './admin.js?v=2c31eb2e0f'
import './prototype-settings.js?v=2c31eb2e0f'

initAll()

// The real service renders signed-in and signed-out markup on the server. These pages are
// static, so they ship signed-out and JavaScript corrects them.
// The service navigation is built on the server in the real app, from the session. These
// pages ship the signed-out version, so the signed-in items are added here instead.
function applyNavigation (signedIn) {
  const list = document.querySelector('.govuk-service-navigation__list')
  if (!list) return
  const items = Array.from(list.children)
  const last = items[items.length - 1]
  const link = last && last.querySelector('a')
  if (!link) return

  if (!signedIn) return
  link.textContent = 'Your account'
  link.setAttribute('href', link.getAttribute('href').replace(/sign-in\/?$/, 'account/'))
  addItem(list, last, 'applications', 'Applications', 'account/applications/')
  // As template.njk in the real service: Admin after Applications, only for the amp_admin app role.
  if (user.isAdmin()) {
    addItem(list, last, 'admin', 'Admin', 'admin/', /\/admin\//.test(window.location.pathname))
  }
}

// A navigation item before Your account, made from it so the classes and relative link match.
function addItem (list, last, name, text, path, active) {
  if (list.querySelector(`[data-nav="${name}"]`)) return
  const item = last.cloneNode(true)
  item.setAttribute('data-nav', name)
  item.classList.toggle('govuk-service-navigation__item--active', !!active)
  const anchor = item.querySelector('a')
  anchor.textContent = text
  anchor.setAttribute('href', last.querySelector('a').getAttribute('href').replace(/account\/$/, path))
  if (active) anchor.setAttribute('aria-current', 'page')
  else anchor.removeAttribute('aria-current')
  list.insertBefore(item, last)
}

function applySignedInState () {
  const signedIn = user.current()
  applyNavigation(signedIn)
  document.querySelectorAll('[data-when="signed-in"]').forEach(el => { el.hidden = !signedIn })
  document.querySelectorAll('[data-when="signed-out"]').forEach(el => { el.hidden = !!signedIn })
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = signedIn ? signedIn.name : '' })
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = signedIn ? signedIn.email : '' })
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')
  if (!action) return
  if (action.dataset.action === 'sign-in') {
    event.preventDefault()
    user.signIn(action.dataset.role === 'admin')
    window.location.href = action.getAttribute('href') || './'
  }
  if (action.dataset.action === 'sign-out') {
    event.preventDefault()
    user.signOut()
    window.location.href = action.getAttribute('href') || './'
  }
})

applySignedInState()
