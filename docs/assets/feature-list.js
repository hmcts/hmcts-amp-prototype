export default [
  {
    "id": "admin-dashboard",
    "name": "Admin dashboard",
    "description": "A read-only view for the Marketplace Team of every registered user, application and production credentials request, on the Admin page that admins already see.",
    "default": false
  },
  {
    "id": "production-request-per-api",
    "name": "Production requests for each API",
    "description": "A production credentials request covers the APIs you choose, and each API gets its own outcome, because the Data Access Team review each API in an application. You can ask for more of an application's APIs later, with your earlier answers filled in.",
    "default": false
  },
  {
    "id": "production-credentials-self-serve",
    "name": "Get production credentials yourself",
    "description": "Once the Data Access Team approve a production request, the Marketplace Team record the decision on the Admin pages. The requester is emailed, signs in and generates their own production credentials, with the client secret shown once.",
    "requires": [
      "admin-dashboard"
    ],
    "default": false
  },
  {
    "id": "application-page-tabs",
    "name": "Application page in tabs",
    "description": "The application page splits into a Try it now tab and a Production tab, with the application's details above them and Delete below. Links about production access open the Production tab. If both application page layouts are on, the page uses tabs.",
    "default": false
  },
  {
    "id": "application-page-cards",
    "name": "Application page in summary cards",
    "description": "The application page groups Try it now and Production into a summary card each, so everything stays on one page but each environment is in its own box.",
    "default": false
  }
]
