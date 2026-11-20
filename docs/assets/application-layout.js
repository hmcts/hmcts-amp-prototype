import { features } from './features.js?v=2f42fea9a7'

// Phase 2, 'application-page-tabs': the application page's Try it now and Production sections as
// GOV.UK tabs, with the application's details above and Delete below. Runs before initAll in
// main.js, so the tabs start up.

const TABS = 'application-page-tabs'

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

  // Tab labels can't carry a tag, so credentials waiting to be collected are flagged above the tabs.
  const ready = document.getElementById('production-ready')
  if (ready && ready.innerHTML.trim() && !ready.closest('[hidden]')) {
    wrapper.insertAdjacentHTML('beforebegin', `
      <div class="govuk-inset-text" id="production-ready-prompt">
        Production access has been approved.
        <a class="govuk-link" href="#production">Get your production credentials</a>.
      </div>`)
  }
}

function layout () {
  const sections = ['try-it-now', 'production'].map(id => document.getElementById(id))
  if (sections.some(section => !section)) return
  if (features.isOn(TABS)) tabs(sections)
}

layout()
