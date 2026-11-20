import { productionRequests } from './store.js?v=d0ea7e9560'

// Phase 2: production requests for each API (feature 'production-request-per-api'). Not in the
// real service, where a request belongs to a whole application and records no APIs. Here a
// request lists the APIs it asks for, each with its own status, because the Data Access Team
// review each API in an application separately.

export const FEATURE = 'production-request-per-api'

export const STATUS_TEXT = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  MORE_INFORMATION_NEEDED: 'More information needed',
  APPROVED: 'Approved',
  DECLINED: 'Declined'
}

export const TAG_CLASS = {
  SUBMITTED: 'govuk-tag--blue',
  IN_REVIEW: 'govuk-tag--light-blue',
  MORE_INFORMATION_NEEDED: 'govuk-tag--yellow',
  APPROVED: 'govuk-tag--green',
  DECLINED: 'govuk-tag--red'
}

function escapeHtml (value) {
  const div = document.createElement('div')
  div.textContent = value == null ? '' : String(value)
  return div.innerHTML
}

export function statusTag (status, id) {
  return `<strong class="govuk-tag ${TAG_CLASS[status] || 'govuk-tag--grey'}"${id ? ` id="${id}"` : ''}>${escapeHtml(STATUS_TEXT[status] || status)}</strong>`
}

// The APIs a request asks for. A request made before this feature names its APIs only, and they
// all share the request's status.
export function requestApis (request) {
  if (Array.isArray(request.apiItems)) return request.apiItems
  return (request.apis || []).map(name => ({ value: null, text: typeof name === 'string' ? name : name.text, status: request.status }))
}

// One line for a request's status: the shared status when every API has the same one, otherwise
// how many APIs have each, for example "1 approved, 1 submitted".
export function statusSummary (request) {
  const apis = requestApis(request)
  if (!apis.length) return STATUS_TEXT[request.status] || request.status
  const counts = new Map()
  apis.forEach(api => counts.set(api.status, (counts.get(api.status) || 0) + 1))
  if (counts.size === 1) return STATUS_TEXT[apis[0].status] || apis[0].status
  return Array.from(counts, ([status, count]) => `${count} ${(STATUS_TEXT[status] || status).toLowerCase()}`).join(', ')
}

// For each of an application's APIs, the request that covers it, if any. An API is matched by
// value, or by name for a request made before this feature.
export function coverage (application) {
  const requests = productionRequests.forApplicationAll(application.id)
  return application.apis.map(api => {
    for (const request of requests) {
      const match = requestApis(request).find(item => (item.value ? item.value === api.value : item.text === api.text))
      if (match) return { api, request, status: match.status }
    }
    return { api, request: null, status: null }
  })
}

export function uncovered (application) {
  return coverage(application).filter(entry => !entry.request).map(entry => entry.api)
}

// The application's most recent request, whose answers a new request starts from.
export function latestRequest (applicationId) {
  const requests = productionRequests.forApplicationAll(applicationId)
  return requests.length ? requests[requests.length - 1] : null
}
