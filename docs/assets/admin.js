import { user, applications, productionRequests, DUMMY_USER } from './store.js?v=336cbca241'
import { features } from './features.js?v=336cbca241'
import { ORGANISATION_TYPES, label, triageRows } from './triage.js?v=336cbca241'
import { FEATURE, requestApis, statusSummary, statusTag as apiStatusTag } from './request-apis.js?v=336cbca241'
import { FEATURE as SELF_SERVE, decisionEmail } from './production-access.js?v=336cbca241'

// The admin pages. The real service has an Admin page for the amp_admin app role, with nothing on it
// yet, and no cross-user reads. The admin dashboard feature is a read-only design on top: made-up
// users, applications and requests from admin-seed.json, plus the example user's own
// applications and requests from this browser.

const STATUS_TEXT = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  MORE_INFORMATION_NEEDED: 'More information needed',
  APPROVED: 'Approved',
  DECLINED: 'Declined'
}

const CALL_VOLUMES = { low: 'Low', medium: 'Medium', high: 'High' }

function page () {
  const path = window.location.pathname.replace(/index\.html$/, '')
  const match = path.match(/\/admin\/(.*)$/)
  return match ? match[1].replace(/\/$/, '') : null
}

function query (name) {
  return new URLSearchParams(window.location.search).get(name)
}

function escapeHtml (value) {
  const div = document.createElement('div')
  div.textContent = value == null ? '' : String(value)
  return div.innerHTML
}

function formatDate (iso) {
  if (!iso) return 'Not known'
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}

function plural (count, one, many) {
  return `${count} ${count === 1 ? one : many}`
}

// Everything the admin pages show, with the example user's local data folded in as one more user.
async function loadData () {
  // Keeps the ?v= this script was loaded with, so a new build fetches the seed afresh too.
  const seedUrl = new URL('admin-seed.json' + new URL(import.meta.url).search, import.meta.url)
  const seed = await fetch(seedUrl).then(response => response.json())

  const localApps = applications.all().map(application => ({ ...application, ownerId: DUMMY_USER.oid }))
  const localRequests = productionRequests.all().map(request => ({ ...request, ownerId: DUMMY_USER.oid }))

  const users = seed.users.slice()
  if (localApps.length || localRequests.length || user.lastSignIn()) {
    const dates = localApps.map(a => a.createdAt).concat(localRequests.map(r => r.submittedAt), user.lastSignIn() || []).sort()
    users.push({
      id: DUMMY_USER.oid,
      name: DUMMY_USER.name,
      email: DUMMY_USER.email,
      status: 'ACTIVE',
      createdAt: dates[0],
      lastLoginAt: user.lastSignIn()
    })
  }

  const allApps = seed.applications.concat(localApps)
  const allRequests = seed.requests.concat(localRequests).map(request => {
    const application = allApps.find(a => a.id === request.applicationId)
    return { ...request, applicationName: request.applicationName || (application && application.name) || 'Deleted application' }
  })

  return {
    users,
    applications: allApps,
    requests: allRequests,
    user: id => users.find(u => u.id === id) || null,
    application: id => allApps.find(a => a.id === id) || null,
    request: reference => allRequests.find(r => r.reference === reference) || null,
    // Organisation lives on a production request, not on the user, as in the real backend.
    organisationOf: id => (allRequests.find(r => r.ownerId === id) || {}).organisation || 'Not known'
  }
}

// Relative links, so the pages work from the GitHub Pages subdirectory. `depth` is how many
// folders below /admin/ the current page is.
function adminLink (depth, path) {
  return '../'.repeat(depth) + path
}

function table (caption, head, rows, emptyText) {
  if (!rows.length) return `<p class="govuk-body">${escapeHtml(emptyText)}</p>`
  // Wide tables scroll inside a focusable region on a phone rather than widen the page.
  return `
    <div class="app-table-scroll" role="region" aria-label="${escapeHtml(caption)}" tabindex="0">
    <table class="govuk-table">
      <caption class="govuk-table__caption govuk-visually-hidden">${escapeHtml(caption)}</caption>
      <thead class="govuk-table__head">
        <tr class="govuk-table__row">${head.map(h => `<th scope="col" class="govuk-table__header">${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody class="govuk-table__body">
        ${rows.map(cells => `<tr class="govuk-table__row">${cells.map(c => `<td class="govuk-table__cell">${c}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    </div>`
}

function summaryRows (rows) {
  return rows.map(([key, value]) => `
    <div class="govuk-summary-list__row">
      <dt class="govuk-summary-list__key">${escapeHtml(key)}</dt>
      <dd class="govuk-summary-list__value">${value}</dd>
    </div>`).join('')
}

function link (href, text, extraClass) {
  return `<a class="govuk-link${extraClass ? ' ' + extraClass : ''}" href="${href}">${escapeHtml(text)}</a>`
}

function statusTag (status) {
  return escapeHtml(STATUS_TEXT[status] || status)
}

function setHeading (text, titlePrefix) {
  document.getElementById('admin-heading').textContent = text
  document.title = `${text} - ${titlePrefix} - Admin - HMCTS API Marketplace - GOV.UK`
}

function notFound (what, backHref) {
  document.getElementById('admin-content').innerHTML = `
    <h1 class="govuk-heading-xl">${escapeHtml(what)} not found</h1>
    <p class="govuk-body">${link(backHref, 'Go back to the list')}</p>`
}

function requestsTable (data, requests, depth, emptyText) {
  return table('Production credentials requests', ['Reference', 'Application', 'Organisation', 'Submitted', 'Status'],
    requests.map(r => [
      link(adminLink(depth, `requests/detail/?reference=${r.reference}`), r.reference, 'apim-reference'),
      link(adminLink(depth, `applications/detail/?id=${r.applicationId}`), r.applicationName),
      escapeHtml(r.organisation),
      formatDate(r.submittedAt),
      features.isOn(FEATURE) && Array.isArray(r.apiItems) ? escapeHtml(statusSummary(r)) : statusTag(r.status)
    ]), emptyText)
}

function renderOverview (data) {
  const counts = [
    [data.users.length, 'registered user', 'registered users', 'users/'],
    [data.applications.length, 'application', 'applications', 'applications/'],
    [data.requests.length, 'production request', 'production requests', 'requests/']
  ]
  document.getElementById('admin-counts').innerHTML = counts.map(([count, one, many, href]) => `
    <div class="govuk-grid-column-one-third">
      <p class="govuk-body">
        <a class="govuk-link govuk-link--no-visited-state" href="${href}">
          <span class="govuk-heading-xl govuk-!-margin-bottom-1">${count}</span>
          ${escapeHtml(count === 1 ? one : many)}
        </a>
      </p>
    </div>`).join('')
}

function renderUsers (data) {
  const term = (query('q') || '').trim().toLowerCase()
  document.getElementById('q').value = query('q') || ''
  const matching = data.users
    .filter(u => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  document.getElementById('admin-results-count').textContent = term
    ? `${plural(matching.length, 'user matches', 'users match')} “${query('q').trim()}”.`
    : `${plural(matching.length, 'user', 'users')}.`

  document.getElementById('admin-users').innerHTML = table('Registered users',
    ['Name', 'Email', 'Joined', 'Last signed in', 'Applications'],
    matching.map(u => [
      link(`detail/?id=${encodeURIComponent(u.id)}`, u.name),
      escapeHtml(u.email),
      formatDate(u.createdAt),
      formatDate(u.lastLoginAt),
      String(data.applications.filter(a => a.ownerId === u.id).length)
    ]), 'No users match. Try a different name or email.')
}

function renderUser (data) {
  const found = data.user(query('id'))
  if (!found) { notFound('User', '../'); return }

  setHeading(found.name, 'Users')
  document.getElementById('admin-user-details').innerHTML = summaryRows([
    ['Name', escapeHtml(found.name)],
    ['Email', escapeHtml(found.email)],
    ['Organisation', escapeHtml(data.organisationOf(found.id))],
    ['Status', found.status === 'ACTIVE' ? 'Active' : escapeHtml(found.status)],
    ['Joined', formatDate(found.createdAt)],
    ['Last signed in', formatDate(found.lastLoginAt)]
  ])

  const owned = data.applications.filter(a => a.ownerId === found.id)
  document.getElementById('admin-user-applications').innerHTML = table('Applications', ['Application', 'APIs', 'Created'],
    owned.map(a => [link(`../../applications/detail/?id=${a.id}`, a.name), plural(a.apis.length, 'API', 'APIs'), formatDate(a.createdAt)]),
    'This user has no applications.')

  document.getElementById('admin-user-requests').innerHTML =
    requestsTable(data, data.requests.filter(r => r.ownerId === found.id), 2, 'This user has not asked for production credentials.')
}

function renderApplications (data) {
  const sorted = data.applications.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  document.getElementById('admin-applications').innerHTML = table('Applications',
    ['Application', 'Owner', 'APIs', 'Created', 'Production credentials'],
    sorted.map(a => {
      const owner = data.user(a.ownerId)
      const request = data.requests.find(r => r.applicationId === a.id)
      return [
        link(`detail/?id=${a.id}`, a.name),
        owner ? link(`../users/detail/?id=${encodeURIComponent(owner.id)}`, owner.name) : 'Not known',
        plural(a.apis.length, 'API', 'APIs'),
        formatDate(a.createdAt),
        request ? link(`../requests/detail/?reference=${request.reference}`, 'Requested') : 'Not requested'
      ]
    }), 'There are no applications yet.')
}

function renderApplication (data) {
  const found = data.application(query('id'))
  if (!found) { notFound('Application', '../'); return }

  setHeading(found.name, 'Applications')
  const owner = data.user(found.ownerId)
  document.getElementById('admin-application-details').innerHTML = summaryRows([
    ['Application name', escapeHtml(found.name)],
    ['Owner', owner ? `${link(`../../users/detail/?id=${encodeURIComponent(owner.id)}`, owner.name)}<br>${escapeHtml(owner.email)}` : 'Not known'],
    ['Created', formatDate(found.createdAt)],
    ['Client ID', `<span class="apim-credential">${escapeHtml(found.clientId)}</span>`]
  ])

  document.getElementById('admin-application-apis').innerHTML = found.apis.length
    ? `<ul class="govuk-list govuk-list--bullet">${found.apis.map(api => `<li>${escapeHtml(api.text)}</li>`).join('')}</ul>`
    : '<p class="govuk-body">This application has no APIs.</p>'

  const request = data.requests.find(r => r.applicationId === found.id)
  document.getElementById('admin-application-request').innerHTML = request
    ? `<dl class="govuk-summary-list">${summaryRows([
      ['Reference', link(`../../requests/detail/?reference=${request.reference}`, request.reference, 'apim-reference')],
      ['Status', statusTag(request.status)],
      ['Submitted', formatDate(request.submittedAt)]
    ])}</dl>`
    : '<p class="govuk-body">Production credentials have not been requested for this application.</p>'
}

function renderRequests (data) {
  const status = query('status') || ''
  document.getElementById('status').value = status
  const matching = data.requests
    .filter(r => !status || r.status === status)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

  document.getElementById('admin-results-count').textContent = status
    ? `${plural(matching.length, 'request', 'requests')} with the status ${STATUS_TEXT[status] || status}.`
    : `${plural(matching.length, 'request', 'requests')}.`

  document.getElementById('admin-requests').innerHTML =
    requestsTable(data, matching, 1, 'No requests have this status.')
}

function renderRequest (data) {
  const found = data.request(query('reference'))
  if (!found) { notFound('Request', '../'); return }

  setHeading(found.reference, 'Production requests')
  const perApi = features.isOn(FEATURE) && Array.isArray(found.apiItems)
  document.getElementById('admin-request-status').textContent = perApi ? statusSummary(found) : (STATUS_TEXT[found.status] || found.status)
  document.getElementById('admin-request-submitted').textContent = formatDate(found.submittedAt)

  const owner = data.user(found.ownerId)
  const application = data.application(found.applicationId)
  document.getElementById('admin-request-who').innerHTML = summaryRows([
    ['Requested by', owner ? `${link(`../../users/detail/?id=${encodeURIComponent(owner.id)}`, owner.name)}<br>${escapeHtml(owner.email)}` : 'Not known'],
    ...(found.organisationType ? [['Organisation', escapeHtml(label(ORGANISATION_TYPES, found.organisationType))]] : []),
    ['Team name (and organisation if external to HMCTS?)', escapeHtml(found.organisation)],
    ['Application', application ? link(`../../applications/detail/?id=${application.id}`, application.name) : escapeHtml(found.applicationName)],
    // With requests for each API, the APIs this request asks for, each with its own outcome.
    ['APIs', perApi
      ? `<ul class="govuk-list">${requestApis(found).map(api => `<li>${escapeHtml(api.text)} ${apiStatusTag(api.status)}</li>`).join('')}</ul>`
      : escapeHtml(application ? application.apis.map(api => api.text).join(', ') || 'None' : (found.apis || []).join(', '))]
  ])

  document.getElementById('admin-request-answers').innerHTML = summaryRows([
    ['Go-live date', formatDate(found.goLiveDate)],
    ['Expected call volume', escapeHtml(CALL_VOLUMES[found.callVolume] || found.callVolume)],
    ['Data request', escapeHtml(found.dataRequest)],
    ...triageRows(found).map(row => [row.key, escapeHtml(row.value)])
  ])

  if (features.isOn(SELF_SERVE)) renderDecision(found, owner, perApi)
}

// Phase 2, getting production credentials yourself: record the Data Access Team's decision, which
// in the real service would email the requester. Only requests made in this browser can change;
// the made-up ones from admin-seed.json stay as they are.
const DECISION_KEY = 'ampPrototypeDecisionRecorded'
const DECISIONS = [
  { value: 'APPROVED', text: 'Approved', hint: 'The requester can then sign in and get production credentials.' },
  { value: 'MORE_INFORMATION_NEEDED', text: 'More information needed', hint: 'Say what the Data Access Team need in the message.' },
  { value: 'DECLINED', text: 'Declined', hint: 'Say why in the message.' },
  { value: 'IN_REVIEW', text: 'In review', hint: 'The Data Access Team have started reviewing it.' }
]

function renderDecision (found, owner, perApi) {
  const container = document.getElementById('admin-request-decision')
  const local = !!productionRequests.find(found.reference)
  const who = owner ? `${owner.name} (${owner.email})` : 'the requester'

  let recorded = null
  try {
    recorded = JSON.parse(window.sessionStorage.getItem(DECISION_KEY) || 'null')
    window.sessionStorage.removeItem(DECISION_KEY)
  } catch (e) { /* no banner */ }
  if (recorded && recorded.reference === found.reference) {
    const email = decisionEmail(found, recorded.decision, `../../../account/production-credentials/view/?reference=${found.reference}`)
    document.getElementById('admin-heading').insertAdjacentHTML('beforebegin', `
      <div class="govuk-notification-banner govuk-notification-banner--success" role="alert" aria-labelledby="decision-banner-title" data-module="govuk-notification-banner" id="decision-recorded">
        <div class="govuk-notification-banner__header">
          <h2 class="govuk-notification-banner__title" id="decision-banner-title">Success</h2>
        </div>
        <div class="govuk-notification-banner__content">
          <p class="govuk-notification-banner__heading">Decision recorded: ${escapeHtml(STATUS_TEXT[recorded.decision.status])}</p>
          <p class="govuk-body">We have emailed ${escapeHtml(who)}.</p>
          <details class="govuk-details govuk-!-margin-bottom-0">
            <summary class="govuk-details__summary"><span class="govuk-details__summary-text">See the email</span></summary>
            <div class="govuk-details__text" id="decision-email">
              <p class="govuk-body"><strong>Subject:</strong> ${escapeHtml(email.subject)}</p>
              <p class="govuk-body">Dear ${escapeHtml(owner ? owner.name : 'requester')},</p>
              ${email.body}
              <p class="govuk-body">HMCTS API Marketplace</p>
            </div>
          </details>
        </div>
      </div>`)
  }

  const history = found.decisions || []
  document.getElementById('admin-request-history').innerHTML = history.length
    ? `<h2 class="govuk-heading-m">Decisions</h2>${table('Decisions', ['Date', 'Decision', ...(perApi ? ['APIs'] : []), 'Message to the requester'],
      history.slice().reverse().map(d => [formatDate(d.decidedAt), statusTag(d.status), ...(perApi ? [escapeHtml((d.apis || []).join(', '))] : []), escapeHtml(d.note || 'None')]), '')}`
    : ''

  if (!local) {
    container.innerHTML = `
      <h2 class="govuk-heading-m">Record the decision</h2>
      <p class="govuk-body">This request is made-up example data, so its decision cannot be recorded. Try one you made in this browser.</p>`
    return
  }

  const apis = requestApis(found)
  const radios = DECISIONS.map((d, i) => `
    <div class="govuk-radios__item">
      <input class="govuk-radios__input" id="decision${i ? '-' + (i + 1) : ''}" name="decision" type="radio" value="${d.value}" aria-describedby="decision-${i + 1}-hint">
      <label class="govuk-label govuk-radios__label" for="decision${i ? '-' + (i + 1) : ''}">${escapeHtml(d.text)}</label>
      <div id="decision-${i + 1}-hint" class="govuk-hint govuk-radios__hint">${escapeHtml(d.hint)}</div>
    </div>`).join('')
  const apiChoices = perApi
    ? `<div class="govuk-form-group">
        <fieldset class="govuk-fieldset">
          <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Which APIs is this decision for?</legend>
          <div class="govuk-checkboxes govuk-checkboxes--small" data-module="govuk-checkboxes">
            ${apis.map((api, i) => `
              <div class="govuk-checkboxes__item">
                <input class="govuk-checkboxes__input" id="decision-apis${i ? '-' + (i + 1) : ''}" name="decision-apis" type="checkbox" value="${escapeHtml(api.text)}">
                <label class="govuk-label govuk-checkboxes__label" for="decision-apis${i ? '-' + (i + 1) : ''}">${escapeHtml(api.text)} ${apiStatusTag(api.status)}</label>
              </div>`).join('')}
          </div>
        </fieldset>
      </div>`
    : ''

  container.innerHTML = `
    <h2 class="govuk-heading-m">Record the decision</h2>
    <p class="govuk-body">Record what the Data Access Team decided. We email ${escapeHtml(who)} straight away. If it is approved, they sign in and get their own production credentials.</p>
    <form novalidate id="decision-form">
      ${apiChoices}
      <div class="govuk-form-group">
        <fieldset class="govuk-fieldset">
          <legend class="govuk-fieldset__legend govuk-fieldset__legend--s">Decision</legend>
          <div class="govuk-radios" data-module="govuk-radios">${radios}</div>
        </fieldset>
      </div>
      <div class="govuk-form-group">
        <label class="govuk-label govuk-label--s" for="decision-note">Message to the requester</label>
        <div class="govuk-hint" id="decision-note-hint">Goes in the email and on their request page. Optional when approving.</div>
        <textarea class="govuk-textarea" id="decision-note" name="decision-note" rows="4" aria-describedby="decision-note-hint"></textarea>
      </div>
      <button type="submit" class="govuk-button" data-module="govuk-button" id="decision-save">Record decision and email ${escapeHtml(owner ? owner.name : 'the requester')}</button>
    </form>`

  const form = document.getElementById('decision-form')
  form.addEventListener('submit', event => {
    event.preventDefault()
    const status = (form.querySelector('input[name="decision"]:checked') || {}).value
    const chosen = Array.from(form.querySelectorAll('input[name="decision-apis"]:checked')).map(input => input.value)
    const note = form.elements['decision-note'].value.trim()
    const errors = []
    if (perApi && !chosen.length) errors.push({ name: 'decision-apis', text: 'Select the APIs this decision is for' })
    if (!status) errors.push({ name: 'decision', text: 'Select the decision' })
    if ((status === 'DECLINED' || status === 'MORE_INFORMATION_NEEDED') && !note) {
      errors.push({ name: 'decision-note', text: status === 'DECLINED' ? 'Enter a message saying why it was declined' : 'Enter a message saying what information is needed' })
    }
    showFormErrors(form, errors)
    if (errors.length) return

    const decision = { status, note, apis: perApi ? chosen : [], decidedAt: new Date().toISOString() }
    const changes = { decisions: history.concat(decision) }
    if (perApi) {
      const items = found.apiItems.map(api => (chosen.includes(api.text) ? { ...api, status } : api))
      changes.apiItems = items
      const statuses = new Set(items.map(api => api.status))
      if (statuses.size === 1) changes.status = status
    } else {
      changes.status = status
    }
    productionRequests.update(found.reference, changes)
    try {
      window.sessionStorage.setItem(DECISION_KEY, JSON.stringify({ reference: found.reference, decision }))
    } catch (e) { /* the page still shows the decision */ }
    window.location.reload()
  })
}

// The markup the GOV.UK macros render when given an errorMessage, added after the page has loaded.
function showFormErrors (form, errors) {
  const column = form.parentElement
  document.querySelectorAll('.govuk-error-summary, [data-prototype-error]').forEach(el => el.remove())
  form.querySelectorAll('.govuk-form-group--error').forEach(el => el.classList.remove('govuk-form-group--error'))
  form.querySelectorAll('.govuk-textarea--error').forEach(el => el.classList.remove('govuk-textarea--error'))
  document.title = document.title.replace(/^Error: /, '')
  if (!errors.length) return
  document.title = 'Error: ' + document.title
  const firstId = name => (name === 'decision-note' ? 'decision-note' : form.querySelector(`input[name="${name}"]`).id)
  column.querySelector('h2').insertAdjacentHTML('beforebegin', `
    <div class="govuk-error-summary" data-module="govuk-error-summary" tabindex="-1">
      <div role="alert">
        <h2 class="govuk-error-summary__title">There is a problem</h2>
        <div class="govuk-error-summary__body">
          <ul class="govuk-list govuk-error-summary__list">${errors.map(e => `<li><a href="#${firstId(e.name)}">${escapeHtml(e.text)}</a></li>`).join('')}</ul>
        </div>
      </div>
    </div>`)
  errors.forEach(error => {
    const field = error.name === 'decision-note'
      ? document.getElementById('decision-note')
      : form.querySelector(`input[name="${error.name}"]`).closest('.govuk-radios, .govuk-checkboxes')
    field.closest('.govuk-form-group').classList.add('govuk-form-group--error')
    if (field.tagName === 'TEXTAREA') field.classList.add('govuk-textarea--error')
    field.insertAdjacentHTML('beforebegin', `<p class="govuk-error-message" data-prototype-error><span class="govuk-visually-hidden">Error:</span> ${escapeHtml(error.text)}</p>`)
  })
  column.querySelector('.govuk-error-summary').focus()
}

const RENDERERS = {
  '': renderOverview,
  users: renderUsers,
  'users/detail': renderUser,
  applications: renderApplications,
  'applications/detail': renderApplication,
  requests: renderRequests,
  'requests/detail': renderRequest
}

async function start () {
  const current = page()
  if (current === null || !(current in RENDERERS)) return
  const dashboard = features.isOn('admin-dashboard')
  // Only the Admin page itself is in the real service. With the feature off, features.js has
  // already replaced the other admin pages with a message.
  if (current !== '' && !dashboard) return

  const content = document.getElementById('admin-content')
  const denied = document.getElementById('admin-denied')
  if (!user.isAdmin()) {
    denied.hidden = false
    return
  }
  if (dashboard) RENDERERS[current](await loadData())
  content.hidden = false
}

start()
