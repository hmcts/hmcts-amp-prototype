import { features } from './features.js'
import { applications, productionRequests, user } from './store.js'
import { OWN_TEAM_ONLY } from './triage.js'

// Not in the real service: an application part-way through going live, to show production
// requests for each API without filling in the forms first. Added once; after that the button
// opens it.
const EXAMPLE_NAME = 'Case progress tracker'
const EXAMPLE_APIS = [
  { value: 'court-schedule', text: 'Court Schedule' },
  { value: 'hearing-results', text: 'Hearing Results' },
  { value: 'defendant-details', text: 'Defendant Details' }
]

function addExample () {
  if (!user.current()) user.signIn(false)
  let application = applications.all().find(a => a.name === EXAMPLE_NAME)
  if (!application) {
    application = applications.create({
      name: EXAMPLE_NAME,
      description: 'Shows victims and witnesses where their case has got to.',
      apis: EXAMPLE_APIS
    })
    const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString()
    const goLive = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
    applications.update(application.id, { createdAt: daysAgo(30) })
    productionRequests.create({
      applicationId: application.id,
      applicationName: EXAMPLE_NAME,
      apis: ['Court Schedule', 'Hearing Results'],
      apiItems: [
        { value: 'court-schedule', text: 'Court Schedule', status: 'APPROVED' },
        { value: 'hearing-results', text: 'Hearing Results', status: 'SUBMITTED' }
      ],
      organisation: 'Example Witness Care Unit',
      goLiveDate: goLive,
      callVolume: 'low',
      dataRequest: 'Hearing dates and results so we can tell victims and witnesses when their hearing is and what happened.',
      organisationType: 'other-government',
      dataRecipients: [OWN_TEAM_ONLY],
      dataCombined: 'no',
      submittedAt: daysAgo(12)
    })
  }
  const settings = window.location.pathname.replace(/prototype-settings\/.*$/, '')
  window.location.href = `${settings}account/applications/detail/?id=${application.id}`
}

function escapeHtml (value) {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

function render () {
  const form = document.getElementById('features-form')
  if (!form) return
  const all = features.all()
  document.getElementById('features-none').hidden = all.length > 0
  form.hidden = all.length === 0
  document.getElementById('features-share').hidden = all.length === 0
  if (!all.length) return

  document.getElementById('features-list').innerHTML = all.map((feature, index) => {
    const id = index === 0 ? 'features' : `features-${index + 1}`
    return `
      <div class="govuk-checkboxes__item">
        <input class="govuk-checkboxes__input" id="${id}" name="features" type="checkbox" value="${feature.id}"
          aria-describedby="${id}-item-hint"${feature.on ? ' checked' : ''}>
        <label class="govuk-label govuk-checkboxes__label" for="${id}">${escapeHtml(feature.name)}</label>
        <div id="${id}-item-hint" class="govuk-hint govuk-checkboxes__hint">
          ${escapeHtml(feature.description)}${feature.default ? ' On by default.' : ''}
        </div>
      </div>`
  }).join('')

  // Save by navigating to ?features=…, which features.js applies and remembers on load.
  form.addEventListener('submit', event => {
    event.preventDefault()
    const on = Array.from(form.querySelectorAll('input[name="features"]:checked')).map(input => input.value)
    window.location.search = '?features=' + (on.length ? on.join(',') : 'none') + '&saved=1'
  })

  const share = new URL(window.location.href.replace(/prototype-settings\/.*$/, ''))
  share.search = '?features=' + features.linkValue()
  const link = document.getElementById('features-link')
  link.href = share.toString()
  link.textContent = share.toString()

  if (new URLSearchParams(window.location.search).get('saved')) {
    form.insertAdjacentHTML('beforebegin', `
      <div class="govuk-notification-banner govuk-notification-banner--success" role="alert" data-module="govuk-notification-banner">
        <div class="govuk-notification-banner__header">
          <h2 class="govuk-notification-banner__title">Success</h2>
        </div>
        <div class="govuk-notification-banner__content">
          <p class="govuk-notification-banner__heading">Your settings have been saved</p>
        </div>
      </div>`)
  }
}

render()

const example = document.getElementById('example-data')
if (example) example.addEventListener('click', event => { event.preventDefault(); addExample() })
