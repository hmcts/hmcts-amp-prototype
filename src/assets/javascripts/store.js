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
  // The example user, with the admin app role when asked for (BYPASS_ENTRA_ADMIN in the real service).
  signIn (asAdmin) {
    const signedIn = { ...DUMMY_USER, roles: asAdmin ? [AMP_ADMIN] : [] }
    write(USER_KEY, signedIn)
    write(LAST_SIGN_IN_KEY, new Date().toISOString())
    return signedIn
  },
  // isMarketplaceAdmin in the real service's AdminRole.ts.
  isAdmin () {
    const current = this.current()
    return !!current && (current.roles || []).includes(AMP_ADMIN)
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
      createdAt: new Date().toISOString()
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
    this.update(id, { secretCreatedAt: new Date().toISOString() })
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
