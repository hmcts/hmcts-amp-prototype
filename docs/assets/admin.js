import { user, applications, productionRequests, DUMMY_USER } from './store.js?v=db52eceb83'
import { features } from './features.js?v=db52eceb83'
import { ORGANISATION_TYPES, label, triageRows } from './triage.js?v=db52eceb83'
import { FEATURE, requestApis, statusSummary, statusTag as apiStatusTag } from './request-apis.js?v=db52eceb83'

// The admin pages. The real service has an Admin page for the ADMIN role, with nothing on it
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
      statusTag(r.status)
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
