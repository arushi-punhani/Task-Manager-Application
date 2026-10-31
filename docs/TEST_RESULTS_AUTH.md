# Authentication test evidence — Sprint 1, issue #49

## Scope and traceability

This report covers the Test Plan traceability cases:

- **TC-Auth-01 / TM-F-001:** registration with a valid email and a password of at least 8 characters creates an account and sends a verification email.
- **TC-Auth-02 / TM-F-002:** correct credentials return a valid session token; incorrect credentials are rejected.

The SRS defines these acceptance criteria. The Software Test Plan maps TM-F-001 to TC-Auth-01 and TM-F-002 to TC-Auth-02 in its Requirements Traceability Matrix. The Test Plan does not prescribe detailed step-by-step scripts, so the cases below operationalize those acceptance criteria without changing them.

## Automated coverage

| Test Plan case | Test file | Scenario | Expected result |
|---|---|---|---|
| TC-Auth-01 | `server/test/auth.test.js` | Valid registration, normalized email, bcrypt password hash, hashed verification token and mock verification email | HTTP 201; account returned; password is not stored as plaintext |
| TC-Auth-01 | `server/test/auth.test.js` | Invalid email and password shorter than 8 characters | HTTP 400; no account should be created |
| TC-Auth-01 | `server/test/auth.registration-login.test.js` | Exactly 8-character password boundary; invalid email; 7-character password | Valid boundary accepted with HTTP 201; invalid inputs rejected with HTTP 400 |
| TC-Auth-01 | `server/test/auth.registration-login.test.js` | Duplicate email | HTTP 409; no second verification email sent |
| TC-Auth-02 | `server/test/auth.test.js` | Correct credentials | HTTP 200; JWT signature and claims validated; server-side session persisted |
| TC-Auth-02 | `server/test/auth.registration-login.test.js` | Wrong password and unknown email | Both rejected with HTTP 401 and the same generic error message |
| TC-Auth-02 | `server/test/auth.registration-login.test.js` | Missing email or password | HTTP 400 before database access |
| TC-Auth-02 | `server/test/auth.registration-login.test.js` | Disabled account with otherwise correct credentials | HTTP 403; no session issued |

Related authentication regression checks already present in `server/test/auth.test.js` also cover email-verification token use, logout session revocation, and rejection of a JWT whose server-side session has been revoked. These are supporting checks, not additional acceptance criteria for TC-Auth-01/02.


## Execution record

**Execution date:** 30 October 2026

**New authentication tests:**
- Test file: `server/test/auth.registration-login.test.js`
- Tests: 5
- Passed: 5
- Failed: 0

**Complete backend regression suite:**
- Command: `npm test`
- Tests: 83
- Passed: 83
- Failed: 0

**Result:** PASS

All five additional authentication tests passed independently. The complete backend regression suite also passed with no failures.

The automated tests use mocked/injected database behavior and a mock verification email service. They do not replace a separate smoke test against a real PostgreSQL database.


## Environment

- Runtime: Node.js (project requires Node.js 18 or later; CI uses Node.js 20).
- Test runner: Node.js built-in `node:test`.
- Database: mocked/injected query layer for automated route tests.
- Email: mock verification mailer; no external email provider is called.
