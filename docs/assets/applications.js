import { applications, answers, productionRequests } from './store.js?v=12d4267d98'
import { features } from './features.js?v=12d4267d98'
import { FEATURE, coverage, statusTag } from './request-apis.js?v=12d4267d98'
import { on as selfServe, readyApis } from './production-access.js?v=12d4267d98'

const JOURNEY = 'new-application'
// applications.maxPerUser in the real service's config.
const MAX_APPLICATIONS = 5
const AT_LIMIT_KEY = 'ampPrototypeAtLimitNotice'
const CREATE_MESSAGE = 'Creating your application. This can take up to a minute'

function atLimitMessage () {
  return `You can have up to ${MAX_APPLICATIONS} ${MAX_APPLICATIONS === 1 ? 'application' : 'applications'}. Delete an application you no longer need before you add another.`
}

function atLimit () {
  return applications.all().length >= MAX_APPLICATIONS
}

// The real service sends someone at the limit back to the list with an "Important" notice.
function sendBackAtLimit (listUrl) {
  try {
    window.sessionStorage.setItem(AT_LIMIT_KEY, '1')
  } catch (e) { /* the list still says why */ }
  window.location.href = listUrl
}

function page () {
  const path = window.location.pathname.replace(/index\.html$/, '')
  const match = path.match(/account\/applications\/(.*)$/)
  return match ? match[1].replace(/\/$/, '') : null
}

function query (name) {
  return new URLSearchParams(window.location.search).get(name)
}

function escapeHtml (value) {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

function renderList () {
  const container = document.getElementById('applications-list')
  const empty = document.getElementById('applications-empty')
  if (!container) return
  showLimit()
  // components/notice.njk, which the real list page includes: for example after deleting an application.
  showNotice()
  const all = applications.all()
  empty.hidden = all.length > 0
  if (!all.length) { container.innerHTML = ''; return }

  const rows = all.map(application => `
    <tr class="govuk-table__row">
      <td class="govuk-table__cell"><a class="govuk-link" href="detail/?id=${application.id}">${escapeHtml(application.name)}</a></td>
      <td class="govuk-table__cell">${application.apis.length} ${application.apis.length === 1 ? 'API' : 'APIs'}</td>
      <td class="govuk-table__cell apim-reference">${application.clientId}</td>
    </tr>`).join('')

  container.innerHTML = `
    <table class="govuk-table" id="applications">
      <caption class="govuk-table__caption govuk-visually-hidden">Your applications</caption>
      <thead class="govuk-table__head">
        <tr class="govuk-table__row">
          <th scope="col" class="govuk-table__header">Application</th>
          <th scope="col" class="govuk-table__header">APIs</th>
          <th scope="col" class="govuk-table__header">Client ID</th>
        </tr>
      </thead>
      <tbody class="govuk-table__body">${rows}</tbody>
    </table>`
}

function showLimit () {
  const inset = document.getElementById('applications-at-limit')
  const add = document.getElementById('add-application')
  if (!inset || !add) return
  const reached = atLimit()
  inset.hidden = !reached
  add.hidden = reached
  if (reached) inset.textContent = atLimitMessage()

  let notice = false
  try {
    notice = window.sessionStorage.getItem(AT_LIMIT_KEY) === '1'
    window.sessionStorage.removeItem(AT_LIMIT_KEY)
  } catch (e) { /* as above */ }
  if (notice && reached) {
    document.querySelector('h1').insertAdjacentHTML('beforebegin', `
      <div class="govuk-notification-banner" role="region" aria-labelledby="govuk-notification-banner-title" data-module="govuk-notification-banner" id="notice">
        <div class="govuk-notification-banner__header">
          <h2 class="govuk-notification-banner__title" id="govuk-notification-banner-title">Important</h2>
        </div>
        <div class="govuk-notification-banner__content">
          <p class="govuk-notification-banner__heading">${escapeHtml(atLimitMessage())}</p>
        </div>
      </div>`)
  }
}

// Says the create is running, as the real service does while Entra and APIM answer. Creating
// here is instant, so it is only seen for a moment.
function reportCreateInProgress (form) {
  const status = document.getElementById('create-status')
  const message = document.getElementById('create-status-message')
  const dots = document.getElementById('create-status-dots')
  if (!status || !message || !dots) return
  message.textContent = CREATE_MESSAGE
  status.hidden = false
  dots.textContent = '...'
}

function captureStep (nextUrl, read) {
  const form = document.querySelector('form')
  if (!form) return
  form.addEventListener('submit', event => {
    event.preventDefault()
    const values = read(form)
    if (!values) return
    answers.set(JOURNEY, values)
    window.location.href = nextUrl
  })
}

function renderCheckAnswers () {
  const saved = answers.get(JOURNEY)
  const list = document.querySelector('.govuk-summary-list')
  if (list) {
    list.innerHTML = `
      <div class="govuk-summary-list__row">
        <dt class="govuk-summary-list__key">Application name</dt>
        <dd class="govuk-summary-list__value">${escapeHtml(saved.name || '')}</dd>
        <dd class="govuk-summary-list__actions"><a class="govuk-link" href="../details/">Change</a></dd>
      </div>
      <div class="govuk-summary-list__row">
        <dt class="govuk-summary-list__key">APIs</dt>
        <dd class="govuk-summary-list__value">${(saved.apis || []).map(api => escapeHtml(api.text)).join('<br>') || 'None'}</dd>
        <dd class="govuk-summary-list__actions"><a class="govuk-link" href="../apis/">Change</a></dd>
      </div>`
  }
  const form = document.querySelector('form')
  if (!form) return
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (atLimit()) {
      sendBackAtLimit('../../')
      return
    }
    reportCreateInProgress(form)
    const created = applications.create(saved)
    answers.clear(JOURNEY)
    window.location.href = `../confirmation/?id=${created.id}`
  })
}

function set (id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

function row (key, value, extraClass, rowClass) {
  return `
    <div class="govuk-summary-list__row${rowClass ? ' ' + rowClass : ''}">
      <dt class="govuk-summary-list__key">${escapeHtml(key)}</dt>
      <dd class="govuk-summary-list__value${extraClass ? ' ' + extraClass : ''}">${value}</dd>
    </div>`
}

// A summary list row with one action link, as govukSummaryList renders it.
function actionRow (key, value, action) {
  return `
    <div class="govuk-summary-list__row">
      <dt class="govuk-summary-list__key">${escapeHtml(key)}</dt>
      <dd class="govuk-summary-list__value">${value}</dd>
      <dd class="govuk-summary-list__actions">
        <a class="govuk-link" href="${action.href}" id="${action.id}">${action.text}<span class="govuk-visually-hidden"> ${action.hidden}</span></a>
      </dd>
    </div>`
}

function formatDate (iso) {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}

function renderConfirmation (application, secret) {
  set('created-name', application.name)
  set('client-id', application.clientId)
  set('client-secret', secret)

  const view = document.getElementById('view-application')
  if (view) view.setAttribute('href', `../../detail/?id=${application.id}`)
  renderAccess(applications.find(application.id))
}

// A made-up Entra application ID for an API, the same each time. The real service reads each
// API's from the marketplace catalogue.
function publisherId (apiValue) {
  let hex = ''
  for (let i = 0; hex.length < 32; i++) {
    hex += ((apiValue.charCodeAt(i % apiValue.length) * (i + 7)) % 256).toString(16).padStart(2, '0')
  }
  hex = hex.slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Made-up hex, the same each time for the same seed.
function madeUpHex (seed, length) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0
  let hex = ''
  for (let i = 0; hex.length < length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i % seed.length) ^ i, 16777619) >>> 0
    hex += (hash >>> 24).toString(16).padStart(2, '0')
  }
  return hex.slice(0, length)
}

// A made-up subscription key for one API. The real service fetches it from API Management.
function subscriptionKey (application, api) {
  return madeUpHex(application.clientId + api.value, 32)
}

// maskSecret in the real service: the hint the backend keeps, then ****. An application made by an
// older prototype has no hint or expiry, so it gets made-up ones.
function maskedSecret (application) {
  return `${application.secretHint || madeUpHex(application.clientId + 'secret', 3)}****`
}

function secretExpiresAt (application) {
  if (application.secretExpiresAt) return application.secretExpiresAt
  const expires = new Date(application.secretCreatedAt || application.createdAt)
  expires.setFullYear(expires.getFullYear() + 2)
  return expires.toISOString()
}

// Access to the APIs (applications/access.njk). In the real service Entra refuses the role grant for
// a minute or two after an application is made, so the page retries it: 8 attempts, 15 seconds
// apart (application-access.ts). The prototype grants access 5 seconds after the application is
// made and retries every 3, so the whole thing can be seen. An application from an older prototype
// has no accessGranted and counts as set up.
const ACCESS_ATTEMPTS = 8
const ACCESS_RETRY_MS = 3000
const ACCESS_READY_MS = 5000
let watchingAccess = false

function renderAccess (application) {
  const granted = document.getElementById('access-granted')
  const container = document.getElementById('application-access')
  if (!granted || !container) return
  if (application.accessGranted !== false) {
    granted.hidden = false
    return
  }
  container.hidden = false
  const button = document.getElementById('check-access')
  if (button) {
    button.addEventListener('click', event => {
      event.preventDefault()
      watchAccess(application.id, container)
    })
  }
  watchAccess(application.id, container)
}

async function watchAccess (id, container) {
  if (watchingAccess) return
  watchingAccess = true
  const status = document.getElementById('access-status')
  const show = text => { if (status) status.textContent = text }
  for (let attempt = 1; attempt <= ACCESS_ATTEMPTS; attempt++) {
    show(`Setting up access… (attempt ${attempt} of ${ACCESS_ATTEMPTS})`)
    const application = applications.find(id)
    if (!application) break
    if (Date.now() - new Date(application.createdAt).getTime() >= ACCESS_READY_MS) {
      applications.update(id, { accessGranted: true })
      container.querySelector('#access-pending')?.remove()
      container.querySelector('#check-access-form')?.remove()
      show('Access is set up. These credentials are ready to use.')
      watchingAccess = false
      return
    }
    if (attempt < ACCESS_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, ACCESS_RETRY_MS))
  }
  show('Access is taking longer than expected. Use "Check access" to try again.')
  watchingAccess = false
}

// One API's page: applications/api.njk in the real service, with the key behind Show subscription key.
function renderApi (application) {
  const api = application.apis.find(item => item.value === query('api'))
  if (!api) {
    window.location.href = `../detail/?id=${application.id}`
    return
  }
  document.title = `${api.text} - ${application.name} - HMCTS API Marketplace - GOV.UK`
  document.querySelectorAll('[data-application-name]').forEach(el => { el.textContent = application.name })
  set('api-title', api.text)
  const details = document.getElementById('api-details')
  if (details) {
    details.innerHTML =
      row('API', `<a class="govuk-link" href="../../../api-catalogue/${encodeURIComponent(api.value)}/">${escapeHtml(api.text)}</a>`) +
      row('Subscribed', formatDate(api.subscribedAt || application.createdAt))
  }
  set('subscription-key', subscriptionKey(application, api))
  const crumbs = document.querySelectorAll('.govuk-breadcrumbs__link')
  const last = crumbs[crumbs.length - 1]
  if (last) { last.textContent = application.name; last.setAttribute('href', `../detail/?id=${application.id}`) }
  const back = document.getElementById('back-to-application')
  if (back) back.setAttribute('href', `../detail/?id=${application.id}`)
}

// applications/instructions.njk in the real service, folded away under each API. The tenant and
// secret stay placeholders. The real reference link goes to the developer portal; the prototype's
// APIs are made up, so it goes to the API's catalogue page instead.
function instructionsHtml (application, api) {
  const scope = `${publisherId(api.value)}/.default`
  const title = escapeHtml(api.text)
  return `
    <details class="govuk-details govuk-!-margin-bottom-0" id="api-instructions-${api.value}">
      <summary class="govuk-details__summary">
        <span class="govuk-details__summary-text">How to get an access token and call ${title}</span>
      </summary>
      <div class="govuk-details__text">
        <dl class="govuk-summary-list">
          ${row('Publisher ID (scope)', `<span class="apim-credential" id="publisher-id-${api.value}">${publisherId(api.value)}</span>`)}
        </dl>
        <h3 class="govuk-heading-s">Get an access token</h3>
        <p class="govuk-body">Request a token from Microsoft Entra ID with the OAuth 2.0 client credentials flow:</p>
        <pre class="apim-code" id="token-request-${api.value}"><code>curl --request POST \\
  --url https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token \\
  --header 'Content-Type: application/x-www-form-urlencoded' \\
  --data grant_type=client_credentials \\
  --data client_id=${application.clientId} \\
  --data 'client_secret=&lt;client_secret&gt;' \\
  --data scope=${scope}</code></pre>
        <h3 class="govuk-heading-s">Run try it now in developer portal</h3>
        <p class="govuk-body"><a class="govuk-link" id="api-reference-${api.value}" href="../../../api-catalogue/${api.value}/" rel="noreferrer noopener" target="_blank">${title} API reference (opens in new tab)</a></p>
      </div>
    </details>`
}

function renderDetail (application) {
  document.querySelectorAll('[data-application-name]').forEach(el => { el.textContent = application.name })
  document.title = application.name + ' - Manage applications - HMCTS API Marketplace - GOV.UK'

  const details = document.getElementById('application-details')
  if (details) {
    details.innerHTML =
      row('Application name', escapeHtml(application.name)) +
      row('Created', formatDate(application.createdAt))
  }

  const auth = document.getElementById('authorisation-details')
  if (auth) {
    const secret = `<span class="apim-credential" id="masked-secret">${escapeHtml(maskedSecret(application))}</span><br><span class="govuk-hint">Expires ${formatDate(secretExpiresAt(application))}</span>`
    // Phase 2, regenerating the secret: a Regenerate action on its row, as the real service had.
    const regenerate = features.isOn(REGENERATE)
    auth.innerHTML =
      row('Client ID', `<span class="apim-credential" id="client-id">${application.clientId}</span>`, '', regenerate ? 'govuk-summary-list__row--no-actions' : '') +
      (regenerate
        ? actionRow('Client secret', secret, { href: `../client-secret/?id=${application.id}`, text: 'Regenerate', hidden: 'client secret', id: 'regenerate-secret' })
        : row('Client secret', secret))
  }
  renderAccess(application)

  const table = document.getElementById('application-apis')
  const rows = document.getElementById('application-apis-rows')
  const empty = document.getElementById('apis-empty')
  if (table && rows && empty) {
    table.hidden = !application.apis.length
    empty.hidden = application.apis.length > 0
    rows.innerHTML = application.apis.map(api => `
      <tr class="govuk-table__row">
        <td class="govuk-table__cell">${escapeHtml(api.text)}</td>
        <td class="govuk-table__cell"><a class="govuk-link" href="../api/?id=${application.id}&api=${encodeURIComponent(api.value)}">View subscription key<span class="govuk-visually-hidden"> for ${escapeHtml(api.text)}</span></a></td>
      </tr>
      <tr class="govuk-table__row">
        <td class="govuk-table__cell" colspan="2">${instructionsHtml(application, api)}</td>
      </tr>`).join('')
  }

  const request = productionRequests.forApplication(application.id)
  const asked = document.getElementById('production-request')
  const ask = document.getElementById('request-production')
  if (asked && ask && features.isOn(FEATURE)) {
    asked.hidden = true
    ask.hidden = true
    renderProductionApis(application)
  } else if (asked && ask) {
    asked.hidden = !request
    ask.hidden = !!request
    if (request) {
      set('production-request-reference', request.reference)
      document.getElementById('view-production-request').setAttribute('href', `../../production-credentials/view/?reference=${request.reference}`)
    }
  }

  const change = document.getElementById('change-apis')
  if (change) change.setAttribute('href', `../apis/?id=${application.id}`)
  showNotice()

  const remove = document.getElementById('delete-application')
  if (remove) remove.setAttribute('href', `../delete/?id=${application.id}`)
}

// Are you sure you want to delete this application? Then back to the list with a notice, as
// the real service's ApplicationsController does.
function renderDelete (application) {
  const form = document.querySelector('form')
  if (!form) return
  const caption = document.querySelector('.govuk-caption-l')
  if (caption) caption.textContent = application.name
  const warning = document.querySelector('#delete-warning .govuk-warning-text__text')
  if (warning) {
    warning.innerHTML = `<span class="govuk-visually-hidden">Warning</span>
      Its client ID, client secret and all ${application.apis.length} subscription keys will stop working straight away. You cannot undo this.`
  }
  const crumbs = document.querySelectorAll('.govuk-breadcrumbs__link')
  const last = crumbs[crumbs.length - 1]
  if (last) { last.textContent = application.name; last.setAttribute('href', `../detail/?id=${application.id}`) }
  const keep = document.getElementById('keep-application')
  if (keep) keep.setAttribute('href', `../detail/?id=${application.id}`)

  form.addEventListener('submit', event => {
    event.preventDefault()
    applications.remove(application.id)
    try {
      window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify({
        success: true,
        title: 'Success',
        text: `${application.name} has been deleted. Its client ID, secret and subscription keys no longer work.`
      }))
    } catch (e) { /* the list still shows it has gone */ }
    window.location.href = '../'
  })
}

// Phase 2, 'regenerate-client-secret': replace the Try it now secret. The old one stops working at
// once, as in Entra, and the new one is shown once on the next page, then never again.
const REGENERATE = 'regenerate-client-secret'
const NEW_SECRET_KEY = 'ampPrototypeNewSecret'

function fillApplication (application, detailUrl) {
  document.querySelectorAll('[data-application-name]').forEach(el => { el.textContent = application.name })
  const crumbs = document.querySelectorAll('.govuk-breadcrumbs__link')
  const last = crumbs[crumbs.length - 1]
  if (last) { last.textContent = application.name; last.setAttribute('href', detailUrl) }
}

function renderRegenerate (application) {
  const detailUrl = `../detail/?id=${application.id}`
  fillApplication(application, detailUrl)
  set('current-secret', maskedSecret(application))
  const cancel = document.getElementById('cancel-regenerate')
  if (cancel) cancel.setAttribute('href', detailUrl)
  const form = document.getElementById('regenerate-form')
  if (!form) return
  form.addEventListener('submit', event => {
    event.preventDefault()
    const secret = applications.newSecret(application.id)
    try {
      window.sessionStorage.setItem(NEW_SECRET_KEY, JSON.stringify({ applicationId: application.id, secret }))
    } catch (e) { /* the next page says the secret is no longer shown */ }
    window.location.href = `new/?id=${application.id}`
  })
}

function renderNewSecret (application) {
  let shown = null
  try {
    shown = JSON.parse(window.sessionStorage.getItem(NEW_SECRET_KEY) || 'null')
    window.sessionStorage.removeItem(NEW_SECRET_KEY)
  } catch (e) { /* treated as already shown */ }
  const secret = shown && shown.applicationId === application.id ? shown.secret : null
  const once = document.getElementById('new-secret')
  const gone = document.getElementById('new-secret-gone')
  if (once) once.hidden = !secret
  if (gone) gone.hidden = !!secret
  if (secret) {
    set('client-secret', secret)
    set('new-secret-expires', formatDate(secretExpiresAt(application)))
  }
  const back = document.getElementById('back-to-application')
  if (back) {
    back.setAttribute('href', `../../detail/?id=${application.id}`)
    back.textContent = `Back to ${application.name}`
  }
}

// Phase 2, production requests for each API: one row for each API, with its status and what to
// do next. Once production credentials are made, the API's subscription key is folded under its row.
function renderProductionApis (application) {
  const table = document.getElementById('production-apis-table')
  const rows = document.getElementById('production-apis-table-rows')
  if (!table || !rows) return
  const keys = (application.production && application.production.apis) || []
  const ready = selfServe() ? readyApis(application) : []
  const link = (href, text, api, id) =>
    `<a class="govuk-link" href="${href}"${id ? ` id="${id}"` : ''}>${text}<span class="govuk-visually-hidden"> for ${escapeHtml(api.text)}</span></a>`
  const viewRequest = (entry) => link(`../../production-credentials/view/?reference=${entry.request.reference}`, 'View request', entry.api)

  table.hidden = !application.apis.length
  rows.innerHTML = coverage(application).map(entry => {
    const { api } = entry
    const key = keys.find(item => item.value === api.value)
    let status, action
    if (key) {
      status = '<strong class="govuk-tag govuk-tag--turquoise">Ready to use</strong>'
      action = entry.request ? viewRequest(entry) : ''
    } else if (ready.some(item => item.value === api.value)) {
      status = statusTag('APPROVED')
      action = link(`../production/?id=${application.id}`, 'Get credentials', api)
    } else if (entry.request) {
      status = statusTag(entry.status)
      action = viewRequest(entry)
    } else {
      status = '<strong class="govuk-tag govuk-tag--grey">Not requested</strong>'
      action = link(`../../production-credentials/?application=${application.id}`, 'Request access', api)
    }
    const main = `
      <tr class="govuk-table__row">
        <td class="govuk-table__cell">${escapeHtml(api.text)}</td>
        <td class="govuk-table__cell">${status}</td>
        <td class="govuk-table__cell govuk-table__cell--numeric">${action}</td>
      </tr>`
    return key ? main + `
      <tr class="govuk-table__row">
        <td class="govuk-table__cell" colspan="3">
          <details class="govuk-details govuk-!-margin-bottom-0">
            <summary class="govuk-details__summary"><span class="govuk-details__summary-text">Show production subscription key<span class="govuk-visually-hidden"> for ${escapeHtml(api.text)}</span></span></summary>
            <div class="govuk-details__text">
              <p class="govuk-body apim-credential govuk-!-font-weight-bold">${escapeHtml(key.subscriptionKey)}</p>
              <p class="govuk-body govuk-!-margin-bottom-0">Send it in the <code>Ocp-Apim-Subscription-Key</code> header with every call to this API in production.</p>
            </div>
          </details>
        </td>
      </tr>` : main
  }).join('')
}

// The real service's session notice, shown once on the next page: here kept in sessionStorage.
const NOTICE_KEY = 'ampPrototypeNotice'

function showNotice () {
  let notice = null
  try {
    notice = JSON.parse(window.sessionStorage.getItem(NOTICE_KEY) || 'null')
    window.sessionStorage.removeItem(NOTICE_KEY)
  } catch (e) { /* no notice */ }
  if (!notice) return
  // Above the caption when the page has one, as components/notice.njk in the real service.
  const heading = document.querySelector('h1')
  const caption = heading.previousElementSibling
  const anchor = caption && caption.classList.contains('govuk-caption-l') ? caption : heading
  anchor.insertAdjacentHTML('beforebegin', `
    <div class="govuk-notification-banner${notice.success ? ' govuk-notification-banner--success' : ''}" role="${notice.success ? 'alert' : 'region'}" aria-labelledby="govuk-notification-banner-title" data-module="govuk-notification-banner" id="notice">
      <div class="govuk-notification-banner__header">
        <h2 class="govuk-notification-banner__title" id="govuk-notification-banner-title">${escapeHtml(notice.title)}</h2>
      </div>
      <div class="govuk-notification-banner__content">
        <p class="govuk-notification-banner__heading">${escapeHtml(notice.text)}</p>
      </div>
    </div>`)
}

// Add or remove APIs: editApis and saveEditedApis in the real service's ApplicationsController.
function renderEditApis (application) {
  const form = document.querySelector('form')
  if (!form) return
  const name = application.name
  document.title = 'Add or remove APIs - HMCTS API Marketplace - GOV.UK'
  const caption = document.querySelector('.govuk-caption-l')
  if (caption) caption.textContent = name
  const legend = form.querySelector('legend')
  if (legend) legend.textContent = `Which APIs does ${name} need?`
  const crumbs = document.querySelectorAll('.govuk-breadcrumbs__link')
  const last = crumbs[crumbs.length - 1]
  if (last) { last.textContent = name; last.setAttribute('href', `../detail/?id=${application.id}`) }
  const cancel = Array.from(form.querySelectorAll('a.govuk-link')).find(link => link.textContent.trim() === 'Cancel')
  if (cancel) cancel.setAttribute('href', `../detail/?id=${application.id}`)

  const inputs = Array.from(form.querySelectorAll('input[name="apis"]'))
  const current = application.apis.map(api => api.value)
  inputs.forEach(input => { input.checked = current.includes(input.value) })

  form.addEventListener('submit', event => {
    event.preventDefault()
    const column = form.parentElement
    column.querySelectorAll('.govuk-error-summary, [data-prototype-error]').forEach(el => el.remove())
    const group = form.querySelector('.govuk-form-group')
    group.classList.remove('govuk-form-group--error')
    document.title = document.title.replace(/^Error: /, '')

    const selected = inputs.filter(input => input.checked).map(input => ({
      value: input.value,
      text: (form.querySelector('label[for="' + input.id + '"]') || {}).textContent.trim()
    }))
    if (!selected.length) {
      document.title = 'Error: ' + document.title
      column.querySelector('.govuk-caption-l').insertAdjacentHTML('beforebegin', `
        <div class="govuk-error-summary" data-module="govuk-error-summary" tabindex="-1">
          <div role="alert">
            <h2 class="govuk-error-summary__title">There is a problem</h2>
            <div class="govuk-error-summary__body">
              <ul class="govuk-list govuk-error-summary__list"><li><a href="#apis">Select at least one API</a></li></ul>
            </div>
          </div>
        </div>`)
      group.classList.add('govuk-form-group--error')
      form.querySelector('.govuk-checkboxes').insertAdjacentHTML('beforebegin',
        '<p class="govuk-error-message" data-prototype-error><span class="govuk-visually-hidden">Error:</span> Select at least one API</p>')
      column.querySelector('.govuk-error-summary').focus()
      return
    }

    const added = selected.filter(api => !current.includes(api.value))
    const removed = current.filter(value => !selected.some(api => api.value === value))
    // An API kept keeps its subscription; one added is subscribed now.
    const now = new Date().toISOString()
    applications.update(application.id, {
      apis: selected.map(api => application.apis.find(kept => kept.value === api.value) || { ...api, subscribedAt: now })
    })
    try {
      window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify({
        success: true,
        title: 'Success',
        text: added.length || removed.length
          ? `APIs updated: ${added.length} added, ${removed.length} removed. Each API added has its own new subscription key.`
          : 'No changes were made to the APIs.'
      }))
    } catch (e) { /* the page still shows the change */ }
    window.location.href = `../detail/?id=${application.id}`
  })
}

function requireApplication (listUrl) {
  const application = applications.find(query('id'))
  if (!application) {
    window.location.href = listUrl
    return null
  }
  return application
}

const current = page()
if (current === '') renderList()
if ((current === 'new' || current === 'new/details') && atLimit()) sendBackAtLimit(current === 'new' ? '../' : '../../')
if (current === 'new/details') captureStep('../apis/', form => {
  const name = form.elements.name.value.trim()
  if (!name) return null
  return { name }
})
if (current === 'new/apis') captureStep('../check-answers/', form => ({
  apis: Array.from(form.querySelectorAll('input[name="apis"]:checked')).map(input => ({
    value: input.value,
    text: (form.querySelector('label[for="' + input.id + '"]') || {}).textContent.trim()
  }))
}))
if (current === 'new/check-answers') renderCheckAnswers()
if (current === 'new/confirmation') {
  const application = requireApplication('../../')
  if (application) renderConfirmation(application, applications.newSecret(application.id))
}
if (current === 'apis') {
  const application = requireApplication('../')
  if (application) renderEditApis(application)
}
if (current === 'delete') {
  const application = requireApplication('../')
  if (application) renderDelete(application)
}
if (current === 'api') {
  const application = requireApplication('../')
  if (application) renderApi(application)
}
if (current === 'client-secret' && features.isOn(REGENERATE)) {
  const application = requireApplication('../')
  if (application) renderRegenerate(application)
}
if (current === 'client-secret/new' && features.isOn(REGENERATE)) {
  const application = requireApplication('../../')
  if (application) renderNewSecret(application)
}
if (current === 'detail') {
  const application = requireApplication('../')
  if (application) renderDetail(application)
}
