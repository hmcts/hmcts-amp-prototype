import { applications, answers, productionRequests } from './store.js?v=cc300b8f3c'
import { features } from './features.js?v=cc300b8f3c'
import { DATA_COMBINED, DATA_RECIPIENTS, ORGANISATION_TYPES, OWN_TEAM_ONLY, label, triageRows } from './triage.js?v=cc300b8f3c'
import { FEATURE, coverage, latestRequest, requestApis, statusSummary, statusTag, uncovered } from './request-apis.js?v=cc300b8f3c'

// Stands in for ProductionCredentialsController in web-api-marketplace: the same questions,
// checks and messages, with the session and the backend replaced by browser storage.

const JOURNEY = 'production-credentials'
const MAX_LENGTH = 2000

const CALL_VOLUMES = { low: 'Low', medium: 'Medium', high: 'High' }

const STATUS_TEXT = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  MORE_INFORMATION_NEEDED: 'More information needed',
  APPROVED: 'Approved',
  DECLINED: 'Declined'
}

const TEXT_FIELDS = ['organisation', 'go-live-day', 'go-live-month', 'go-live-year', 'data-request', 'data-recipients-explanation', 'data-combined-description']
const RADIO_FIELDS = ['call-volume', 'organisation-type', 'data-combined']

function page () {
  const path = window.location.pathname.replace(/index\.html$/, '')
  const match = path.match(/account\/production-credentials\/(.*)$/)
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

function formatDate (iso) {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}

function apiCount (application) {
  return `${application.apis.length} ${application.apis.length === 1 ? 'API' : 'APIs'}`
}

function goLiveDate (values) {
  const [day, month, year] = ['go-live-day', 'go-live-month', 'go-live-year'].map(name => Number(values[name]))
  if (!values['go-live-day'] || !Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || year < 1000) {
    return undefined
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects 31 February and the like, which Date would otherwise roll into March.
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 ? date : undefined
}

function validate (values) {
  const errors = []
  const chosen = applications.find(values.application)
  if (!chosen) {
    errors.push({ name: 'application', text: 'Select the application you need production credentials for' })
  } else if (perApi()) {
    const open = uncovered(chosen).map(api => api.value)
    const picked = values['production-apis'] || []
    if (!open.length) {
      errors.push({ name: 'application', text: `Every API in ${chosen.name} is already in a production access request` })
    } else if (!picked.length || !picked.every(value => open.includes(value))) {
      errors.push({ name: 'production-apis', text: 'Select the APIs you need production access to' })
    }
  } else if (productionRequests.forApplication(chosen.id)) {
    errors.push({ name: 'application', text: `${chosen.name} already has a production access request` })
  }
  if (!ORGANISATION_TYPES.some(type => type.value === values['organisation-type'])) {
    errors.push({ name: 'organisation-type', text: 'Select your organisation' })
  }
  if (!values.organisation) {
    errors.push({ name: 'organisation', text: 'Enter your team name (and organisation if external to HMCTS)' })
  }
  const goLive = goLiveDate(values)
  if (!goLive) {
    errors.push({ name: 'go-live-day', text: 'Enter a real go-live date, for example 27 3 2027' })
  } else if (goLive.getTime() <= Date.now()) {
    errors.push({ name: 'go-live-day', text: 'The go-live date must be in the future' })
  }
  if (!CALL_VOLUMES[values['call-volume']]) {
    errors.push({ name: 'call-volume', text: 'Select the expected call volume' })
  }
  if (!values['data-request']) {
    errors.push({ name: 'data-request', text: 'Explain why you need access and how you will use the data' })
  } else if (values['data-request'].length > MAX_LENGTH) {
    errors.push({ name: 'data-request', text: `Your description must be ${MAX_LENGTH} characters or fewer` })
  }
  errors.push(...validateRecipients(values), ...validateCombined(values))
  return errors
}

function validateRecipients (values) {
  const chosen = Array.isArray(values['data-recipients']) ? values['data-recipients'] : []
  const explanation = values['data-recipients-explanation'] || ''
  if (!chosen.length || !chosen.every(value => DATA_RECIPIENTS.some(option => option.value === value))) {
    return [{ name: 'data-recipients', text: 'Select who will have access to, or receive, the data' }]
  }
  if (chosen.some(value => value !== OWN_TEAM_ONLY) && !explanation) {
    return [{ name: 'data-recipients-explanation', text: 'Briefly explain who will receive the data and why' }]
  }
  if (explanation.length > MAX_LENGTH) {
    return [{ name: 'data-recipients-explanation', text: `Your explanation must be ${MAX_LENGTH} characters or fewer` }]
  }
  return []
}

function validateCombined (values) {
  const chosen = values['data-combined'] || ''
  const description = values['data-combined-description'] || ''
  if (!DATA_COMBINED.some(option => option.value === chosen)) {
    return [{ name: 'data-combined', text: 'Select whether you will combine or link the API data with other data' }]
  }
  if (chosen !== 'no' && !description) {
    return [{ name: 'data-combined-description', text: 'Briefly describe the other data and what the combined data will be used for' }]
  }
  if (description.length > MAX_LENGTH) {
    return [{ name: 'data-combined-description', text: `Your description must be ${MAX_LENGTH} characters or fewer` }]
  }
  return []
}

// The real service's data-recipients and data-combined bundles: each follow-up box shows only once
// an answer needs it. Without JavaScript the real service always shows them.
function showFollowUpsWhenNeeded (form) {
  const pairs = [
    ['data-recipients-explanation-group', 'input[name="data-recipients"]', box => box.dataset.explanationNotNeeded !== 'true'],
    ['data-combined-description-group', 'input[name="data-combined"]', option => option.value !== 'no']
  ]
  pairs.forEach(([groupId, selector, needs]) => {
    const group = document.getElementById(groupId)
    const inputs = Array.from(form.querySelectorAll(selector))
    if (!group) return
    const update = () => { group.hidden = !inputs.some(input => input.checked && needs(input)) }
    inputs.forEach(input => input.addEventListener('change', update))
    update()
  })
}

function errorSummaryHtml (errors) {
  const items = errors.map(error => `<li><a href="#${error.name}">${escapeHtml(error.text)}</a></li>`).join('')
  return `
    <div class="govuk-error-summary" data-module="govuk-error-summary" tabindex="-1">
      <div role="alert">
        <h2 class="govuk-error-summary__title">There is a problem</h2>
        <div class="govuk-error-summary__body">
          <ul class="govuk-list govuk-error-summary__list">${items}</ul>
        </div>
      </div>
    </div>`
}

function clearErrors (container) {
  container.querySelectorAll('.govuk-error-summary').forEach(el => el.remove())
  container.querySelectorAll('[data-prototype-error]').forEach(el => el.remove())
  container.querySelectorAll('.govuk-form-group--error').forEach(el => el.classList.remove('govuk-form-group--error'))
  container.querySelectorAll('.govuk-input--error, .govuk-textarea--error').forEach(el => {
    el.classList.remove('govuk-input--error', 'govuk-textarea--error')
  })
  document.title = document.title.replace(/^Error: /, '')
}

// The markup the GOV.UK macros render when given an errorMessage, added after the page has loaded.
function showErrors (form, errors) {
  const column = form.parentElement
  clearErrors(column)
  if (!errors.length) return

  column.querySelector('h1').insertAdjacentHTML('beforebegin', errorSummaryHtml(errors))
  document.title = 'Error: ' + document.title

  errors.forEach(error => {
    const choice = form.querySelector(`input[name="${error.name}"]`)
    const field = error.name === 'application'
      ? form.querySelector('.govuk-radios')
      : error.name === 'go-live-day'
        ? form.querySelector('.govuk-date-input')
        : choice && (choice.type === 'radio' || choice.type === 'checkbox')
          ? choice.closest('.govuk-radios, .govuk-checkboxes')
          : document.getElementById(error.name)
    if (!field) return
    const group = field.closest('.govuk-form-group')
    group.classList.add('govuk-form-group--error')
    field.insertAdjacentHTML('beforebegin',
      `<p class="govuk-error-message" data-prototype-error><span class="govuk-visually-hidden">Error:</span> ${escapeHtml(error.text)}</p>`)
    if (error.name === 'go-live-day') {
      group.querySelectorAll('.govuk-date-input__input').forEach(input => input.classList.add('govuk-input--error'))
    } else if (field.tagName === 'TEXTAREA') {
      field.classList.add('govuk-textarea--error')
    } else if (field.tagName === 'INPUT') {
      field.classList.add('govuk-input--error')
    }
  })

  column.querySelector('.govuk-error-summary').focus()
}

function radiosHtml (choices, selected) {
  return choices.map((application, index) => {
    const id = index === 0 ? 'application' : `application-${index + 1}`
    return `
      <div class="govuk-radios__item">
        <input class="govuk-radios__input" id="${id}" name="application" type="radio" value="${application.id}"
          aria-describedby="${id}-item-hint"${application.id === selected ? ' checked' : ''}>
        <label class="govuk-label govuk-radios__label" for="${id}">${escapeHtml(application.name)}</label>
        <div id="${id}-item-hint" class="govuk-hint govuk-radios__hint">${apiCount(application)}</div>
      </div>`
  }).join('')
}

function perApi () {
  return features.isOn(FEATURE)
}

// The chosen application's APIs: those not yet in a request as checkboxes, the rest listed under
// them with where they stand.
function renderApiChoices (form, application, picked) {
  const list = document.getElementById('production-apis-list')
  const requested = document.getElementById('production-apis-requested')
  if (!list || !requested) return
  if (!application) {
    list.innerHTML = '<p class="govuk-body">Choose an application first.</p>'
    requested.innerHTML = ''
    return
  }
  const entries = coverage(application)
  const open = entries.filter(entry => !entry.request)
  list.innerHTML = open.length
    ? open.map((entry, index) => {
      const id = index === 0 ? 'production-apis' : `production-apis-${index + 1}`
      return `
        <div class="govuk-checkboxes__item">
          <input class="govuk-checkboxes__input" id="${id}" name="production-apis" type="checkbox" value="${entry.api.value}"${picked.includes(entry.api.value) ? ' checked' : ''}>
          <label class="govuk-label govuk-checkboxes__label" for="${id}">${escapeHtml(entry.api.text)}</label>
        </div>`
    }).join('')
    : `<p class="govuk-body">Every API in ${escapeHtml(application.name)} is already in a production access request.</p>`
  const done = entries.filter(entry => entry.request)
  requested.innerHTML = done.length
    ? `<p class="govuk-body govuk-!-margin-top-4 govuk-!-margin-bottom-1">Already in a request:</p>
       <ul class="govuk-list govuk-list--bullet">${done.map(entry =>
        `<li>${escapeHtml(entry.api.text)}: ${escapeHtml(STATUS_TEXT[entry.status] || entry.status)}, in
          <a class="govuk-link" href="view/?reference=${entry.request.reference}">${entry.request.reference}</a></li>`).join('')}</ul>`
    : ''
}

// Starts a further request for an application from the answers in its last one. Only empty
// answers are filled in, and the go-live date is left for the person to give again.
function prefillFrom (form, request) {
  const notice = document.getElementById('production-prefilled')
  if (notice) notice.innerHTML = ''
  if (!request) return
  const fill = (name, value) => {
    if (!value) return
    const field = document.getElementById(name)
    if (field && !field.value) {
      field.value = value
      field.dispatchEvent(new Event('input'))
    }
  }
  const pick = (name, value) => {
    if (!value || form.querySelector(`input[name="${name}"]:checked`)) return
    const radio = form.querySelector(`input[name="${name}"][value="${value}"]`)
    if (radio) radio.checked = true
  }
  pick('organisation-type', request.organisationType)
  fill('organisation', request.organisation)
  pick('call-volume', request.callVolume)
  fill('data-request', request.dataRequest)
  if (!form.querySelector('input[name="data-recipients"]:checked')) {
    (request.dataRecipients || []).forEach(value => {
      const box = form.querySelector(`input[name="data-recipients"][value="${value}"]`)
      if (box) box.checked = true
    })
  }
  fill('data-recipients-explanation', request.dataRecipientsExplanation)
  pick('data-combined', request.dataCombined)
  fill('data-combined-description', request.dataCombinedDescription)
  form.querySelectorAll('input[name="data-recipients"], input[name="data-combined"]').forEach(input => input.dispatchEvent(new Event('change')))
  if (notice) {
    notice.innerHTML = `
      <div class="govuk-inset-text" id="prefilled-from">
        We have filled in your answers from request ${request.reference}. Check they are still right for
        the APIs you are asking for now, and give your go-live date.
      </div>`
  }
}

function renderForm () {
  const form = document.getElementById('production-form')
  const none = document.getElementById('no-applications')
  if (!form || !none) return

  // Only applications without a production request are offered: the backend allows one each.
  // With requests for each API, any application with an API not yet in a request.
  const choices = applications.all().filter(application => perApi()
    ? uncovered(application).length > 0
    : !productionRequests.forApplication(application.id))
  none.hidden = choices.length > 0
  form.hidden = choices.length === 0
  if (!choices.length) return

  const saved = { ...answers.get(JOURNEY), ...(query('application') ? { application: query('application') } : {}) }
  form.querySelector('.govuk-radios').innerHTML = radiosHtml(choices, saved.application)

  RADIO_FIELDS.forEach(name => {
    const radio = form.querySelector(`input[name="${name}"][value="${saved[name]}"]`)
    if (radio) radio.checked = true
  })
  ;(saved['data-recipients'] || []).forEach(value => {
    const box = form.querySelector(`input[name="data-recipients"][value="${value}"]`)
    if (box) box.checked = true
  })
  TEXT_FIELDS.forEach(name => {
    const field = document.getElementById(name)
    if (field && saved[name]) {
      field.value = saved[name]
      field.dispatchEvent(new Event('input'))
    }
  })
  showFollowUpsWhenNeeded(form)

  if (perApi()) {
    const hint = document.getElementById('application-hint')
    if (hint) hint.textContent = 'You then choose which of its APIs you need production access to.'
    const update = isChange => {
      const application = applications.find((form.querySelector('input[name="application"]:checked') || {}).value)
      const keep = !isChange && application && saved.application === application.id
      renderApiChoices(form, application, keep ? (saved['production-apis'] || []) : [])
      // A saved draft for this application keeps its own answers.
      if (application && !(keep && answers.get(JOURNEY).application)) prefillFrom(form, latestRequest(application.id))
    }
    form.querySelectorAll('input[name="application"]').forEach(radio => radio.addEventListener('change', () => update(true)))
    update(false)
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    const checked = name => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || ''
    const values = { application: checked('application') }
    if (perApi()) values['production-apis'] = Array.from(form.querySelectorAll('input[name="production-apis"]:checked')).map(box => box.value)
    RADIO_FIELDS.forEach(name => { values[name] = checked(name) })
    values['data-recipients'] = Array.from(form.querySelectorAll('input[name="data-recipients"]:checked')).map(box => box.value)
    TEXT_FIELDS.forEach(name => { values[name] = (document.getElementById(name).value || '').trim() })

    const errors = validate(values)
    showErrors(form, errors)
    if (errors.length) return

    answers.set(JOURNEY, values)
    window.location.href = 'check-answers/'
  })
}

function summaryRowsHtml (rows, changeHref) {
  return rows.map(row => `
    <div class="govuk-summary-list__row">
      <dt class="govuk-summary-list__key">${escapeHtml(row.key)}</dt>
      <dd class="govuk-summary-list__value">${escapeHtml(row.value)}</dd>
      ${changeHref ? `<dd class="govuk-summary-list__actions"><a class="govuk-link" href="${changeHref}">Change<span class="govuk-visually-hidden"> ${escapeHtml(row.key.toLowerCase())}</span></a></dd>` : ''}
    </div>`).join('')
}

// The triage answers as the real service sends them to the backend. The two explanations are left
// out when empty rather than sent blank.
function submission (draft) {
  return {
    organisationType: draft['organisation-type'],
    dataRecipients: draft['data-recipients'] || [],
    dataCombined: draft['data-combined'],
    ...(draft['data-recipients-explanation'] ? { dataRecipientsExplanation: draft['data-recipients-explanation'] } : {}),
    ...(draft['data-combined-description'] ? { dataCombinedDescription: draft['data-combined-description'] } : {})
  }
}

function renderCheckAnswers () {
  const draft = answers.get(JOURNEY)
  const application = applications.find(draft.application)
  if (!application || validate(draft).length) {
    window.location.href = '../'
    return
  }

  // With requests for each API, only the APIs chosen; otherwise all of the application's.
  const chosenApis = perApi()
    ? application.apis.filter(api => (draft['production-apis'] || []).includes(api.value))
    : application.apis
  const list = document.getElementById('production-answers')
  if (list) {
    list.innerHTML = summaryRowsHtml([
      { key: 'Application', value: application.name },
      { key: 'APIs', value: chosenApis.map(api => api.text).join(', ') || 'None' },
      { key: 'Organisation', value: label(ORGANISATION_TYPES, draft['organisation-type']) },
      { key: 'Team name (and organisation if external to HMCTS?)', value: draft.organisation },
      { key: 'Go-live date', value: formatDate(goLiveDate(draft).toISOString()) },
      { key: 'Expected call volume', value: CALL_VOLUMES[draft['call-volume']] },
      { key: 'Data request', value: draft['data-request'] },
      ...triageRows({ ...submission(draft), ...(draft['data-combined'] === 'no' ? { dataCombinedDescription: '' } : {}) })
    ], '../')
  }

  const form = document.querySelector('form')
  form.addEventListener('submit', event => {
    event.preventDefault()
    const request = productionRequests.create({
      applicationId: application.id,
      applicationName: application.name,
      apis: chosenApis.map(api => api.text),
      ...(perApi() ? { apiItems: chosenApis.map(api => ({ value: api.value, text: api.text, status: 'SUBMITTED' })) } : {}),
      organisation: draft.organisation,
      goLiveDate: goLiveDate(draft).toISOString().slice(0, 10),
      callVolume: draft['call-volume'],
      dataRequest: draft['data-request'],
      ...submission(draft)
    })
    if (!request) {
      // What the real service shows when the backend refuses a second request for an application.
      const column = form.parentElement
      clearErrors(column)
      const text = perApi()
        ? 'One of these APIs is already in a production access request.'
        : `${application.name} already has a production access request.`
      column.querySelector('h1').insertAdjacentHTML('beforebegin',
        errorSummaryHtml([{ name: 'production-submit', text }]))
      column.querySelector('.govuk-error-summary').focus()
      return
    }
    answers.clear(JOURNEY)
    window.location.href = `../confirmation/?reference=${request.reference}`
  })
}

function requireRequest () {
  const request = productionRequests.find(query('reference'))
  if (!request) window.location.href = '../../'
  return request
}

function renderConfirmation () {
  const request = requireRequest()
  if (!request) return
  document.getElementById('confirmation-reference').textContent = request.reference
  document.getElementById('view-request').setAttribute('href', `../view/?reference=${request.reference}`)
}

function renderView () {
  const request = requireRequest()
  if (!request) return
  document.title = `Production credentials request ${request.reference} - HMCTS API Marketplace - GOV.UK`
  document.getElementById('request-reference').textContent = request.reference
  document.getElementById('request-status').textContent = perApi() ? statusSummary(request) : (STATUS_TEXT[request.status] || request.status)
  document.getElementById('request-submitted').textContent = formatDate(request.submittedAt)
  const apiList = document.getElementById('request-apis')
  if (apiList && perApi()) {
    apiList.innerHTML = requestApis(request).map(api => `
      <div class="govuk-summary-list__row">
        <dt class="govuk-summary-list__key">${escapeHtml(api.text)}</dt>
        <dd class="govuk-summary-list__value">${statusTag(api.status)}</dd>
      </div>`).join('')
  }
  document.getElementById('request-answers').innerHTML = summaryRowsHtml([
    { key: 'Application', value: request.applicationName },
    ...(request.organisationType ? [{ key: 'Organisation', value: label(ORGANISATION_TYPES, request.organisationType) }] : []),
    { key: 'Team name (and organisation if external to HMCTS?)', value: request.organisation },
    { key: 'Go-live date', value: formatDate(request.goLiveDate) },
    { key: 'Expected call volume', value: CALL_VOLUMES[request.callVolume] || request.callVolume },
    { key: 'Data request', value: request.dataRequest },
    ...triageRows(request)
  ])
}

// My requests on the account page, which the real service renders from the backend.
function renderMyRequests () {
  const empty = document.getElementById('requests-empty')
  if (!empty) return
  const all = productionRequests.all()
  if (!all.length) return

  const rows = all.map(request => `
    <tr class="govuk-table__row">
      <td class="govuk-table__cell"><a class="govuk-link apim-reference" href="production-credentials/view/?reference=${request.reference}">${request.reference}</a></td>
      <td class="govuk-table__cell">Production credentials</td>
      <td class="govuk-table__cell">${formatDate(request.submittedAt)}</td>
      <td class="govuk-table__cell">${escapeHtml(perApi() ? statusSummary(request) : (STATUS_TEXT[request.status] || request.status))}</td>
    </tr>`).join('')

  empty.insertAdjacentHTML('afterend', `
    <table class="govuk-table">
      <caption class="govuk-table__caption govuk-visually-hidden">Requests you have submitted</caption>
      <thead class="govuk-table__head">
        <tr class="govuk-table__row">
          <th scope="col" class="govuk-table__header">Reference</th>
          <th scope="col" class="govuk-table__header">Type</th>
          <th scope="col" class="govuk-table__header">Submitted</th>
          <th scope="col" class="govuk-table__header">Status</th>
        </tr>
      </thead>
      <tbody class="govuk-table__body">${rows}</tbody>
    </table>`)
  empty.remove()
}

// The application page's Going live link preselects that application, as in the real service.
function linkGoingLive () {
  const link = document.getElementById('going-live')
  const id = query('id')
  if (link && id) link.setAttribute('href', `../../production-credentials/?application=${id}`)
}

const current = page()
if (current === '') renderForm()
if (current === 'check-answers') renderCheckAnswers()
if (current === 'confirmation') renderConfirmation()
if (current === 'view') renderView()
renderMyRequests()
linkGoingLive()
