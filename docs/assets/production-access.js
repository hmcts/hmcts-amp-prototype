import { applications, productionRequests, productionCredentials, user } from './store.js?v=a60cb05ac2'
import { features } from './features.js?v=a60cb05ac2'
import { FEATURE as PER_API, TAG_CLASS, coverage, requestApis } from './request-apis.js?v=a60cb05ac2'

// Phase 2: getting production credentials yourself (feature 'production-credentials-self-serve').
// Not in the real service, where nothing moves a request on from Submitted and production
// credentials are made by hand and shared outside the product. Here the Data Access Team record
// their decision on the Admin pages (admin.js), the requester is emailed, and
// once signed in they generate their own production credentials, seeing the secret once.

export const FEATURE = 'production-credentials-self-serve'

const SECRET_KEY = 'ampPrototypeProductionSecret'
// Regenerating the production secret is part of 'regenerate-client-secret', with the Try it now one.
const REGENERATE = 'regenerate-client-secret'

export function on () {
  return features.isOn(FEATURE)
}

function escapeHtml (value) {
  const div = document.createElement('div')
  div.textContent = value == null ? '' : String(value)
  return div.innerHTML
}

function formatDate (iso) {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}

function row (key, value, action) {
  return `
    <div class="govuk-summary-list__row${action === null ? ' govuk-summary-list__row--no-actions' : ''}">
      <dt class="govuk-summary-list__key">${escapeHtml(key)}</dt>
      <dd class="govuk-summary-list__value">${value}</dd>${action ? `
      <dd class="govuk-summary-list__actions">
        <a class="govuk-link" href="${action.href}" id="${action.id}">${action.text}<span class="govuk-visually-hidden"> ${action.hidden}</span></a>
      </dd>` : ''}
    </div>`
}

function query (name) {
  return new URLSearchParams(window.location.search).get(name)
}

function list (items) {
  return items.length === 1
    ? escapeHtml(items[0])
    : `${items.slice(0, -1).map(escapeHtml).join(', ')} and ${escapeHtml(items[items.length - 1])}`
}

// The application's APIs that the Data Access Team have approved for production. With requests
// for each API, each API has its own outcome; without, an approved request covers the APIs it
// named (or, for a request that named none, the whole application).
export function approvedApis (application) {
  if (features.isOn(PER_API)) {
    return coverage(application).filter(entry => entry.status === 'APPROVED').map(entry => entry.api)
  }
  const request = productionRequests.forApplication(application.id)
  if (!request || request.status !== 'APPROVED') return []
  const names = requestApis(request).map(api => api.text)
  return application.apis.filter(api => !names.length || names.includes(api.text))
}

// Approved APIs that do not have production credentials yet.
export function readyApis (application) {
  const done = (application.production && application.production.apis) || []
  return approvedApis(application).filter(api => !done.some(key => key.value === api.value))
}

// The email the requester gets when a decision is recorded. The real service would send it with
// GOV.UK Notify; here the admin page shows it. `link` is the request page, relative to the caller.
export function decisionEmail (request, decision, link) {
  const name = escapeHtml(request.applicationName)
  // "production access to Hearing Results for Case progress tracker", or the whole application.
  const what = decision.apis && decision.apis.length ? `production access to ${list(decision.apis)} for ${name}` : `production access for ${name}`
  const note = decision.note
    ? `<p class="govuk-body">Message from the Data Access Team:</p><div class="govuk-inset-text">${escapeHtml(decision.note)}</div>`
    : ''
  const reference = `<p class="govuk-body">Your request reference is <span class="apim-reference">${escapeHtml(request.reference)}</span>.</p>`
  const bodies = {
    APPROVED: {
      subject: `Production access approved: ${request.applicationName}`,
      body: `
        <p class="govuk-body">The Data Access Team have approved ${what}.</p>
        ${reference}
        <p class="govuk-body"><a class="govuk-link" href="${link}">Sign in to get your production credentials</a>.</p>
        <p class="govuk-body">We do not send credentials by email. You generate them yourself, and you see the client secret only once, so have somewhere secure to keep it first, such as a key vault.</p>
        ${note}`
    },
    DECLINED: {
      subject: `Production access not approved: ${request.applicationName}`,
      body: `
        <p class="govuk-body">The Data Access Team have not approved ${what}.</p>
        ${reference}
        ${note}
        <p class="govuk-body">If you have questions, contact us through Help and support.</p>`
    },
    MORE_INFORMATION_NEEDED: {
      subject: `More information needed: ${request.reference}`,
      body: `
        <p class="govuk-body">The Data Access Team need more information before they can decide on ${what}.</p>
        ${reference}
        ${note}
        <p class="govuk-body">Reply to this email with the information. <a class="govuk-link" href="${link}">View your request</a>.</p>`
    },
    IN_REVIEW: {
      subject: `Your request is being reviewed: ${request.reference}`,
      body: `
        <p class="govuk-body">The Data Access Team have started reviewing your request for ${what}.</p>
        ${reference}
        ${note}
        <p class="govuk-body"><a class="govuk-link" href="${link}">View your request</a>.</p>`
    }
  }
  return bodies[decision.status]
}

function banner (title, html, success) {
  return `
    <div class="govuk-notification-banner${success ? ' govuk-notification-banner--success' : ''}" role="${success ? 'alert' : 'region'}" aria-labelledby="production-banner-title" data-module="govuk-notification-banner" id="production-banner">
      <div class="govuk-notification-banner__header">
        <h2 class="govuk-notification-banner__title" id="production-banner-title">${escapeHtml(title)}</h2>
      </div>
      <div class="govuk-notification-banner__content">${html}</div>
    </div>`
}

// Request page: what was decided, and the way to the credentials once approved.
function renderRequestOutcome () {
  const container = document.getElementById('request-outcome')
  const request = productionRequests.find(query('reference'))
  if (!container || !request) return
  // The status tag takes the status's colour once a decision is recorded, as on the admin pages.
  const tag = document.getElementById('request-status')
  const statuses = new Set(features.isOn(PER_API) && requestApis(request).length
    ? requestApis(request).map(api => api.status)
    : [request.status])
  if (tag && statuses.size === 1) {
    tag.classList.remove('govuk-tag--blue')
    tag.classList.add(TAG_CLASS[[...statuses][0]] || 'govuk-tag--blue')
  }
  const application = applications.find(request.applicationId)
  const decisions = request.decisions || []
  const latest = decisions[decisions.length - 1]
  const parts = []

  if (application) {
    const ready = readyApis(application)
    const done = (application.production && application.production.apis) || []
    const fromThis = requestApis(request).map(api => api.text)
    const readyHere = ready.filter(api => !fromThis.length || fromThis.includes(api.text))
    const doneHere = done.filter(api => !fromThis.length || fromThis.includes(api.text))
    if (readyHere.length) {
      parts.push(banner('Production access approved', `
        <p class="govuk-notification-banner__heading">You can now get production credentials for ${escapeHtml(application.name)}.</p>
        <p class="govuk-body">Approved: ${list(readyHere.map(api => api.text))}.</p>
        <a class="govuk-button govuk-!-margin-bottom-0" href="../../applications/production/?id=${application.id}" id="get-production-credentials">${application.production ? 'Add to your production credentials' : 'Get production credentials'}</a>`, true))
    } else if (doneHere.length) {
      parts.push(`<p class="govuk-body" id="production-collected">You got production credentials for ${list(doneHere.map(api => api.text))} on ${formatDate(doneHere[0].createdAt)}.
        <a class="govuk-link" href="../../applications/detail/?id=${application.id}#production">See them on the application page</a>.</p>`)
    }
  }

  if (latest && latest.status === 'MORE_INFORMATION_NEEDED') {
    parts.push(banner('Important', `
      <p class="govuk-notification-banner__heading">The Data Access Team need more information before they can decide.</p>
      ${latest.note ? `<p class="govuk-body">${escapeHtml(latest.note)}</p>` : ''}
      <p class="govuk-body">Reply to the email we sent you on ${formatDate(latest.decidedAt)}.</p>`))
  } else if (latest && latest.note) {
    parts.push(`<div class="govuk-inset-text" id="decision-note">Message from the Data Access Team, ${formatDate(latest.decidedAt)}: ${escapeHtml(latest.note)}</div>`)
  }
  container.innerHTML = parts.join('')
}

// Application page: anything waiting to be collected, and the production credentials once made.
function renderApplicationProduction () {
  const ready = document.getElementById('production-ready')
  const section = document.getElementById('production-section')
  const application = applications.find(query('id'))
  if (!ready || !section || !application) return

  const waiting = readyApis(application)
  // With requests for each API, the table's Get credentials links do this job, so the box is left out.
  ready.innerHTML = waiting.length && !features.isOn(PER_API)
    ? `<div class="govuk-inset-text">
        Production access has been approved for ${list(waiting.map(api => api.text))}.
        <p class="govuk-body govuk-!-margin-top-2 govuk-!-margin-bottom-0"><a class="govuk-button govuk-!-margin-bottom-0" href="../production/?id=${application.id}" id="get-production-credentials">${application.production ? 'Add to your production credentials' : 'Get production credentials'}</a></p>
      </div>`
    : ''

  const production = application.production
  section.hidden = !production
  if (!production) return
  // With regenerating on, the secret's row has a Regenerate action, so the other rows say they have none.
  const regenerate = features.isOn(REGENERATE)
  const none = regenerate ? null : undefined
  document.getElementById('production-credentials').innerHTML =
    row('Client ID', `<span class="apim-credential" id="production-client-id">${production.clientId}</span>`, none) +
    row('Client secret', `<span class="apim-credential" id="production-masked-secret">${maskedSecret(production)}</span><br><span class="govuk-hint">Shown once, on ${formatDate(production.secretCreatedAt)}.</span>`,
      regenerate ? { href: `../production/regenerate/?id=${application.id}`, text: 'Regenerate', hidden: 'production client secret', id: 'regenerate-production-secret' } : none) +
    row('Created', formatDate(production.createdAt), none)
  document.getElementById('production-keys').innerHTML = production.apis.map(api =>
    row(api.text, `<span class="apim-credential">${api.subscriptionKey}</span>`)).join('')
}

// Like the Try it now secret: its first 3 characters, then ****. Credentials made by an older
// prototype kept no hint, so they get a made-up one.
function maskedSecret (production) {
  return `${production.secretHint || production.clientId.replace(/-/g, '').slice(-3)}****`
}

// Your account: say when credentials are waiting, so someone who signs in from the email sees it.
function renderAccountNotice () {
  const heading = document.querySelector('h1')
  if (!document.getElementById('tab-requests') || !heading || !user.current()) return
  const waiting = applications.all().filter(application => readyApis(application).length)
  if (!waiting.length) return
  heading.insertAdjacentHTML('beforebegin', banner('Production credentials ready', `
    <p class="govuk-notification-banner__heading">Production access has been approved. You can now get production credentials for:</p>
    <ul class="govuk-list">${waiting.map(application =>
      `<li><a class="govuk-notification-banner__link" href="applications/production/?id=${application.id}">${escapeHtml(application.name)}</a></li>`).join('')}</ul>`))
}

function page () {
  const path = window.location.pathname.replace(/index\.html$/, '')
  const match = path.match(/account\/applications\/(production.*)$/)
  return match ? match[1].replace(/\/$/, '') : null
}

function requireApplication () {
  const application = applications.find(query('id'))
  if (!application) window.location.href = '../'.repeat(page() === 'production' ? 1 : 2)
  return application
}

function fillName (application) {
  document.querySelectorAll('[data-application-name]').forEach(el => { el.textContent = application.name })
  document.querySelectorAll('[data-application-link]').forEach(el => {
    el.setAttribute('href', `${page() === 'production' ? '../' : '../../'}detail/?id=${application.id}#production`)
  })
}

// Before you generate: what you get, a warning about the secret, and the terms of use.
function renderGet () {
  const application = requireApplication()
  if (!application) return
  fillName(application)
  const waiting = readyApis(application)
  const adding = !!application.production
  const form = document.getElementById('production-form')

  if (!waiting.length) {
    document.getElementById('production-nothing').hidden = false
    form.hidden = true
    document.getElementById('production-intro').hidden = true
    return
  }

  document.getElementById('production-approved-apis').innerHTML = waiting.map(api => `<li>${escapeHtml(api.text)}</li>`).join('')
  document.getElementById('production-new').hidden = adding
  document.getElementById('production-adding').hidden = !adding
  if (adding) {
    document.getElementById('production-heading').textContent = 'Add to your production credentials'
    document.getElementById('production-generate').textContent = 'Add to production credentials'
  }
  document.title = `${document.getElementById('production-heading').textContent} - HMCTS API Marketplace - GOV.UK`

  form.addEventListener('submit', event => {
    event.preventDefault()
    const terms = document.getElementById('production-terms')
    const group = terms.closest('.govuk-form-group')
    const column = form.parentElement
    column.querySelectorAll('.govuk-error-summary, [data-prototype-error]').forEach(el => el.remove())
    group.classList.remove('govuk-form-group--error')
    document.title = document.title.replace(/^Error: /, '')
    if (!terms.checked) {
      const message = 'Confirm that you agree to the production terms of use'
      document.title = 'Error: ' + document.title
      column.querySelector('.govuk-caption-l').insertAdjacentHTML('beforebegin', `
        <div class="govuk-error-summary" data-module="govuk-error-summary" tabindex="-1">
          <div role="alert">
            <h2 class="govuk-error-summary__title">There is a problem</h2>
            <div class="govuk-error-summary__body">
              <ul class="govuk-list govuk-error-summary__list"><li><a href="#production-terms">${message}</a></li></ul>
            </div>
          </div>
        </div>`)
      group.classList.add('govuk-form-group--error')
      group.querySelector('.govuk-checkboxes').insertAdjacentHTML('beforebegin',
        `<p class="govuk-error-message" data-prototype-error><span class="govuk-visually-hidden">Error:</span> ${message}</p>`)
      column.querySelector('.govuk-error-summary').focus()
      return
    }

    // The real service would call Entra and APIM here, which can take a while.
    const status = document.getElementById('create-status')
    status.hidden = false
    document.getElementById('create-status-message').textContent = adding
      ? 'Adding to your production credentials. This can take up to a minute'
      : 'Creating your production credentials. This can take up to a minute'
    document.getElementById('create-status-dots').textContent = '...'
    document.getElementById('production-generate').disabled = true

    const result = productionCredentials.generate(application.id, waiting)
    try {
      window.sessionStorage.setItem(SECRET_KEY, JSON.stringify({ applicationId: application.id, secret: result.secret, added: result.added.map(api => api.value) }))
    } catch (e) { /* the next page says the secret is no longer shown */ }
    window.setTimeout(() => { window.location.href = `created/?id=${application.id}` }, 1200)
  })
}

// The credentials, with the secret shown once: reloading the page does not show it again.
function renderCreated () {
  const application = requireApplication()
  if (!application || !application.production) return
  fillName(application)
  let shown = null
  try {
    shown = JSON.parse(window.sessionStorage.getItem(SECRET_KEY) || 'null')
    window.sessionStorage.removeItem(SECRET_KEY)
  } catch (e) { /* treated as already shown */ }
  if (shown && shown.applicationId !== application.id) shown = null

  const production = application.production
  const added = shown ? production.apis.filter(api => shown.added.includes(api.value)) : []
  const secret = shown && shown.secret
  const regenerated = shown && shown.regenerated

  document.getElementById('production-panel-title').textContent = regenerated
    ? 'New client secret created'
    : secret ? 'Production credentials created' : shown ? 'Production access added' : 'Production credentials'
  document.title = `${document.getElementById('production-panel-title').textContent} - HMCTS API Marketplace - GOV.UK`
  document.getElementById('production-client-id').textContent = production.clientId

  document.getElementById('production-secret-once').hidden = !secret
  document.getElementById('production-secret-gone').hidden = !!secret || (shown && !regenerated && added.length > 0)
  document.getElementById('production-secret-same').hidden = !(shown && !secret && added.length)
  if (secret) document.getElementById('production-secret').textContent = secret

  const keys = added.length ? added : (regenerated ? [] : production.apis)
  document.getElementById('production-keys-section').hidden = !keys.length
  document.getElementById('production-keys').innerHTML = keys.map(api =>
    row(api.text, `<span class="apim-credential">${api.subscriptionKey}</span>`)).join('')
  document.getElementById('production-token-client-id').textContent = production.clientId
}

function renderRegenerate () {
  const application = requireApplication()
  if (!application) return
  fillName(application)
  if (!application.production || !features.isOn(REGENERATE)) {
    window.location.href = `../../detail/?id=${application.id}#production`
    return
  }
  document.getElementById('regenerate-secret').addEventListener('click', event => {
    event.preventDefault()
    const secret = productionCredentials.regenerateSecret(application.id)
    try {
      window.sessionStorage.setItem(SECRET_KEY, JSON.stringify({ applicationId: application.id, secret, added: [], regenerated: true }))
    } catch (e) { /* as above */ }
    window.location.href = `../created/?id=${application.id}`
  })
}

if (on()) {
  const current = page()
  if (current === 'production') renderGet()
  if (current === 'production/created') renderCreated()
  if (current === 'production/regenerate') renderRegenerate()
  if (/account\/applications\/detail\/?/.test(window.location.pathname)) renderApplicationProduction()
  if (/account\/production-credentials\/view\/?/.test(window.location.pathname)) renderRequestOutcome()
  renderAccountNotice()
}
