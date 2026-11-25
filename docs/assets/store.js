// Stands in for the backend the real service talks to. Everything lives in this browser:
// nothing is sent anywhere, and clearing site data resets the prototype.

const USER_KEY = 'ampPrototypeUser'
const APPS_KEY = 'ampPrototypeApplications'

// The same fixed user as EntraBypass in web-api-marketplace, so screenshots match.
export const DUMMY_USER = {
  oid: '00000000-0000-4000-8000-00000000d0e0',
  email: 'john.doe@example.com',
  name: 'John Doe'
}

// A signed-in user carries `roles`, as in the real service: the app roles Entra put in the ID token.
// The Marketplace Team hold AMP_ADMIN, which opens the Admin tab; everyone else has none.
// An admin can do everything a user can.
export const AMP_ADMIN = 'amp_admin'
// Phase 2, getting production credentials yourself: the Data Access Team record their own decisions
// on production requests (decided 25 Nov 2026), so they need an app role of their own. It is not in
// the real service and its name is made up. It opens the Admin tab too.
export const DATA_ACCESS_TEAM = 'amp_data_access'
const ROLES = { admin: AMP_ADMIN, 'data-access': DATA_ACCESS_TEAM }

const LAST_SIGN_IN_KEY = 'ampPrototypeLastSignIn'

function read (key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) {
    return fallback
  }
}

function write (key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (e) { /* private browsing */ }
}

export const user = {
  current () {
    const stored = read(USER_KEY, null)
    if (!stored || Array.isArray(stored.roles)) return stored
    // Signed in by an older version of the prototype, with a role or permissions instead of roles.
    const wasAdmin = /^admin$/i.test(stored.role || '') || (stored.permissions || []).includes('admin')
    return { ...DUMMY_USER, roles: wasAdmin ? [AMP_ADMIN] : [] }
  },
  // The example user, with the admin app role when asked for (BYPASS_ENTRA_ADMIN in the real service),
  // or the Data Access Team's: role is 'admin', 'data-access' or nothing.
  signIn (role) {
    const signedIn = { ...DUMMY_USER, roles: ROLES[role] ? [ROLES[role]] : [] }
    write(USER_KEY, signedIn)
    write(LAST_SIGN_IN_KEY, new Date().toISOString())
    return signedIn
  },
  // isMarketplaceAdmin in the real service's AdminRole.ts. Here the Data Access Team get the Admin pages too.
  isAdmin () {
    return this.hasRole(AMP_ADMIN) || this.hasRole(DATA_ACCESS_TEAM)
  },
  // Only the Data Access Team record decisions on production requests.
  isDataAccessTeam () {
    return this.hasRole(DATA_ACCESS_TEAM)
  },
  hasRole (role) {
    const current = this.current()
    return !!current && (current.roles || []).includes(role)
  },
  // When the example user last signed in, for the admin pages' Users table.
  lastSignIn () {
    return read(LAST_SIGN_IN_KEY, null)
  },
  signOut () {
    try {
      window.localStorage.removeItem(USER_KEY)
    } catch (e) { /* as above */ }
  }
}

export const applications = {
  all () {
    return read(APPS_KEY, [])
  },
  find (id) {
    return this.all().find(application => application.id === id) || null
  },
  create (details) {
    const application = {
      id: crypto.randomUUID(),
      name: details.name,
      description: details.description || '',
      apis: details.apis || [],
      environment: details.environment || 'Sandbox',
      clientId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      // Entra refuses the role grant for a minute or two after an application is made.
      accessGranted: false
    }
    write(APPS_KEY, this.all().concat(application))
    return application
  },
  update (id, changes) {
    const updated = this.all().map(a => (a.id === id ? { ...a, ...changes } : a))
    write(APPS_KEY, updated)
    return this.find(id)
  },
  remove (id) {
    write(APPS_KEY, this.all().filter(a => a.id !== id))
  },
  // A client secret is shown once in the real service and never retrievable again.
  newSecret (id) {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    // The backend keeps the secret's first 3 characters as a hint, and Entra's expiry: 2 years.
    const now = new Date()
    const expires = new Date(now)
    expires.setFullYear(expires.getFullYear() + 2)
    this.update(id, { secretCreatedAt: now.toISOString(), secretHint: secret.slice(0, 3), secretExpiresAt: expires.toISOString() })
    return secret
  }
}

const REQUESTS_KEY = 'ampPrototypeProductionRequests'
// The backend's reference alphabet: no 0, 1, I or O, so a reference can be read out.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newReference () {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length])
    .join('')
  return 'PCR-' + suffix
}

// Production credentials requests. The real service stores them in the backend, which allows
// one per application, and nothing ever moves them on from Submitted: review is offline.
// With requests for each API (a Phase 2 feature), an application can have several, each
// listing its APIs in `apiItems` with a status for each.
export const productionRequests = {
  all () {
    return read(REQUESTS_KEY, [])
  },
  find (reference) {
    return this.all().find(request => request.reference === reference) || null
  },
  forApplication (applicationId) {
    return this.all().find(request => request.applicationId === applicationId) || null
  },
  forApplicationAll (applicationId) {
    return this.all().filter(request => request.applicationId === applicationId)
  },
  // Refuses a second request for an application, as the backend does, unless the request names
  // its APIs (`apiItems`): then it refuses only an API that is already in a request.
  create (details) {
    if (Array.isArray(details.apiItems)) {
      // An older request names its APIs only, so names count as taken too.
      const taken = this.forApplicationAll(details.applicationId)
        .flatMap(request => request.apiItems ? request.apiItems.map(api => api.text) : (request.apis || []))
      if (!details.apiItems.length || details.apiItems.some(api => taken.includes(api.text))) return null
    } else if (this.forApplication(details.applicationId)) {
      return null
    }
    const request = {
      ...details,
      reference: newReference(),
      status: 'SUBMITTED',
      // Only the prototype's example data gives its own date.
      submittedAt: details.submittedAt || new Date().toISOString()
    }
    write(REQUESTS_KEY, this.all().concat(request))
    return request
  },
  // Not in the real service, where nothing moves a request on: the Data Access Team record their
  // decision (Phase 2, 'production-credentials-self-serve').
  update (reference, changes) {
    write(REQUESTS_KEY, this.all().map(request => (request.reference === reference ? { ...request, ...changes } : request)))
    return this.find(reference)
  }
}

function randomHex (bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Production credentials for an application, generated by the requester once access is approved
// (Phase 2, 'production-credentials-self-serve'). Kept on the application as `production`:
// its own client ID, when the secret was made, and a subscription key for each approved API.
// The secret itself is returned once and never stored: only its first 3 characters, to show masked.
export const productionCredentials = {
  // Creates the credentials, or adds keys for newly approved APIs to existing ones. Returns the
  // new secret only when one is made.
  generate (applicationId, apis) {
    const application = applications.find(applicationId)
    if (!application) return null
    const now = new Date().toISOString()
    const existing = application.production
    const keys = apis
      .filter(api => !(existing && existing.apis.some(key => key.value === api.value)))
      .map(api => ({ value: api.value, text: api.text, subscriptionKey: randomHex(16), createdAt: now }))
    if (existing) {
      applications.update(applicationId, { production: { ...existing, apis: existing.apis.concat(keys) } })
      return { secret: null, added: keys }
    }
    const secret = randomHex(24)
    applications.update(applicationId, {
      production: { clientId: crypto.randomUUID(), createdAt: now, secretCreatedAt: now, secretHint: secret.slice(0, 3), apis: keys }
    })
    return { secret, added: keys }
  },
  regenerateSecret (applicationId) {
    const application = applications.find(applicationId)
    if (!application || !application.production) return null
    const secret = randomHex(24)
    applications.update(applicationId, { production: { ...application.production, secretCreatedAt: new Date().toISOString(), secretHint: secret.slice(0, 3) } })
    return secret
  }
}

// Multi-step journeys keep their answers here until the final confirmation.
export const answers = {
  get (journey) {
    return read('ampPrototypeAnswers:' + journey, {})
  },
  set (journey, values) {
    write('ampPrototypeAnswers:' + journey, { ...this.get(journey), ...values })
  },
  clear (journey) {
    try {
      window.localStorage.removeItem('ampPrototypeAnswers:' + journey)
    } catch (e) { /* as above */ }
  }
}
