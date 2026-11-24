// The triage questions on the production credentials request form, kept in step with
// ORGANISATION_TYPES, DATA_RECIPIENTS and DATA_COMBINED in ProductionCredentialsController.ts in
// web-api-marketplace. build.mjs turns them into the form's radios and checkboxes, and
// production-credentials.js and admin.js use them to check and show the answers.

/** "Expected call volume". */
export const CALL_VOLUMES = { low: 'Low', medium: 'Medium', high: 'High' }

/** "Organisation", which helps the Data Access Team triage a request. */
export const ORGANISATION_TYPES = [
  { value: 'hmcts', text: 'HMCTS' },
  { value: 'moj', text: 'Ministry of Justice' },
  { value: 'other-government', text: 'Other government department/public body' },
  { value: 'external', text: 'Other external organisation' }
]

/**
 * "Who will have access to, or receive, the data?". Choosing only the first means nobody else
 * receives the data, so nothing needs explaining; choosing any other option asks for an explanation.
 */
export const OWN_TEAM_ONLY = 'own-team'
export const DATA_RECIPIENTS = [
  { value: OWN_TEAM_ONLY, text: 'Me/my immediate team only' },
  { value: 'other-hmcts', text: 'Other HMCTS teams' },
  { value: 'wider-moj', text: 'Wider MOJ' },
  { value: 'other-government', text: 'Another government department/public body' },
  { value: 'supplier', text: 'Supplier/contract/delivery partner' },
  { value: 'external', text: 'Other external organisation' },
  { value: 'public', text: 'The data will be published or used in a public-facing service' }
]

/** "Will you combine or link the API data with other data?". Yes or Unsure asks what it is combined with. */
export const DATA_COMBINED = [
  { value: 'no', text: 'No' },
  { value: 'yes', text: 'Yes' },
  { value: 'unsure', text: 'Unsure' }
]

export function label (options, value) {
  return (options.find(option => option.value === value) || {}).text || value || ''
}

/**
 * The triage answers on a request, as summary rows. Each is left out when the request has none,
 * as on requests made before the questions were added, which carry proposed outputs instead.
 */
export function triageRows (request) {
  const rows = []
  if (request.dataRecipients && request.dataRecipients.length) {
    rows.push({ key: 'Who will have access to, or receive, the data?', value: request.dataRecipients.map(value => label(DATA_RECIPIENTS, value)).join(', ') })
  }
  if (request.dataRecipientsExplanation) {
    rows.push({ key: 'Who will receive the data and why', value: request.dataRecipientsExplanation })
  }
  if (request.dataCombined) {
    rows.push({ key: 'Will you combine or link the API data with other data?', value: label(DATA_COMBINED, request.dataCombined) })
  }
  if (request.dataCombinedDescription) {
    rows.push({ key: 'Other data and what the combined data will be used for', value: request.dataCombinedDescription })
  }
  if (request.proposedOutputs) {
    rows.push({ key: 'Proposed outputs', value: request.proposedOutputs })
  }
  return rows
}

/**
 * A request's answers as summary rows, in the order they were asked. The requester's request page
 * and the admin request page both show them, so the two pages read the same.
 */
export function answerRows (request, formatDate) {
  return [
    { key: 'Application', value: request.applicationName },
    ...(request.organisationType ? [{ key: 'Organisation', value: label(ORGANISATION_TYPES, request.organisationType) }] : []),
    { key: 'Team name (and organisation if external to HMCTS?)', value: request.organisation },
    { key: 'Go-live date', value: formatDate(request.goLiveDate) },
    { key: 'Expected call volume', value: CALL_VOLUMES[request.callVolume] || request.callVolume },
    { key: 'Data request', value: request.dataRequest },
    ...triageRows(request)
  ]
}
