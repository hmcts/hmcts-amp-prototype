import { features } from './features.js?v=a60cb05ac2'

// Phase 2: two layouts for the application page, to choose between. Both keep the application's
// details above and Delete below, and split the rest into Try it now and Production.
// 'application-page-tabs' makes the two sections GOV.UK tabs; 'application-page-cards' makes them
// summary cards. If both are on, tabs win. Runs before initAll in main.js, so the tabs start up.

const TABS = 'application-page-tabs'
const CARDS = 'application-page-cards'

function tabs (sections) {
  const wrapper = document.createElement('div')
  wrapper.className = 'govuk-tabs'
  wrapper.id = 'application-tabs'
  wrapper.setAttribute('data-module', 'govuk-tabs')
  wrapper.innerHTML = `
    <h2 class="govuk-tabs__title">Contents</h2>
    <ul class="govuk-tabs__list">${sections.map((section, i) => `
      <li class="govuk-tabs__list-item${i ? '' : ' govuk-tabs__list-item--selected'}">
        <a class="govuk-tabs__tab" href="#${section.id}">${section.dataset.sectionTitle}</a>
      </li>`).join('')}
    </ul>`
  sections[0].before(wrapper)
  sections.forEach((section, i) => {
    section.classList.add('govuk-tabs__panel')
    if (i) section.classList.add('govuk-tabs__panel--hidden')
    wrapper.append(section)
  })
}

// A heading inside a card drops a level, so the card's title stays the section's heading.
function demote (heading) {
  const smaller = document.createElement('h3')
  smaller.className = 'govuk-heading-s'
  if (heading.id) smaller.id = heading.id
  smaller.innerHTML = heading.innerHTML
  heading.replaceWith(smaller)
}

function card (section, actions) {
  const content = document.createElement('div')
  content.className = 'govuk-summary-card__content'
  content.append(...section.childNodes)
  section.classList.add('govuk-summary-card')
  section.innerHTML = `
    <div class="govuk-summary-card__title-wrapper">
      <h2 class="govuk-summary-card__title">${section.dataset.sectionTitle}</h2>
      ${actions.length ? `<ul class="govuk-summary-card__actions">${actions.map(action =>
        `<li class="govuk-summary-card__action"><a class="govuk-link" href="${action.href}" id="${action.id}">${action.text}</a></li>`).join('')}</ul>` : ''}
    </div>`
  section.append(content)
  content.querySelectorAll('h2.govuk-heading-m').forEach(demote)
}

function cards ([sandbox, production]) {
  // Add or remove APIs moves to the card's header, as a summary card action.
  const change = document.getElementById('change-apis')
  const actions = change ? [{ text: 'Add or remove APIs', href: change.getAttribute('href'), id: 'change-apis-card' }] : []
  if (change) change.remove()
  card(sandbox, actions)

  // The card's title says Production, so Going live is not needed as well.
  const goingLive = document.getElementById('going-live-heading')
  if (goingLive) goingLive.remove()
  card(production, [])
}

function layout () {
  const sections = ['try-it-now', 'production'].map(id => document.getElementById(id))
  if (sections.some(section => !section)) return
  if (features.isOn(TABS)) tabs(sections)
  else if (features.isOn(CARDS)) cards(sections)
}

layout()
